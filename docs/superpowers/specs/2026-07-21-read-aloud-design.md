# Read Aloud — design

## Goal
Let the user select text in the editor, right-click **Read Aloud** (or press a
keybinding), and have Windows speak the selection. If nothing is selected, read
the current line (same fallback as `Run In Terminal`).

## How it speaks
A new `src/readAloud.ts` module spawns `pwsh -NoProfile` via
`child_process.spawn` as a *hidden* process (`windowsHide: true`) — no terminal
tab. The selected text is piped in via **stdin**, never interpolated into the
script, so quotes / newlines / `$()` in the text cannot break or inject into the
command. The script:

```powershell
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($env:READ_ALOUD_RATE)  { $s.Rate = [int]$env:READ_ALOUD_RATE }
if ($env:READ_ALOUD_VOICE) { try { $s.SelectVoice($env:READ_ALOUD_VOICE) } catch {} }
$s.Speak([Console]::In.ReadToEnd())
```

Voice and rate are passed as **environment variables** (also injection-safe).
The module keeps the current child process in a module-level variable and
`kill()`s it before starting a new one, so a fresh Read Aloud interrupts the
previous one instead of overlapping. This does not go through the terminal
`Command` path.

## Settings (`package.json` `configuration`)
- `command-runner.readAloud.voice` — string, default `""` (empty = system
  default voice). An installed SAPI voice name, e.g. `"Microsoft Zira Desktop"`.
- `command-runner.readAloud.rate` — number, default `0`, range −10…10
  (System.Speech rate scale).

## Wiring (`package.json` `contributes`)
- `commands`: `command-runner.readAloud`, title **"Read Aloud"**.
- `editor/context`: shown `when: editorHasSelection && !inOutput`.
- `keybindings`: `ctrl+alt+r`, `when: editorTextFocus` (free — existing binds
  are `ctrl+shift+r`, `ctrl+shift+enter`, `ctrl+alt+enter`).
- `activationEvents`: add `onCommand:command-runner.readAloud`.

## extension.ts
Register `command-runner.readAloud` → read selection (fallback to current line)
→ call `speak(text)` from the new module.

## Out of scope (YAGNI)
No Stop command, no pause/resume, no queue, no non-Windows fallback (the
extension is already Windows/pwsh-only).

## Testing (manual)
- Select a paragraph, trigger via menu and via `ctrl+alt+r` → hear it.
- Select nothing → current line reads.
- Set `rate` `-4` and a `voice` → both apply.
- Trigger twice quickly → the second interrupts the first.
