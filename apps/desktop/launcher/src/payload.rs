//! The payload the assembler appends to this stub (`scripts/lib/portable.mjs` writes it; this reads it).
//!
//! ```text
//! artifact = stub image ‖ chunks ‖ index ‖ footer
//! footer   = "RTRSPAY1" ‖ chunks offset (u64 LE) ‖ index offset (u64 LE) ‖ index length (u64 LE)
//! index    = UTF-8 lines:
//!            rotaris-portable-index 1
//!            token <token>
//!            entry <path>
//!            dir <path>
//!            file <unix mode, octal> <size> <path>
//!            chunk <offset from the chunks offset> <compressed length> <decoded length>   (follows its file)
//! ```
//!
//! Paths are relative, `/`-separated, and refused when they could leave the directory they are placed in. Each chunk is
//! one raw deflate stream, so chunks decode independently and in parallel (ADR-0054: "writes large chunks in parallel").
//! Only a preparing or run-scoped launch opens the artifact; the fast path never does (ADR-0054, "does not open the
//! artifact").

use crate::inflate::inflate_exact;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

pub const FOOTER_MAGIC: &[u8; 8] = b"RTRSPAY1";
const FOOTER_LEN: u64 = 32;
const INDEX_HEADER: &str = "rotaris-portable-index 1";

pub struct Chunk {
    pub offset: u64,
    pub compressed: u64,
    pub decoded: u64,
}

pub struct FileEntry {
    pub path: String,
    pub mode: u32,
    pub size: u64,
    pub chunks: Vec<Chunk>,
}

pub struct Index {
    pub token: String,
    pub entry: String,
    pub dirs: Vec<String>,
    pub files: Vec<FileEntry>,
}

fn bad(what: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, format!("the artifact's payload is damaged: {what}"))
}

/// A relative `/`-separated path as a native one, refused when it is empty, absolute, or climbs out.
pub fn native(rel: &str) -> io::Result<PathBuf> {
    let mut out = PathBuf::new();
    for part in rel.split('/') {
        if part.is_empty() || part == "." || part == ".." || part.contains('\\') || part.contains(':') {
            return Err(bad(&format!("a path that could leave its directory ({rel})")));
        }
        out.push(part);
    }
    if out.components().any(|c| !matches!(c, Component::Normal(_))) || out.as_os_str().is_empty() {
        return Err(bad(&format!("a path that could leave its directory ({rel})")));
    }
    Ok(out)
}

fn num(s: Option<&str>, what: &str) -> io::Result<u64> {
    s.and_then(|v| v.parse::<u64>().ok()).ok_or_else(|| bad(what))
}

pub fn parse_index(text: &str) -> io::Result<Index> {
    let mut lines = text.lines();
    if lines.next() != Some(INDEX_HEADER) {
        return Err(bad("an index of an unknown format"));
    }
    let mut index = Index { token: String::new(), entry: String::new(), dirs: Vec::new(), files: Vec::new() };
    for line in lines {
        let (kind, rest) = line.split_once(' ').unwrap_or((line, ""));
        match kind {
            "token" => index.token = rest.to_string(),
            "entry" => index.entry = rest.to_string(),
            "dir" => index.dirs.push(rest.to_string()),
            "file" => {
                let mut f = rest.splitn(3, ' ');
                let mode = f.next().and_then(|m| u32::from_str_radix(m, 8).ok()).ok_or_else(|| bad("a file mode"))?;
                let size = num(f.next(), "a file size")?;
                let path = f.next().ok_or_else(|| bad("a file path"))?.to_string();
                index.files.push(FileEntry { path, mode, size, chunks: Vec::new() });
            }
            "chunk" => {
                let mut c = rest.split(' ');
                let chunk = Chunk { offset: num(c.next(), "a chunk offset")?, compressed: num(c.next(), "a chunk length")?, decoded: num(c.next(), "a chunk length")? };
                index.files.last_mut().ok_or_else(|| bad("a chunk before any file"))?.chunks.push(chunk);
            }
            "" => {}
            _ => return Err(bad("an index line of an unknown kind")),
        }
    }
    if index.token.is_empty() || index.entry.is_empty() {
        return Err(bad("an index with no token or no entry point"));
    }
    for f in &index.files {
        if f.chunks.iter().map(|c| c.decoded).sum::<u64>() != f.size {
            return Err(bad(&format!("chunks that do not add up to {}", f.path)));
        }
    }
    Ok(index)
}

/// The open artifact and the payload's geometry. Dropped — and so closed — before the payload is started.
pub struct Payload {
    file: File,
    chunks_at: u64,
    pub index: Index,
}

