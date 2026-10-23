# Affiche les identifiants materiels des cles USB branchees (a coller dans allowed-usb.txt).
# Les identifiants generiques (GenDisk...) sont ecartes : ils autoriseraient toutes les cles.
# Les lignes "instance:" (numero de serie) restreignent a VOTRE cle precise.
$out = @()
foreach ($d in (Get-PnpDevice -Class DiskDrive | Where-Object { $_.InstanceId -like 'USBSTOR*' })) {
  Write-Host ''
  Write-Host ('Cle : ' + $d.FriendlyName)
  $out += ('# Cle : ' + $d.FriendlyName)
  $ids = @((Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds').Data)
  $par = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_Parent').Data
  if ($par) { $ids += @((Get-PnpDeviceProperty -InstanceId $par -KeyName 'DEVPKEY_Device_HardwareIds').Data) }
  $ids | Where-Object { $_ -and ($_ -notmatch 'Gen') -and ($_ -ne 'USBSTOR\Disk') } | ForEach-Object { Write-Host $_; $out += $_ }
  Write-Host ('instance:' + $d.InstanceId); $out += ('instance:' + $d.InstanceId)
  if ($par) { Write-Host ('instance:' + $par); $out += ('instance:' + $par) }
}
if ($out.Count) {
  $f = Join-Path (Get-Location) 'allowed-usb-propose.txt'
  Set-Content -Path $f -Value $out
  Write-Host ''
  Write-Host ('Ecrit dans : ' + $f + '  -> copiez les lignes utiles dans scripts\allowed-usb.txt')
} else { Write-Host 'Aucune cle USB de stockage detectee.' }
