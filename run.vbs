Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Normal -File ""C:\업무\eum_platform\run.ps1""", 1, False
