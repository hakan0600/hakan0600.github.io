# Telefonun bilgisayardaki YÖKDİL Kelime'ye bağlanabilmesi için güvenlik duvarında YALNIZCA yerel ağa 8765 numaralı bağlantı noktasını açar.
# İnternetten erişime açılmaz (RemoteAddress = LocalSubnet). Kaldırmak için: Remove-NetFirewallRule -DisplayName "YOKDIL Kelime (telefon)"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}
Remove-NetFirewallRule -DisplayName "YOKDIL Kelime (telefon)" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "YOKDIL Kelime (telefon)" -Direction Inbound -Protocol TCP -LocalPort 8765 -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null
Write-Host "Tamam: yerel agdaki telefonlar 8765 numarali baglanti noktasina baglanabilir."
Start-Sleep -Seconds 3
