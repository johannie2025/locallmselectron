<#
 Wise Design Learning Systems - gestion des comptes Windows du poste.
 A lancer en ADMINISTRATEUR, de preference via Mode-Cybercafe.cmd (menu).

 Actions :
   List     liste les comptes locaux, leur type (administrateur / standard) et leur mode
   Create   cree un compte Windows STANDARD pour les eleves
   Enable   mode CYBERCAFE pour un compte : l'application remplace le bureau Windows a l'ouverture de session
            (pas d'explorateur, pas de barre des taches : comme un poste de cybercafe)
   Disable  retablit le bureau Windows normal pour ce compte

 Le mode cybercafe s'applique a UN compte : les comptes administrateurs gardent leur bureau (maintenance).
 Les comptes administrateurs sont refuses par Enable, pour ne jamais vous enfermer dehors.
#>
param(
  [ValidateSet('List', 'Create', 'Enable', 'Disable')][string]$Action = 'List',
  [string]$User = ''
)
$ErrorActionPreference = 'Stop'
$WL = 'Software\Microsoft\Windows NT\CurrentVersion\Winlogon'

function Test-Admin {
  ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-AppExe {
  # scripts\ est installe dans <dossier d'installation>\resources\scripts
  $candidate = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'Wise Design Learning Systems.exe'
  if (Test-Path $candidate) { return $candidate }
  $run = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'WiseDesignLearningSystems' -ErrorAction SilentlyContinue).WiseDesignLearningSystems
  if ($run) { $p = $run.Trim('"'); if (Test-Path $p) { return $p } }
  throw "Application introuvable. Installez d'abord Wise Design Learning Systems (version installeur)."
}

function Test-LocalAdmin([string]$Name) {
  $members = Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction SilentlyContinue
  foreach ($m in $members) { if ($m.Name -ieq $Name -or $m.Name -like "*\$Name") { return $true } }
  return $false
}

# Ouvre la ruche de registre (HKCU) d'un compte, meme s'il n'est pas connecte, execute le bloc, puis la referme.
function Use-UserHive([string]$Name, [scriptblock]$Body) {
  $sid = (New-Object System.Security.Principal.NTAccount($Name)).Translate([System.Security.Principal.SecurityIdentifier]).Value
  $loaded = Test-Path "Registry::HKEY_USERS\$sid"
  $tmp = 'WLS_TMP_HIVE'
  if ($loaded) {
    $root = "Registry::HKEY_USERS\$sid"
  } else {
    $profile = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$sid" -ErrorAction SilentlyContinue).ProfileImagePath
    if (-not $profile -or -not (Test-Path "$profile\NTUSER.DAT")) {
      throw "Le compte '$Name' n'a jamais ouvert de session : connectez-vous une fois avec ce compte, puis recommencez."
    }
    reg load "HKU\$tmp" "$profile\NTUSER.DAT" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Impossible de charger le profil de '$Name' (session ouverte ailleurs ?)." }
    $root = "Registry::HKEY_USERS\$tmp"
  }
  try {
    return (& $Body $root)
  } finally {
    if (-not $loaded) {
      [gc]::Collect(); [gc]::WaitForPendingFinalizers(); Start-Sleep -Milliseconds 300
      reg unload "HKU\$tmp" | Out-Null
    }
  }
}

function Get-ShellState([string]$Name) {
  try {
    return (Use-UserHive $Name {
      param($root)
      $v = (Get-ItemProperty "$root\$WL" -Name 'Shell' -ErrorAction SilentlyContinue).Shell
      if ($v -and $v -like '*--shell*') { 'CYBERCAFE' } else { 'bureau normal' }
    })
  } catch { return '?' }
}

function Read-UserName {
  if ($User) { return $User }
  $n = Read-Host 'Nom du compte Windows'
  if (-not $n) { throw 'Nom de compte manquant.' }
  return $n.Trim()
}

try {
  if (-not (Test-Admin)) { throw 'Ce script doit etre lance en administrateur (utilisez Mode-Cybercafe.cmd).' }

  switch ($Action) {
    'List' {
      Get-LocalUser | Where-Object { $_.Enabled } | ForEach-Object {
        [pscustomobject]@{ Compte = $_.Name; Type = $(if (Test-LocalAdmin $_.Name) { 'ADMINISTRATEUR' } else { 'standard' }); Mode = (Get-ShellState $_.Name) }
      } | Format-Table -AutoSize
    }
    'Create' {
      $name = Read-UserName
      $pwd1 = Read-Host "Mot de passe de '$name' (6 caracteres minimum)" -AsSecureString
      $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwd1))
      if ($plain.Length -lt 6) { throw 'Mot de passe trop court.' }
      New-LocalUser -Name $name -Password $pwd1 -PasswordNeverExpires -UserMayNotChangePassword -FullName 'Poste eleve' | Out-Null
      Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $name
      Write-Host "Compte standard '$name' cree. Ouvrez une session UNE FOIS avec ce compte (pour creer son profil), puis activez le mode cybercafe." -ForegroundColor Green
    }
    'Enable' {
      $name = Read-UserName
      if (Test-LocalAdmin $name) { throw "'$name' est administrateur : mode cybercafe refuse (il vous priverait du bureau de maintenance)." }
      $exe = Get-AppExe
      Use-UserHive $name {
        param($root)
        $k = "$root\$WL"
        if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
        Set-ItemProperty -Path $k -Name 'Shell' -Value ('"{0}" --shell' -f $exe)
      } | Out-Null
      Write-Host "Mode cybercafe ACTIVE pour '$name' : a sa prochaine ouverture de session, l'application remplace le bureau Windows." -ForegroundColor Green
      Write-Host "Depannage : Ctrl+Alt+Suppr > Se deconnecter ; maintenance par le super-administrateur depuis l'application (ouvre le bureau)."
    }
    'Disable' {
      $name = Read-UserName
      Use-UserHive $name {
        param($root)
        Remove-ItemProperty -Path "$root\$WL" -Name 'Shell' -ErrorAction SilentlyContinue
      } | Out-Null
      Write-Host "Mode cybercafe DESACTIVE pour '$name' : bureau Windows normal a sa prochaine ouverture de session." -ForegroundColor Green
    }
  }
} catch {
  Write-Host ("ERREUR : " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
