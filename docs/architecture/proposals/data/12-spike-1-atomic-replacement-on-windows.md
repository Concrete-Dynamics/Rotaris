# Architecture proposals — DATA slice — Spike 1 — atomic replacement on Windows

Part 12 of 25 of [the data proposal](../data.md), which indexes every part.

## Spike 1 — atomic replacement on Windows

Node v24.11.0, Windows 11 (build 26200), NTFS.

- `fs.renameSync(tmp, target)` over an existing file succeeds when no process holds the target.
- `fs.renameSync` **fails with `EPERM`** when any process holds a descriptor on the target obtained
  through Node's ordinary `fs.openSync(target, 'r')`. Node does not request `FILE_SHARE_DELETE`, so
  an ordinary reader blocks a replace. This is exactly the condition `REQ-LIBRARY-043` anticipates
  and requires to be retried.
- `fs.fsyncSync` on a **directory** handle fails with `EPERM`. The POSIX "fsync the parent directory
  to make the rename durable" idiom is unavailable through Node on Windows.
- Two writer processes replacing a 200 KB JSON document ~500 times each, against a reader loop: in
  1,850 reads **one read returned a zero-length string**; in a longer run, one in 16,250. No torn or
  partially written content was ever observed, and no temporary file was left behind. The failure
  mode is an **empty** read, not a partial one.

That last point matters because `REQ-LIBRARY-043` forbids exactly that word: a concurrent read must
return "either the complete previous file or the complete new one, **never a partial, empty, or
unparseable file**". The naive pairing of `writeFile(tmp)` + `rename(tmp, target)` on the write side
with `readFileSync(target)` on the read side **does not satisfy that requirement on Windows**. The
read side needs a guard, not only the write side. This drives ADR-DATA-02.
