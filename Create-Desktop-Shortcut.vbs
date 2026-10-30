' =========================================================================
'  Create-Desktop-Shortcut.vbs
'  Generates an "Amul Parlour" shortcut on the Windows Desktop.
'  Compatible with Windows 7 SP1, Windows 8, Windows 8.1, Windows 10, Windows 11.
' =========================================================================

Option Explicit

Dim oWS, oFSO, sDesktop, sCurrentDir, oShortcut, sTargetPath

Set oWS = CreateObject("WScript.Shell")
Set oFSO = CreateObject("Scripting.FileSystemObject")

' Get Current Directory and Desktop path
sCurrentDir = oFSO.GetParentFolderName(WScript.ScriptFullName)
sDesktop = oWS.SpecialFolders("Desktop")

sTargetPath = sCurrentDir & "\Start-Amul-POS.bat"

If Not oFSO.FileExists(sTargetPath) Then
    MsgBox "Could not find Start-Amul-POS.bat in: " & sCurrentDir, vbCritical, "Amul Parlour Setup Error"
    WScript.Quit 1
End If

' Create Desktop Shortcut
Set oShortcut = oWS.CreateShortcut(sDesktop & "\Amul Parlour.lnk")
oShortcut.TargetPath = sTargetPath
oShortcut.WorkingDirectory = sCurrentDir
oShortcut.Description = "Amul Parlour Web POS & Management Portal"
oShortcut.WindowStyle = 7 ' Minimized window
oShortcut.Save

MsgBox "Desktop shortcut 'Amul Parlour' created successfully on your Windows Desktop!" & vbCrLf & vbCrLf & _
       "Double-click it anytime to launch your local POS server and open counter billing.", vbInformation, "Amul Parlour POS"

Set oShortcut = Nothing
Set oFSO = Nothing
Set oWS = Nothing
