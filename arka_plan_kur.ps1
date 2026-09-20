# Sunucuyu bilgisayar açılınca pencere olmadan arka planda başlatır (Başlangıç klasörüne kısayol koyar) ve hemen çalıştırır.
# Kullanım: powershell -ExecutionPolicy Bypass -File arka_plan_kur.ps1     Kaldırmak için: Başlangıç klasöründeki "YOKDIL Kelime (arka plan).lnk" dosyasını sil.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonw = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\pythonw.exe"
if (-not (Test-Path $pythonw)) { $cmd = Get-Command pythonw.exe -ErrorAction SilentlyContinue; if ($cmd) { $pythonw = $cmd.Source } else { Write-Error "pythonw.exe bulunamadi"; exit 1 } }
$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "YOKDIL Kelime (arka plan).lnk"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$s.TargetPath = $pythonw
$s.Arguments = "`"$(Join-Path $root 'launcher.pyw')`" --service"
$s.WorkingDirectory = $root
$s.WindowStyle = 7
$s.Description = "YOKDIL Kelime sunucusu (arka plan)"
$s.Save()
Start-Process -FilePath $lnk
Write-Output "Kuruldu ve baslatildi: $lnk"
