//! Raw deflate decoding (RFC 1951), written from the RFC so the stub links no crate (ADR-0054 consequence 5).
//!
//! Each payload chunk is one independent raw deflate stream whose decoded length the index states, so the decoder
//! writes into an exact, preallocated slice and refuses any stream that would decode to more or fewer bytes.
//! Codes up to `PRIMARY_BITS` long decode by one table lookup; the rare longer ones by the canonical walk of the RFC's
//! section 3.2.2, which needs no second table.

const PRIMARY_BITS: u32 = 10;
const MAX_BITS: usize = 15;

/// Section 3.2.5: the base length of length codes 257..285 and their extra bits.
const LENGTH_BASE: [u16; 29] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA: [u8; 29] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
/// Section 3.2.5: the base distance of distance codes 0..29 and their extra bits.
const DIST_BASE: [u16; 30] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA: [u8; 30] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
/// Section 3.2.7: the order in which code-length code lengths are transmitted.
const CLEN_ORDER: [usize; 19] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

pub type InflateResult<T> = Result<T, &'static str>;

struct Bits<'a> {
    data: &'a [u8],
    pos: usize,
    buf: u64,
    cnt: u32,
}

impl<'a> Bits<'a> {
    fn new(data: &'a [u8]) -> Self {
        Bits { data, pos: 0, buf: 0, cnt: 0 }
    }

    /// Fill the buffer to at least 57 bits. Past the end it shifts in zeros, and `check` decides whether any were used.
    #[inline(always)]
    fn refill(&mut self) {
        while self.cnt <= 56 {
            let byte = if self.pos < self.data.len() { self.data[self.pos] } else { 0 };
            self.pos += 1;
            self.buf |= (byte as u64) << self.cnt;
            self.cnt += 8;
        }
    }

    #[inline(always)]
    fn take(&mut self, n: u32) -> u32 {
        if self.cnt < n {
            self.refill();
        }
        let v = (self.buf & ((1u64 << n) - 1)) as u32;
        self.buf >>= n;
        self.cnt -= n;
        v
    }

    /// Bits consumed so far beyond the input's end are a truncated stream.
    fn check(&self) -> InflateResult<()> {
        let consumed = self.pos as u64 * 8 - self.cnt as u64;
        if consumed > self.data.len() as u64 * 8 { Err("truncated deflate stream") } else { Ok(()) }
    }

    /// Drop to the next byte boundary and hand back the byte position the stream continues at (stored blocks).
    fn align(&mut self) -> usize {
        let drop = self.cnt % 8;
        self.buf >>= drop;
        self.cnt -= drop;
        let at = self.pos - (self.cnt / 8) as usize;
        self.buf = 0;
        self.cnt = 0;
        self.pos = at;
        at
    }
}

struct Huffman {
    /// Indexed by the next `PRIMARY_BITS` bits (LSB first): `symbol << 4 | length`, or 0 for a code longer than that.
    table: Vec<u32>,
    counts: [u16; MAX_BITS + 1],
    /// Symbols in canonical order: by length, then by value.
    symbols: Vec<u16>,
}

impl Huffman {
    fn new(lengths: &[u8]) -> InflateResult<Huffman> {
        let mut counts = [0u16; MAX_BITS + 1];
        for &l in lengths {
            counts[l as usize] += 1;
        }
        counts[0] = 0;
        // An over-subscribed set is not a prefix code; an incomplete one is allowed (a single distance code).
        let mut left: i32 = 1;
        for len in 1..=MAX_BITS {
            left <<= 1;
            left -= counts[len] as i32;
            if left < 0 {
                return Err("over-subscribed code lengths");
            }
        }
        let mut offsets = [0u16; MAX_BITS + 2];
        for len in 1..=MAX_BITS {
            offsets[len + 1] = offsets[len] + counts[len];
        }
        let mut symbols = vec![0u16; offsets[MAX_BITS + 1] as usize];
        for (sym, &l) in lengths.iter().enumerate() {
            if l != 0 {
                symbols[offsets[l as usize] as usize] = sym as u16;
                offsets[l as usize] += 1;
            }
        }
        // Canonical codes (section 3.2.2), placed bit-reversed because the stream is read LSB first.
        let mut table = vec![0u32; 1 << PRIMARY_BITS];
        let mut code: u32 = 0;
        let mut index = 0usize;
        for len in 1..=MAX_BITS {
            for _ in 0..counts[len] {
                if len as u32 <= PRIMARY_BITS {
                    let sym = symbols[index] as u32;
                    let mut reversed = 0u32;
                    for b in 0..len {
                        reversed |= ((code >> b) & 1) << (len - 1 - b);
                    }
                    let step = 1u32 << len;
                    let mut at = reversed;
                    while at < (1 << PRIMARY_BITS) {
                        table[at as usize] = (sym << 4) | len as u32;
                        at += step;
                    }
                }
                code += 1;
                index += 1;
            }
            code <<= 1;
        }
        Ok(Huffman { table, counts, symbols })
    }

