//! The portable's launcher stub — ADR-0054 alternative P4, `REQ-STARTUP-165` (first-release-plan.md §4.5).
//!
//! `Rotaris-{v}-windows-x64-portable.exe` is this stub with the `win-unpacked` payload appended (`payload.rs`). A launch:
//!
//! 1. resolves the preparation root, `<per-user local data>/prepared` — `%LOCALAPPDATA%\rotaris\data\prepared` on Windows,
//!    never the roaming profile and never beside the artifact (clause (a), `REQ-STARTUP-145`, `REQ-STARTUP-166`);
//! 2. **fast path:** reads the marker in `<root>/<token>`, compares its launcher format and token, and stats every file it
//!    lists — no read of the artifact and no digest (ADR-0054, "What the fast path costs", Defect B);
//! 3. otherwise **prepares**: places the payload into `.incomplete-…`, writes and flushes the marker, then commits by
//!    displacing a damaged `<token>` aside to `.stale-…` and renaming — never a bare rename (Defect A). A racing launch
//!    that committed first wins and this one's work is discarded (clause (b): identical artifacts prepare alike);
//! 4. where no preparation can be made, places the payload for **this run only** — under the root where it accepts a
//!    write, otherwise in the platform's temporary directory — records the outcome and the root it could not prepare
//!    into in that tree's marker, runs it, and removes it when the run ends (clause (c)'s closed set of two);
//! 5. starts the payload's entry point with `ROTARIS_PORTABLE_ARTIFACT` naming this artifact (clause (e),
//!    `REQ-STARTUP-147`, `PD-STARTUP-004`) and every argument it was given, and closes its handle on the artifact first;
//! 6. after the start, removes superseded preparations that nothing runs from (clause (b)'s identifiability; best
//!    effort, never reported), and on Windows exits — it never stays as a parent of a prepared run (ADR-0054, "The stub
//!    must not outlive the launch").
//!
//! Nothing is reported on any of the four silent outcomes (`REQ-STARTUP-150`). The one reported outcome is written to the
//! marker for the application to read (ADR-0054, "How the application learns of it").

#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(test)]
mod icon_res;
mod inflate;
mod payload;

use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The variable the launch names its artifact by (`@rotaris/platform`, `PORTABLE_ARTIFACT_VARIABLE`).
const ARTIFACT_VARIABLE: &str = "ROTARIS_PORTABLE_ARTIFACT";
/// The marker inside every tree this stub places.
pub const MARKER: &str = ".rotaris-preparation";
/// The launcher-format field (ADR-0054: load-bearing). Bump it with any change to how a tree is laid out or checked,
/// so an existing preparation is redone rather than reused by a launcher that reads it differently.
const LAUNCHER_FORMAT: &str = "1";
const MARKER_HEADER: &str = "rotaris-preparation";

/// The slot the assembler writes the artifact's identity token into: the 32-byte magic, a length byte, the token.
/// Read through a volatile load so the compiler cannot fold the unpatched value into the code.
const SLOT_LEN: usize = 128;
const SLOT_MAGIC: &[u8; 32] = b"ROTARIS-PORTABLE-TOKEN-SLOT-V1:\0";
const fn empty_slot() -> [u8; SLOT_LEN] {
    let mut s = [0u8; SLOT_LEN];
    let mut i = 0;
    while i < SLOT_MAGIC.len() {
        s[i] = SLOT_MAGIC[i];
        i += 1;
    }
    s
}
#[used]
static TOKEN_SLOT: [u8; SLOT_LEN] = empty_slot();

fn embedded_token() -> Option<String> {
    // SAFETY: a plain read of a static's bytes; volatile only so the read is not constant-folded.
    let slot: [u8; SLOT_LEN] = unsafe { std::ptr::read_volatile(&TOKEN_SLOT) };
    let len = slot[32] as usize;
    if len == 0 || len > SLOT_LEN - 33 {
        return None;
    }
    let token = std::str::from_utf8(&slot[33..33 + len]).ok()?;
    token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b'+').then(|| token.to_string())
}

