# claude
/exit
. gci
work command-runner; cl
work command-runner; cl --resume (claudeSession)
work command-runner; cl --resume 5a01a75f-d8dd-4500-a466-712699cdc347
lgtm. commit and push the changes. do NOT include co authored by line in the commit message.


cl





pls 
read C:\tmp\command-runner\src\extension.ts
Scan backward from the given line, if there is a line with text "cl" (short for claude), it should be executed under "claude" terminal


these are known pwsh7 commands and should be always executed under pwsh terminal: sm, smerge, git, work, "." (dot source in powershell), mpp, sf, cl, claude

pwsh
sm


pls 
read C:\tmp\command-runner\src\extension.ts
if command starts with please or pls, likely the user talking to AI and so it should use "claude" terminal

pls or please are used to detect which terminal to be run, but it should be removed from the actual command

src/extension.ts:158-169: The pls/please prefix is now detected first, stripped (including any trailing whitespace), and the remainder is sent to the claude terminal. 
The handler returns immediately, so subsequent prefix handlers (read, ins, - , etc.) don't run on AI commands.

  How to test:
  - Line pls explain this regex → claude terminal receives explain this regex.
  - Line please summarize the diff → claude terminal receives summarize the diff.
  - Line pls alone → claude terminal is opened/focused, nothing executed.
  - Line please-stop.ps1 → not matched (\b boundary), falls through to normal handling.
  - Line git status → unchanged, uses context-detected terminal as before.