    #[inline(always)]
    fn decode(&self, bits: &mut Bits) -> InflateResult<u16> {
        if bits.cnt < MAX_BITS as u32 {
            bits.refill();
        }
        let entry = self.table[(bits.buf & ((1 << PRIMARY_BITS) - 1)) as usize];
        if entry != 0 {
            let len = entry & 15;
            bits.buf >>= len;
            bits.cnt -= len;
            return Ok((entry >> 4) as u16);
        }
        // The canonical walk, one bit at a time, for a code longer than the table.
        let mut code: i32 = 0;
        let mut first: i32 = 0;
        let mut index: i32 = 0;
        for len in 1..=MAX_BITS {
            code |= (bits.buf & 1) as i32;
            bits.buf >>= 1;
            bits.cnt -= 1;
            let count = self.counts[len] as i32;
            if code - first < count {
                return Ok(self.symbols[(index + code - first) as usize]);
            }
            index += count;
            first += count;
            first <<= 1;
            code <<= 1;
        }
        Err("invalid Huffman code")
    }
}

fn fixed_tables() -> (Huffman, Huffman) {
    let mut lit = [0u8; 288];
    for (i, l) in lit.iter_mut().enumerate() {
        *l = match i {
            0..=143 => 8,
            144..=255 => 9,
            256..=279 => 7,
            _ => 8,
        };
    }
    let dist = [5u8; 30];
    (Huffman::new(&lit).expect("fixed literal code"), Huffman::new(&dist).expect("fixed distance code"))
}

fn dynamic_tables(bits: &mut Bits) -> InflateResult<(Huffman, Huffman)> {
    let hlit = bits.take(5) as usize + 257;
    let hdist = bits.take(5) as usize + 1;
    let hclen = bits.take(4) as usize + 4;
    if hlit > 286 || hdist > 30 {
        return Err("too many length or distance codes");
    }
    let mut clens = [0u8; 19];
    for &i in CLEN_ORDER.iter().take(hclen) {
        clens[i] = bits.take(3) as u8;
    }
    let clen_code = Huffman::new(&clens)?;
    let mut lengths = [0u8; 286 + 30];
    let mut i = 0;
    while i < hlit + hdist {
        let sym = clen_code.decode(bits)?;
        match sym {
            0..=15 => {
                lengths[i] = sym as u8;
                i += 1;
            }
            16 => {
                if i == 0 {
                    return Err("repeat with no previous length");
                }
                let prev = lengths[i - 1];
                let n = 3 + bits.take(2) as usize;
                if i + n > hlit + hdist {
                    return Err("code lengths overrun");
                }
                lengths[i..i + n].fill(prev);
                i += n;
            }
            17 | 18 => {
                let n = if sym == 17 { 3 + bits.take(3) as usize } else { 11 + bits.take(7) as usize };
                if i + n > hlit + hdist {
                    return Err("code lengths overrun");
                }
                lengths[i..i + n].fill(0);
                i += n;
            }
            _ => return Err("invalid code-length symbol"),
        }
    }
    if lengths[256] == 0 {
        return Err("no end-of-block code");
    }
    Ok((Huffman::new(&lengths[..hlit])?, Huffman::new(&lengths[hlit..hlit + hdist])?))
}