fn main() {
    std::process::exit(match run() {
        Ok(code) => code,
        Err(why) => {
            fatal(&why);
            70
        }
    });
}

/// The per-user data directory of `REQ-STARTUP-145`, spelled as `packages/platform/src/dirs.ts` spells it.
fn data_directory() -> Option<PathBuf> {
    let absolute = |v: Option<OsString>| v.map(PathBuf::from).filter(|p| p.is_absolute());
    if cfg!(windows) {
        let local = absolute(std::env::var_os("LOCALAPPDATA")).or_else(|| absolute(std::env::var_os("USERPROFILE")).map(|h| h.join("AppData").join("Local")))?;
        Some(local.join("rotaris").join("data"))
    } else {
        let share = absolute(std::env::var_os("XDG_DATA_HOME")).or_else(|| absolute(std::env::var_os("HOME")).map(|h| h.join(".local").join("share")))?;
        Some(share.join("rotaris"))
    }
}

fn unique() -> String {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    format!("{}-{nanos}", std::process::id())
}

fn run() -> Result<i32, String> {
    let artifact = std::env::current_exe().map_err(|e| format!("the launcher cannot name its own file ({e})"))?;
    let token = embedded_token().ok_or("this launcher carries no payload identity; it was not assembled")?;
    let args: Vec<OsString> = std::env::args_os().skip(1).collect();
    let root = data_directory().map(|d| d.join("prepared"));

    if let Some(root) = &root {
        let dir = root.join(&token);
        let ready = match check(&dir, &token) {
            Ok(entry) => Some(entry),
            Err(_) => prepare(&artifact, root, &token).ok(),
        };
        if let Some(entry) = ready {
            return launch_prepared(&entry, &artifact, &args, root, &token);
        }
    }
    run_scoped(&artifact, root.as_deref(), &args)
}

/// What a marker says, as far as a launch needs it.
struct Marker {
    format: String,
    token: String,
    outcome: String,
    entry: String,
    files: Vec<(u64, String)>,
}

fn read_marker(dir: &Path) -> io::Result<Marker> {
    let text = fs::read_to_string(dir.join(MARKER))?;
    let mut lines = text.lines();
    let header = lines.next().unwrap_or("");
    let format = header.strip_prefix(MARKER_HEADER).map(str::trim).unwrap_or("").to_string();
    let mut m = Marker { format, token: String::new(), outcome: String::new(), entry: String::new(), files: Vec::new() };
    for line in lines {
        let (kind, rest) = line.split_once(' ').unwrap_or((line, ""));
        match kind {
            "token" => m.token = rest.to_string(),
            "outcome" => m.outcome = rest.to_string(),
            "entry" => m.entry = rest.to_string(),
            "file" => {
                let (size, path) = rest.split_once(' ').ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "marker file line"))?;
                let size = size.parse().map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "marker file size"))?;
                m.files.push((size, path.to_string()));
            }
            _ => {}
        }
    }
    Ok(m)
}

/// The fast path's whole check: the marker's format, token and outcome, the entry point, and every listed file present at
/// its length. Answers the entry point to start.
fn check(dir: &Path, token: &str) -> io::Result<PathBuf> {
    let invalid = |what: &str| io::Error::new(io::ErrorKind::InvalidData, what.to_string());
    let m = read_marker(dir)?;
    if m.format != LAUNCHER_FORMAT {
        return Err(invalid("marker-format-mismatch"));
    }
    if m.token != token || m.outcome != "prepared" {
        return Err(invalid("marker names another artifact or no preparation"));
    }
    let entry = dir.join(payload::native(&m.entry)?);
    if !entry.is_file() {
        return Err(invalid("entry point missing"));
    }
    for (size, path) in &m.files {
        let meta = fs::metadata(dir.join(payload::native(path)?))?;
        if !meta.is_file() || meta.len() != *size {
            return Err(invalid("a prepared file is missing or of the wrong length"));
        }
    }
    Ok(entry)
}

