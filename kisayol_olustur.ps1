# Masaüstüne "YÖKDİL Kelime" kısayolu oluşturur. Kullanım: powershell -ExecutionPolicy Bypass -File kisayol_olustur.ps1
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\pythonw.exe"
if (-not (Test-Path $pythonw)) {
    $cmd = Get-Command pythonw.exe -ErrorAction SilentlyContinue
    if ($cmd) { $pythonw = $cmd.Source } else { Write-Error "pythonw.exe bulunamadi"; exit 1 }
}
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $desktop "YOKDIL Kelime.lnk"
$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($lnk)
$s.TargetPath = $pythonw
$s.Arguments = "`"$(Join-Path $root 'launcher.pyw')`""
$s.WorkingDirectory = $root
$s.IconLocation = (Join-Path $root "icons\yokdil.ico")
$s.Description = "YOKDIL kelime ezberleme programi"
$s.Save()
Write-Output "Kisayol olusturuldu: $lnk"
