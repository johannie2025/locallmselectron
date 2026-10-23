# Wise Design Learning Systems - tache planifiee SYSTEM (toutes les minutes) :
#  1) politique USB : seules les cles listees dans allowed-usb.txt sont utilisables ; tout le reste est bloque (peripheriques de stockage) ;
#  2) cle de maintenance : si une cle USB autorisee porte WLS-Maintenance\maintenance.json SIGNE (verifie par l'application), pose le drapeau
#     sys\maintenance.on (dossier non modifiable par les utilisateurs) -> les applications deverrouillent tout ; retrait de la cle -> reverrouillage ;
#  3) mise a jour : si le fichier signe designe un installeur (hash SHA256 signe) present sur la cle, il est installe en silence puis le PC redemarre.
$ErrorActionPreference = 'SilentlyContinue'
$inst = Split-Path (Split-Path $PSScriptRoot)
$exe = (Get-ChildItem $inst -Filter *.exe | Where-Object { $_.Name -notmatch 'Uninstall|elevate' } | Select-Object -First 1).FullName
$data = Join-Path $env:ProgramData 'WiseDesignLMS'
$sys = Join-Path $data 'sys'
New-Item -ItemType Directory -Force -Path $sys | Out-Null
# dossier sys : lecture seule pour les utilisateurs
& icacls $sys /inheritance:r /grant 'SYSTEM:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
$usbFlag = Join-Path $data 'usb.unlock'
$mFlag = Join-Path $sys 'maintenance.on'

# ---- 1) cle de maintenance ----
$maint = $null
if ($exe) {
  foreach ($d in (Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2')) {
    $f = Join-Path ($d.DeviceID + '\') 'WLS-Maintenance\maintenance.json'
    if (-not (Test-Path -LiteralPath $f)) { continue }
    $text = (Get-Content -LiteralPath $f -Raw).Trim()
    $tmp = Join-Path $sys 'token.tmp'
    Set-Content -LiteralPath $tmp -Value $text -Encoding ASCII
    $p = Start-Process -FilePath $exe -ArgumentList @('--verify-maintenance', ('"' + $tmp + '"')) -Wait -PassThru -WindowStyle Hidden
    Remove-Item -LiteralPath $tmp -Force
    if ($p.ExitCode -ne 0) { continue }
    try {
      $b = $text.Split('.')[1].Replace('-', '+').Replace('_', '/')
      while ($b.Length % 4) { $b += '=' }
      $payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b)) | ConvertFrom-Json
      $maint = @{ dir = (Split-Path $f); payload = $payload }
      break
    } catch { }
  }
}
if ($maint) { Set-Content -LiteralPath $mFlag -Value $maint.payload.expires -Encoding ASCII } else { Remove-Item -LiteralPath $mFlag -Force }

# ---- 2) politique USB ----
# drapeau d'ouverture USB (cree par l'application apres saisie du mot de passe admin) : expire au bout d'une heure
if ((Test-Path $usbFlag) -and ((Get-Item $usbFlag).LastWriteTime -lt (Get-Date).AddHours(-1))) { Remove-Item $usbFlag -Force }
$unlock = (Test-Path $usbFlag) -or ($maint -ne $null)
$restr = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeviceInstall\Restrictions'
$classes = @('{4d36e967-e325-11ce-bfc1-08002be10318}', '{53f56307-b6bf-11d0-94f2-00a0c91efb8b}')  # disques / volumes
$allowFile = Join-Path $PSScriptRoot 'allowed-usb.txt'
$allowed = @()
$allowedInst = @()
if (Test-Path $allowFile) {
  $lines = @(Get-Content $allowFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
  $allowedInst = @($lines | Where-Object { $_ -like 'instance:*' } | ForEach-Object { $_.Substring(9) })
  # les identifiants generiques autoriseraient toutes les cles : ignores
  $allowed = @($lines | Where-Object { ($_ -notlike 'instance:*') -and ($_ -notmatch 'Gen') -and ($_ -ne 'USBSTOR\Disk') })
}
try {
  Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR' -Name Start -Value 3 -Type DWord
  Remove-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices' -Name Deny_All
  New-Item -Path $restr -Force | Out-Null
  if ($unlock) {
    Set-ItemProperty -Path $restr -Name DenyDeviceClasses -Value 0 -Type DWord
    Set-ItemProperty -Path $restr -Name DenyDeviceClassesRetroactive -Value 0 -Type DWord
  } else {
    Set-ItemProperty -Path $restr -Name DenyDeviceClasses -Value 1 -Type DWord
    Set-ItemProperty -Path $restr -Name DenyDeviceClassesRetroactive -Value 1 -Type DWord
    Set-ItemProperty -Path $restr -Name AllowDenyLayered -Value 1 -Type DWord
    $k = Join-Path $restr 'DenyDeviceClasses'; New-Item -Path $k -Force | Out-Null
    for ($i = 0; $i -lt $classes.Count; $i++) { Set-ItemProperty -Path $k -Name ([string]($i + 1)) -Value $classes[$i] -Type String }
    Set-ItemProperty -Path $restr -Name AllowDeviceIDs -Value ([int]($allowed.Count -gt 0)) -Type DWord
    Set-ItemProperty -Path $restr -Name AllowInstanceIDs -Value ([int]($allowedInst.Count -gt 0)) -Type DWord
    $k = Join-Path $restr 'AllowInstanceIDs'; New-Item -Path $k -Force | Out-Null
    for ($i = 0; $i -lt $allowedInst.Count; $i++) { Set-ItemProperty -Path $k -Name ([string]($i + 1)) -Value $allowedInst[$i] -Type String }
    $k = Join-Path $restr 'AllowDeviceIDs'; New-Item -Path $k -Force | Out-Null
    for ($i = 0; $i -lt $allowed.Count; $i++) { Set-ItemProperty -Path $k -Name ([string]($i + 1)) -Value $allowed[$i] -Type String }
  }
} catch { }

# ---- 2b) bureau Windows : en maintenance (cle ou mot de passe admin) = equivalent de Restaurer-Bureau.cmd ; sinon l'application redevient le shell ----
$wl = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
if ($unlock) { Set-ItemProperty -Path $wl -Name Shell -Value 'explorer.exe' -Type String }
elseif ($exe) { Set-ItemProperty -Path $wl -Name Shell -Value ('"' + $exe + '" --shell') -Type String }

# ---- 3) mise a jour par la cle ----
if ($maint -and $maint.payload.installer) {
  $ip = Join-Path $maint.dir $maint.payload.installer.name
  if (Test-Path -LiteralPath $ip) {
    $h = (Get-FileHash -LiteralPath $ip -Algorithm SHA256).Hash.ToLower()
    $marker = Join-Path $sys 'update.done'
    $done = ''; if (Test-Path $marker) { $done = (Get-Content $marker -Raw).Trim() }
    if (($h -eq $maint.payload.installer.sha256.ToLower()) -and ($h -ne $done)) {
      Set-Content -LiteralPath $marker -Value $h -Encoding ASCII
      Get-Process | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
      Start-Sleep -Seconds 3
      Start-Process -FilePath $ip -ArgumentList '/S' -Wait
      & shutdown.exe /r /t 60 /c 'Wise Design Learning Systems : mise a jour installee, redemarrage.'
    }
  }
}