/// The marker's text for a tree just placed. `unprepared` names the root a run-scoped placement could not prepare into.
fn marker_text(index: &payload::Index, outcome: &str, unprepared: Option<&Path>) -> String {
    let mut s = format!("{MARKER_HEADER} {LAUNCHER_FORMAT}\ntoken {}\noutcome {outcome}\n", index.token);
    if let Some(root) = unprepared {
        s.push_str(&format!("unprepared-root {}\n", root.display()));
    }
    s.push_str(&format!("entry {}\n", index.entry));
    for f in &index.files {
        s.push_str(&format!("file {} {}\n", f.size, f.path));
    }
    s
}

/// Place the payload into `into` and write its marker, flushed. The artifact is closed when this returns.
fn place(artifact: &Path, into: &Path, outcome: &str, unprepared: Option<&Path>) -> io::Result<payload::Index> {
    let payload = payload::open(artifact)?;
    payload.place(into)?;
    let mut marker = File::create(into.join(MARKER))?;
    marker.write_all(marker_text(&payload.index, outcome, unprepared).as_bytes())?;
    marker.sync_all()?;
    let payload::Payload { index, .. } = payload;
    Ok(index)
}

fn prepare(artifact: &Path, root: &Path, token: &str) -> io::Result<PathBuf> {
    fs::create_dir_all(root)?;
    let dir = root.join(token);
    let incomplete = root.join(format!(".incomplete-{token}-{}", unique()));
    let placed = place(artifact, &incomplete, "prepared", None).and_then(|index| {
        if index.token != token {
            Err(io::Error::new(io::ErrorKind::InvalidData, "the payload's token is not the launcher's"))
        } else {
            Ok(())
        }
    });
    if let Err(e) = placed {
        let _ = fs::remove_dir_all(&incomplete);
        return Err(e);
    }
    // Commit. A token-named directory exists only once it was finished, so a launch that finds one finished meanwhile
    // (a racing launch of the same artifact) uses it and discards its own work.
    for _ in 0..2 {
        if let Ok(entry) = check(&dir, token) {
            let _ = fs::remove_dir_all(&incomplete);
            return Ok(entry);
        }
        if dir.exists() {
            // Defect A: on Windows a directory cannot be renamed onto an existing one, so a damaged preparation is
            // displaced first and left for reclamation.
            if fs::rename(&dir, root.join(format!(".stale-{token}-{}", unique()))).is_err() {
                continue;
            }
        }
        if fs::rename(&incomplete, &dir).is_ok() {
            return check(&dir, token);
        }
    }
    let _ = fs::remove_dir_all(&incomplete);
    check(&dir, token)
}

fn command(entry: &Path, artifact: &Path, args: &[OsString]) -> Command {
    let mut c = Command::new(entry);
    c.args(args).env(ARTIFACT_VARIABLE, artifact);
    c
}

fn exit_code(status: std::process::ExitStatus) -> i32 {
    #[cfg(unix)]
    {
        use std::os::unix::process::ExitStatusExt;
        if let Some(sig) = status.signal() {
            return 128 + sig;
        }
    }
    status.code().unwrap_or(1)
}

fn launch_prepared(entry: &Path, artifact: &Path, args: &[OsString], root: &Path, token: &str) -> Result<i32, String> {
    let mut child = command(entry, artifact, args).spawn().map_err(|e| format!("Rotaris could not be started from {} ({e})", entry.display()))?;
    reclaim(root, token);
    if cfg!(windows) {
        // The stub exits: nothing holds the artifact while the application runs (REQ-STARTUP-125).
        return Ok(0);
    }
    // Elsewhere the stub waits so the launch's exit status is the application's; it holds no handle on the artifact.
    Ok(child.wait().map(exit_code).unwrap_or(1))
}

