// The owner's icon as a compiled Windows resource file (`.res`), so the portable shows the same icon as the installed
// executable (O-4). Written from Microsoft's documented formats — the `.ico` ICONDIR, the `.res` RESOURCEHEADER
// sequence, and RT_GROUP_ICON's GRPICONDIR — rather than by a resource compiler, so the stub needs no tool beyond Cargo
// and the MSVC linker, which takes a `.res` as an input. Shared by `build.rs` (`include!`) and the crate's tests.

const RT_ICON: u16 = 3;
const RT_GROUP_ICON: u16 = 14;

fn push_resource(out: &mut Vec<u8>, kind: u16, id: u16, flags: u16, data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_le_bytes()); // DataSize
    out.extend_from_slice(&32u32.to_le_bytes()); // HeaderSize: ordinal type and name
    out.extend_from_slice(&[0xff, 0xff]);
    out.extend_from_slice(&kind.to_le_bytes());
    out.extend_from_slice(&[0xff, 0xff]);
    out.extend_from_slice(&id.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // DataVersion
    out.extend_from_slice(&flags.to_le_bytes()); // MemoryFlags
    out.extend_from_slice(&0u16.to_le_bytes()); // LanguageId: neutral
    out.extend_from_slice(&0u32.to_le_bytes()); // Version
    out.extend_from_slice(&0u32.to_le_bytes()); // Characteristics
    out.extend_from_slice(data);
    while out.len() % 4 != 0 {
        out.push(0);
    }
}

/// The `.res` bytes for an `.ico` file: one RT_ICON per image (ids 1..n) and one RT_GROUP_ICON, id 1, listing them.
pub fn icon_res(ico: &[u8]) -> Result<Vec<u8>, String> {
    let word = |at: usize| -> Result<u16, String> { ico.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]])).ok_or_else(|| "a truncated icon file".to_string()) };
    let dword = |at: usize| -> Result<u32, String> { ico.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]])).ok_or_else(|| "a truncated icon file".to_string()) };
    if word(0)? != 0 || word(2)? != 1 {
        return Err("not an icon file".into());
    }
    let count = word(4)? as usize;
    let mut out = Vec::new();
    push_resource(&mut out, 0, 0, 0, &[]); // the empty entry every .res file begins with
    let mut group = Vec::new();
    group.extend_from_slice(&0u16.to_le_bytes());
    group.extend_from_slice(&1u16.to_le_bytes());
    group.extend_from_slice(&(count as u16).to_le_bytes());
    for i in 0..count {
        let e = 6 + 16 * i;
        let size = dword(e + 8)? as usize;
        let offset = dword(e + 12)? as usize;
        let image = ico.get(offset..offset + size).ok_or("an icon image outside the file")?;
        push_resource(&mut out, RT_ICON, (i + 1) as u16, 0x1010, image);
        group.extend_from_slice(ico.get(e..e + 12).ok_or("a truncated icon entry")?);
        group.extend_from_slice(&((i + 1) as u16).to_le_bytes());
    }
    push_resource(&mut out, RT_GROUP_ICON, 1, 0x1030, &group);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::icon_res;

    #[test]
    fn the_owners_icon_becomes_one_group_of_its_seven_images() {
        let ico = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../resources/icon.ico")).unwrap();
        let res = icon_res(&ico).unwrap();
        // Walk the RESOURCEHEADER sequence back: the empty entry, seven RT_ICONs, one RT_GROUP_ICON.
        let (mut at, mut kinds, mut images) = (0usize, Vec::new(), Vec::new());
        while at < res.len() {
            let size = u32::from_le_bytes(res[at..at + 4].try_into().unwrap()) as usize;
            let header = u32::from_le_bytes(res[at + 4..at + 8].try_into().unwrap()) as usize;
            assert_eq!(header, 32);
            kinds.push(u16::from_le_bytes([res[at + 10], res[at + 11]]));
            images.push(res[at + header..at + header + size].to_vec());
            at = (at + header + size + 3) & !3;
        }
        assert_eq!(kinds, vec![0, 3, 3, 3, 3, 3, 3, 3, 14]);
        for i in 0..7 {
            let e = 6 + 16 * i;
            let size = u32::from_le_bytes(ico[e + 8..e + 12].try_into().unwrap()) as usize;
            let offset = u32::from_le_bytes(ico[e + 12..e + 16].try_into().unwrap()) as usize;
            assert_eq!(images[i + 1], &ico[offset..offset + size]);
        }
        let group = &images[8];
        assert_eq!(u16::from_le_bytes([group[4], group[5]]), 7);
        assert_eq!(group.len(), 6 + 14 * 7);
    }

    #[test]
    fn refuses_a_file_that_is_not_an_icon() {
        assert!(icon_res(b"MZ\0\0\0\0").is_err());
    }
}
