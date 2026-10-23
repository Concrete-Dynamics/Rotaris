// The portable's icon (O-4): on a Windows MSVC target the owner's `resources/icon.ico` is linked in as a `.res`, so the
// artifact a user double-clicks shows the product's icon. Other targets — the Linux build `pnpm portable-proof` runs —
// carry none; `pnpm package` reads the icon back out of the Windows artifact (scripts/lib/pe-icons.mjs).

include!("src/icon_res.rs");

fn main() {
    let ico = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("resources").join("icon.ico");
    println!("cargo:rerun-if-changed={}", ico.display());
    println!("cargo:rerun-if-changed=src/icon_res.rs");
    let windows = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows");
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !windows {
        return;
    }
    if !msvc {
        println!("cargo:warning=the icon is linked on the MSVC target only; this build carries none");
        return;
    }
    let bytes = std::fs::read(&ico).unwrap_or_else(|e| panic!("the icon {} cannot be read: {e}", ico.display()));
    let res = icon_res(&bytes).unwrap_or_else(|e| panic!("the icon {} is not usable: {e}", ico.display()));
    let out = std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("icon.res");
    std::fs::write(&out, res).unwrap();
    println!("cargo:rustc-link-arg-bins={}", out.display());
}