/// Clause (c)'s second half: no preparation could be made, so this run places the payload for itself, runs it and removes
/// it. The first placement that accepts the write wins: under the root, then the platform's temporary directory.
fn run_scoped(artifact: &Path, root: Option<&Path>, args: &[OsString]) -> Result<i32, String> {
    let unprepared = root.map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from("(no per-user data directory)"));
    let mut candidates = Vec::new();
    if let Some(root) = root {
        candidates.push(root.join(format!(".run-{}", unique())));
    }
    candidates.push(std::env::temp_dir().join(format!("rotaris-run-{}", unique())));
    let mut last = String::new();
    for placement in candidates {
        match place(artifact, &placement, "run-scoped", Some(&unprepared)) {
            Ok(index) => {
                let entry = match payload::native(&index.entry) {
                    Ok(rel) => placement.join(rel),
                    Err(e) => {
                        remove_eventually(&placement);
                        return Err(e.to_string());
                    }
                };
                let status = command(&entry, artifact, args).status();
                remove_eventually(&placement);
                return status.map(exit_code).map_err(|e| format!("Rotaris could not be started ({e})"));
            }
            Err(e) => {
                last = e.to_string();
                let _ = fs::remove_dir_all(&placement);
            }
        }
    }
    Err(format!("Rotaris has nowhere on this machine to place itself ({last})"))
}

/// A run-scoped tree's files may stay locked for a moment after its process exits (Windows); retry briefly.
fn remove_eventually(dir: &Path) {
    for _ in 0..20 {
        if fs::remove_dir_all(dir).is_ok() || !dir.exists() {
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Clause (b): superseded preparations are removed once nothing runs from them. Best effort, never reported, retried by a
/// later launch. A tree is displaced to `.stale-…` before it is deleted: on Windows the rename fails while any of its files
/// is open, which is exactly "something still runs from it".
fn reclaim(root: &Path, token: &str) {
    let Ok(entries) = fs::read_dir(root) else { return };
    let day = Duration::from_secs(24 * 60 * 60);
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let path = e.path();
        if name == token || !path.is_dir() {
            continue;
        }
        if name.starts_with(".stale-") {
            let _ = fs::remove_dir_all(&path);
        } else if name.starts_with(".incomplete-") || name.starts_with(".run-") {
            // Another launch may be writing or running it right now; only a day-old one is abandoned.
            let old = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age > day);
            if old {
                let _ = fs::remove_dir_all(&path);
            }
        } else if !name.starts_with('.') && path.join(MARKER).is_file() && !in_use(&path) {
            let stale = root.join(format!(".stale-{name}-{}", unique()));
            if fs::rename(&path, &stale).is_ok() {
                let _ = fs::remove_dir_all(&stale);
            }
        }
    }
}

/// Whether a process runs from inside `dir`. Windows answers through the rename in `reclaim`; Linux through `/proc`.
#[cfg(target_os = "linux")]
fn in_use(dir: &Path) -> bool {
    let Ok(procs) = fs::read_dir("/proc") else { return true };
    procs.flatten().any(|p| fs::read_link(p.path().join("exe")).is_ok_and(|exe| exe.starts_with(dir)))
}

#[cfg(not(target_os = "linux"))]
fn in_use(_dir: &Path) -> bool {
    cfg!(not(windows))
}

#[cfg(windows)]
fn fatal(why: &str) {
    #[link(name = "user32")]
    extern "system" {
        fn MessageBoxW(hwnd: *mut core::ffi::c_void, text: *const u16, caption: *const u16, kind: u32) -> i32;
    }
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (text, caption) = (wide(why), wide("Rotaris"));
    // SAFETY: two NUL-terminated UTF-16 buffers that outlive the call; MB_ICONERROR.
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text.as_ptr(), caption.as_ptr(), 0x10);
    }
}

#[cfg(not(windows))]
fn fatal(why: &str) {
    eprintln!("rotaris: {why}");
}
