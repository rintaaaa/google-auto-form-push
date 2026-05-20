Option Explicit

Dim shell
Dim baseDir
Dim command

Set shell = CreateObject("WScript.Shell")
baseDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

command = "cmd.exe /c cd /d """ & baseDir & """ && node daily-run.js --dry-run"

' 0 = hidden window, False = do not wait
shell.Run command, 0, False
