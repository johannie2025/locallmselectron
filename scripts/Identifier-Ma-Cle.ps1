# Affiche les identifiants materiels des cles USB branchees (a coller dans allowed-usb.txt)
$out = @()
foreach ($d in (Get-PnpDevice -Class DiskDrive | Where-Object { $_.InstanceId -like 'USBSTOR*' })) {
  Write-Host ''
  Write-Host ('Cle : ' + $d.FriendlyName)
  $ids = @((Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_HardwareIds').Data)
  $par = (Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName 'DEVPKEY_Device_Parent').Data
  if ($par) { $ids += @((Get-PnpDeviceProperty -InstanceId $par -KeyName 'DEVPKEY_Device_HardwareIds').Data) }
  $ids | Where-Object { $_ } | ForEach-Object { Write-Host $_; $out += $_ }
}
if ($out.Count) {
  $f = Join-Path (Get-Location) 'allowed-usb-propose.txt'
  Set-Content -Path $f -Value $out
  Write-Host ''
  Write-Host ('Ecrit dans : ' + $f + '  -> copiez les lignes utiles dans scripts\allowed-usb.txt')
} else { Write-Host 'Aucune cle USB de stockage detectee.' }
