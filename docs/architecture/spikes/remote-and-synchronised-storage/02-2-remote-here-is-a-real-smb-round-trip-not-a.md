# Spike — the store and exclusive-create locking on remote and synchronised storage — 2. "Remote" here is a real SMB round trip, not a simulation

Part 2 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 2. "Remote" here is a real SMB round trip, not a simulation

Everything called remote below went through the Windows SMB client redirector and the SMB server on the
loopback interface. Four independent confirmations:

**2.1 The shares exist.** `net share` lists `C$`, `D$`, `ADMIN$`, `IPC$`, a games share, and a
non-administrative `Users` share mapped to `C:\Users`. The measurements below use the
**non-administrative** `Users` share wherever a single spelling is needed, because it does not depend on
the caller holding administrative rights and is therefore the closer analogue of a corporate file
server. `\\localhost\C$` was also exercised and behaved identically in section 4.1.

**2.2 Windows classifies it as remote.**

| Root | `GetDriveTypeW` | `GetVolumeInformationW` fs | fs flags |
|---|---|---|---|
| `C:\` | 3 `DRIVE_FIXED` | NTFS | `0x03E72EFF` |
| `D:\` | 3 `DRIVE_FIXED` | NTFS | `0x03E72EFF` |
| `\\localhost\Users\` | **4 `DRIVE_REMOTE`** | NTFS | `0x00C700FE` |
| `\\127.0.0.1\Users\` | **4 `DRIVE_REMOTE`** | NTFS | `0x00C700FE` |
| `\\localhost\C$\` | **4 `DRIVE_REMOTE`** | NTFS | `0x00C700FE` |

The filesystem-flag word differs between the local and the remote view of the *same volume*, which is
the redirector reporting a reduced capability set rather than NTFS reporting itself.

**2.3 There is TCP traffic on port 445.** With a Node file handle held open on
`\\127.0.0.1\Users\…`, `netstat -ano` reported:

```
TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
TCP    127.0.0.1:445          127.0.0.1:62945        ESTABLISHED     4
TCP    127.0.0.1:62945        127.0.0.1:445          ESTABLISHED     4
TCP    [::]:445               [::]:0                 LISTENING       4
TCP    [::1]:445              [::1]:62944            ESTABLISHED     4
TCP    [::1]:62944            [::1]:445              ESTABLISHED     4
```

`Get-SmbConnection` and `Get-SmbSession` were **denied** (`Windows System Error 5`) — this session is
not elevated, so the dialect in use could not be read. That is a gap, recorded rather than guessed.

**2.4 Every spelling names one file.** A byte written through any one of the four spellings was read
back correctly through all four; `fs.statSync` reported the same `ino` (`5629499535802038`) and the same
`dev` (`941525292`) through all four. A fifth spelling, the mapped drive letter `R:` created with
`net use R: \\127.0.0.1\Users /persistent:no`, was confirmed by `Get-SmbMapping` (`R: → \\127.0.0.1\Users`,
Status `OK`) and by `WNetGetUniversalNameW`, which resolved `R:\…` back to `\\127.0.0.1\Users\…`.
**The mapping was removed at the end of the run** (`net use R: /delete /y`, "R: was deleted successfully").

The five spellings used throughout are therefore:

| Name | Spelling | Stack |
|---|---|---|
| `local` | `C:\Users\ganga\…` | NTFS directly |
| `unc127` | `\\127.0.0.1\Users\ganga\…` | SMB redirector |
| `uncLocalhost` | `\\localhost\Users\ganga\…` | SMB redirector |
| `uncAdmin` | `\\localhost\C$\Users\ganga\…` | SMB redirector, administrative share |
| `mapped` | `R:\ganga\…` | SMB redirector behind a drive letter |

---