pub fn open(artifact: &Path) -> io::Result<Payload> {
    let mut file = File::open(artifact)?;
    let len = file.metadata()?.len();
    if len < FOOTER_LEN {
        return Err(bad("no footer"));
    }
    let mut footer = [0u8; FOOTER_LEN as usize];
    file.seek(SeekFrom::Start(len - FOOTER_LEN))?;
    file.read_exact(&mut footer)?;
    if &footer[0..8] != FOOTER_MAGIC {
        return Err(bad("no footer"));
    }
    let word = |i: usize| u64::from_le_bytes(footer[i..i + 8].try_into().unwrap());
    let (chunks_at, index_at, index_len) = (word(8), word(16), word(24));
    if index_at.checked_add(index_len) != Some(len - FOOTER_LEN) || chunks_at > index_at || index_len > 64 << 20 {
        return Err(bad("a footer that does not describe this file"));
    }
    let mut text = vec![0u8; index_len as usize];
    file.seek(SeekFrom::Start(index_at))?;
    file.read_exact(&mut text)?;
    let index = parse_index(std::str::from_utf8(&text).map_err(|_| bad("an index that is not UTF-8"))?)?;
    for f in &index.files {
        for c in &f.chunks {
            if c.offset.checked_add(c.compressed).map_or(true, |end| chunks_at + end > index_at) {
                return Err(bad(&format!("a chunk outside the payload ({})", f.path)));
            }
        }
    }
    Ok(Payload { file, chunks_at, index })
}

#[cfg(unix)]
fn read_at(f: &File, buf: &mut [u8], at: u64) -> io::Result<()> {
    use std::os::unix::fs::FileExt;
    f.read_exact_at(buf, at)
}

#[cfg(windows)]
fn read_at(f: &File, mut buf: &mut [u8], mut at: u64) -> io::Result<()> {
    use std::os::windows::fs::FileExt;
    while !buf.is_empty() {
        let n = f.seek_read(buf, at)?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "the artifact ended inside a chunk"));
        }
        buf = &mut buf[n..];
        at += n as u64;
    }
    Ok(())
}

#[cfg(unix)]
fn write_at(f: &File, buf: &[u8], at: u64) -> io::Result<()> {
    use std::os::unix::fs::FileExt;
    f.write_all_at(buf, at)
}

#[cfg(windows)]
fn write_at(f: &File, mut buf: &[u8], mut at: u64) -> io::Result<()> {
    use std::os::windows::fs::FileExt;
    while !buf.is_empty() {
        let n = f.seek_write(buf, at)?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::WriteZero, "a chunk could not be written"));
        }
        buf = &buf[n..];
        at += n as u64;
    }
    Ok(())
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode & 0o777))
}

#[cfg(windows)]
fn set_mode(_path: &Path, _mode: u32) -> io::Result<()> {
    Ok(())
}

impl Payload {
    /// Write every directory and file of the payload under `into`, decoding chunks on every core (at most eight).
    pub fn place(&self, into: &Path) -> io::Result<()> {
        fs::create_dir_all(into)?;
        for d in &self.index.dirs {
            fs::create_dir_all(into.join(native(d)?))?;
        }
        let mut work: Vec<(usize, usize, u64)> = Vec::new();
        for (fi, f) in self.index.files.iter().enumerate() {
            let target = into.join(native(&f.path)?);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            if f.chunks.len() != 1 {
                // A file of several chunks (or of none) is sized first, so every chunk can be written at its offset.
                File::create(&target)?.set_len(f.size)?;
            }
            let mut at = 0u64;
            for (ci, c) in f.chunks.iter().enumerate() {
                work.push((fi, ci, at));
                at += c.decoded;
            }
        }
        // The largest chunks first, so the last thread to finish is not the one that drew the executable.
        work.sort_by(|a, b| self.index.files[b.0].chunks[b.1].decoded.cmp(&self.index.files[a.0].chunks[a.1].decoded));
        let next = AtomicUsize::new(0);
        let failure: Mutex<Option<io::Error>> = Mutex::new(None);
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(1, 8);
        std::thread::scope(|s| {
            for _ in 0..threads {
                s.spawn(|| {
                    let mut input = Vec::new();
                    let mut output = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        if i >= work.len() || failure.lock().unwrap().is_some() {
                            return;
                        }
                        let (fi, ci, at) = work[i];
                        if let Err(e) = self.place_chunk(into, fi, ci, at, &mut input, &mut output) {
                            failure.lock().unwrap().get_or_insert(e);
                            return;
                        }
                    }
                });
            }
        });
        if let Some(e) = failure.into_inner().unwrap() {
            return Err(e);
        }
        for f in &self.index.files {
            if f.mode & 0o111 != 0 {
                set_mode(&into.join(native(&f.path)?), f.mode)?;
            }
        }
        Ok(())
    }

    fn place_chunk(&self, into: &Path, fi: usize, ci: usize, at: u64, input: &mut Vec<u8>, output: &mut Vec<u8>) -> io::Result<()> {
        let f = &self.index.files[fi];
        let c = &f.chunks[ci];
        input.resize(c.compressed as usize, 0);
        read_at(&self.file, input, self.chunks_at + c.offset)?;
        output.resize(c.decoded as usize, 0);
        inflate_exact(input, output).map_err(|why| bad(&format!("{} ({why})", f.path)))?;
        let target = into.join(native(&f.path)?);
        if f.chunks.len() == 1 {
            fs::write(&target, &output[..])
        } else {
            write_at(&OpenOptions::new().write(true).open(&target)?, output, at)
        }
    }
}