/// Decode one raw deflate stream into `out`, which must be exactly the decoded length.
pub fn inflate_exact(input: &[u8], out: &mut [u8]) -> InflateResult<()> {
    let mut bits = Bits::new(input);
    let mut o = 0usize;
    let mut fixed: Option<(Huffman, Huffman)> = None;
    loop {
        let last = bits.take(1) == 1;
        match bits.take(2) {
            0 => {
                let at = bits.align();
                if at + 4 > input.len() {
                    return Err("truncated stored block");
                }
                let len = u16::from_le_bytes([input[at], input[at + 1]]) as usize;
                let nlen = u16::from_le_bytes([input[at + 2], input[at + 3]]) as usize;
                if len != !nlen & 0xffff {
                    return Err("stored block length mismatch");
                }
                let from = at + 4;
                if from + len > input.len() {
                    return Err("truncated stored block");
                }
                if o + len > out.len() {
                    return Err("stream decodes past its stated length");
                }
                out[o..o + len].copy_from_slice(&input[from..from + len]);
                o += len;
                bits.pos = from + len;
            }
            kind @ (1 | 2) => {
                let dynamic;
                let (lit, dist) = if kind == 1 {
                    if fixed.is_none() {
                        fixed = Some(fixed_tables());
                    }
                    let f = fixed.as_ref().unwrap();
                    (&f.0, &f.1)
                } else {
                    dynamic = dynamic_tables(&mut bits)?;
                    (&dynamic.0, &dynamic.1)
                };
                loop {
                    let sym = lit.decode(&mut bits)? as usize;
                    if sym < 256 {
                        if o >= out.len() {
                            return Err("stream decodes past its stated length");
                        }
                        out[o] = sym as u8;
                        o += 1;
                    } else if sym == 256 {
                        break;
                    } else {
                        let li = sym - 257;
                        if li >= 29 {
                            return Err("invalid length symbol");
                        }
                        let len = LENGTH_BASE[li] as usize + bits.take(LENGTH_EXTRA[li] as u32) as usize;
                        let di = dist.decode(&mut bits)? as usize;
                        if di >= 30 {
                            return Err("invalid distance symbol");
                        }
                        let d = DIST_BASE[di] as usize + bits.take(DIST_EXTRA[di] as u32) as usize;
                        if d > o {
                            return Err("distance before the start of the stream");
                        }
                        if o + len > out.len() {
                            return Err("stream decodes past its stated length");
                        }
                        if d >= len {
                            out.copy_within(o - d..o - d + len, o);
                        } else {
                            for k in 0..len {
                                out[o + k] = out[o + k - d];
                            }
                        }
                        o += len;
                    }
                    if bits.pos > input.len() + 16 {
                        return Err("truncated deflate stream");
                    }
                }
            }
            _ => return Err("invalid block type"),
        }
        bits.check()?;
        if last {
            break;
        }
    }
    if o != out.len() {
        return Err("stream decodes short of its stated length");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::inflate_exact;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    // Vectors made by Node's zlib (`deflateRawSync`), the encoder `scripts/lib/portable.mjs` uses.
    #[test]
    fn decodes_a_dynamic_block() {
        let mut out = vec![0u8; 29];
        inflate_exact(&hex("cb48cdc9c957c8c020cbf38b725200"), &mut out).unwrap();
        assert_eq!(out, b"hello hello hello hello world");
    }

    #[test]
    fn decodes_a_stored_block_and_an_empty_stream() {
        let mut out = vec![0u8; 3];
        inflate_exact(&hex("010300fcff616263"), &mut out).unwrap();
        assert_eq!(out, b"abc");
        inflate_exact(&hex("0300"), &mut []).unwrap();
    }

    #[test]
    fn decodes_a_fixed_block_with_overlapping_copies() {
        let mut out = vec![0u8; 20];
        inflate_exact(&hex("4b4c848124380000"), &mut out).unwrap();
        assert_eq!(out, b"aaaaaaaaaabbbbbbbbbb");
    }

    #[test]
    fn refuses_a_wrong_length_and_a_truncated_stream() {
        let mut long = vec![0u8; 30];
        assert!(inflate_exact(&hex("cb48cdc9c957c8c020cbf38b725200"), &mut long).is_err());
        let mut short = vec![0u8; 28];
        assert!(inflate_exact(&hex("cb48cdc9c957c8c020cbf38b725200"), &mut short).is_err());
        let mut out = vec![0u8; 29];
        assert!(inflate_exact(&hex("cb48cdc9c957c8"), &mut out).is_err());
    }
}
