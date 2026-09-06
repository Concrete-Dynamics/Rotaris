# ADR-0048's application modality, observed the way the requirement means it (Part W).
#
# Input injected through `webContents.sendInputEvent` enters the renderer BELOW the host's input block, so it would
# pass through a window the host has disabled and prove nothing. This script delivers input the way the user does —
# the operating system's own cursor and keyboard queue — and reports what the host says about the window, so the
# palette proof observes a real block rather than assuming one.
#
# Usage: os-input.ps1 <op> <arg1> <arg2> <mainHwnd> <personaHwnd>
#   click <x> <y> <mainHwnd> <personaHwnd>   move the cursor to the screen point and click the left button
#   type  <text> -  <mainHwnd> <personaHwnd> send the characters to whatever the host gives keyboard focus
#   where 0 0 <mainHwnd> <personaHwnd>       report the state only
#
# Every op prints one JSON object: what the host reports about both windows (enabled, visible, foreground) so the
# caller can tell a block from a missing window. Nothing here is part of the product; it runs only from the proof.

param(
  [Parameter(Mandatory = $true)][string]$Op,
  [Parameter(Mandatory = $true)][string]$Arg1,
  [Parameter(Mandatory = $true)][string]$Arg2,
  [Parameter(Mandatory = $true)][string]$MainHwnd,
  [Parameter(Mandatory = $true)][string]$PersonaHwnd
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace RotarisProof -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
[DllImport("user32.dll")] public static extern short VkKeyScan(char ch);
'@

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$KEYEVENTF_KEYUP = 0x0002

function Handle([string]$value) { return [IntPtr]::new([int64]$value) }

$main = Handle $MainHwnd
$persona = Handle $PersonaHwnd

function State() {
  $fg = [RotarisProof.Win32]::GetForegroundWindow()
  return [ordered]@{
    op = $Op
    mainEnabled = [RotarisProof.Win32]::IsWindowEnabled($main)
    mainVisible = [RotarisProof.Win32]::IsWindowVisible($main)
    personaEnabled = [RotarisProof.Win32]::IsWindowEnabled($persona)
    personaVisible = [RotarisProof.Win32]::IsWindowVisible($persona)
    foreground = [int64]$fg
    foregroundIsPersona = ($fg -eq $persona)
    foregroundIsMain = ($fg -eq $main)
  }
}

switch ($Op) {
  'click' {
    # The persona window is raised first, so a click that the host lets through would land in it. Where the host has
    # disabled the window, SetForegroundWindow itself is refused and the click reaches whatever is beneath — which is
    # exactly the difference the proof reads.
    [void][RotarisProof.Win32]::SetForegroundWindow($persona)
    Start-Sleep -Milliseconds 120
    [void][RotarisProof.Win32]::SetCursorPos([int]$Arg1, [int]$Arg2)
    Start-Sleep -Milliseconds 60
    [RotarisProof.Win32]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [RotarisProof.Win32]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 120
    $s = State
    $s['clickedAt'] = "$Arg1,$Arg2"
  }
  'type' {
    [void][RotarisProof.Win32]::SetForegroundWindow($persona)
    Start-Sleep -Milliseconds 120
    foreach ($ch in $Arg1.ToCharArray()) {
      $vk = [RotarisProof.Win32]::VkKeyScan($ch)
      if ($vk -ne -1) {
        $code = [byte]($vk -band 0xFF)
        [RotarisProof.Win32]::keybd_event($code, 0, 0, [UIntPtr]::Zero)
        [RotarisProof.Win32]::keybd_event($code, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 25
      }
    }
    Start-Sleep -Milliseconds 120
    $s = State
    $s['typed'] = $Arg1
  }
  default {
    $s = State
  }
}

$s | ConvertTo-Json -Compress
