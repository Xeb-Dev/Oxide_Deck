[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$FolderName = "",

    [Parameter(Mandatory=$false)]
    [string]$ReleaseName = "",

    [Parameter(Mandatory=$false)]
    [switch]$ApkOnly,

    [Parameter(Mandatory=$false)]
    [switch]$ExeOnly
)

$ErrorActionPreference = "Stop"

# Resolve Workspace Root and Releases Base Directory
$WorkspaceRoot = "c:\Users\Mark\vscode proj\Tauri\Oxide_deck\oxide_deck"
$BaseReleasesDir = "C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases"

# Determine target folder name
if ([string]::IsNullOrWhiteSpace($FolderName)) {
    if (-not [string]::IsNullOrWhiteSpace($ReleaseName)) {
        $FolderName = $ReleaseName
    } else {
        $timestamp = Get-Date -Format "yyyy.MM.dd"
        $inputName = Read-Host "Enter release folder name / version (e.g. 1.0.0, v1.0.0, $timestamp)"
        if ([string]::IsNullOrWhiteSpace($inputName)) {
            $FolderName = $timestamp
        } else {
            $FolderName = $inputName.Trim()
        }
    }
}

# Clean folder name (remove invalid filename characters)
[System.IO.Path]::GetInvalidFileNameChars() | ForEach-Object { $FolderName = $FolderName.Replace($_, "_") }
$FolderName = $FolderName.Trim()
if ([string]::IsNullOrWhiteSpace($FolderName)) {
    $FolderName = "1.0.0"
}

# Create output directories: both specific subfolder and base Releases folder
$TargetReleaseDir = Join-Path $BaseReleasesDir $FolderName
if (-not (Test-Path $TargetReleaseDir)) {
    New-Item -ItemType Directory -Path $TargetReleaseDir -Force | Out-Null
}

# Exact file names requested by user:
# 1) OxideDeck-(folder name)_x64-windows-setup.exe
# 2) OxideDeck-(folder name)-mobile-android.apk
$ExeSetupName = "OxideDeck-$FolderName`_x64-windows-setup.exe"
$ExeStandaloneName = "OxideDeck-$FolderName`_x64-windows.exe"
$ApkName = "OxideDeck-$FolderName-mobile-android.apk"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Oxide Deck - Automated Production Release Builder" -ForegroundColor Cyan
Write-Host "  Release Folder:   $FolderName" -ForegroundColor Yellow
Write-Host "  Destination Path: $TargetReleaseDir" -ForegroundColor Yellow
Write-Host "  Windows Target:   $ExeSetupName" -ForegroundColor Yellow
Write-Host "  Android Target:   $ApkName" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$buildExe = -not $ApkOnly
$buildApk = -not $ExeOnly

# 1. Build Windows Desktop .exe
if ($buildExe) {
    Write-Host "`n[1/2] Compiling Windows Desktop Release (.exe / installer)..." -ForegroundColor Green
    Push-Location $WorkspaceRoot
    try {
        & pnpm tauri build
        if ($LASTEXITCODE -ne 0) {
            throw "Tauri Windows build failed with exit code $LASTEXITCODE"
        }

        # Check for NSIS installer
        $nsisFolder = Join-Path $WorkspaceRoot "src-tauri\target\release\bundle\nsis"
        $installerFound = $false
        if (Test-Path $nsisFolder) {
            $installer = Get-ChildItem -Path $nsisFolder -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($installer) {
                $targetSetupPath = Join-Path $TargetReleaseDir $ExeSetupName
                Copy-Item -Path $installer.FullName -Destination $targetSetupPath -Force
                Copy-Item -Path $installer.FullName -Destination (Join-Path $BaseReleasesDir $ExeSetupName) -Force
                $instSize = (Get-Item $targetSetupPath).Length / 1MB
                Write-Host (" -> Saved Windows Setup:      {0} ({1:N2} MB)" -f $targetSetupPath, $instSize) -ForegroundColor Cyan
                $installerFound = $true
            }
        }

        # Standalone executable
        $standaloneExe = Join-Path $WorkspaceRoot "src-tauri\target\release\Oxide Deck.exe"
        if (-not (Test-Path $standaloneExe)) {
            $standaloneExe = Join-Path $WorkspaceRoot "src-tauri\target\release\oxide_deck.exe"
        }
        if (Test-Path $standaloneExe) {
            $targetExePath = Join-Path $TargetReleaseDir $ExeStandaloneName
            Copy-Item -Path $standaloneExe -Destination $targetExePath -Force
            Copy-Item -Path $standaloneExe -Destination (Join-Path $BaseReleasesDir $ExeStandaloneName) -Force
            $exeSize = (Get-Item $targetExePath).Length / 1MB
            Write-Host (" -> Saved Windows Executable: {0} ({1:N2} MB)" -f $targetExePath, $exeSize) -ForegroundColor Cyan
            
            if (-not $installerFound) {
                $fallbackSetup = Join-Path $TargetReleaseDir $ExeSetupName
                Copy-Item -Path $standaloneExe -Destination $fallbackSetup -Force
                Copy-Item -Path $standaloneExe -Destination (Join-Path $BaseReleasesDir $ExeSetupName) -Force
            }
        }
    }
    finally {
        Pop-Location
    }
}

# 2. Build Android .apk
if ($buildApk) {
    Write-Host "`n[2/2] Compiling Android Release (.apk)..." -ForegroundColor Green
    Push-Location $WorkspaceRoot
    try {
        & pnpm tauri android build --apk
        if ($LASTEXITCODE -ne 0) {
            throw "Tauri Android build failed with exit code $LASTEXITCODE"
        }

        $apkSource = Join-Path $WorkspaceRoot "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk"
        if (-not (Test-Path $apkSource)) {
            $apkSourceObj = Get-ChildItem -Path (Join-Path $WorkspaceRoot "src-tauri\gen\android\app\build\outputs\apk") -Filter "*-release.apk" -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($apkSourceObj) {
                $apkSource = $apkSourceObj.FullName
            }
        }

        if (Test-Path $apkSource) {
            $targetApkPath = Join-Path $TargetReleaseDir $ApkName
            Copy-Item -Path $apkSource -Destination $targetApkPath -Force
            Copy-Item -Path $apkSource -Destination (Join-Path $BaseReleasesDir $ApkName) -Force
            $apkSize = (Get-Item $targetApkPath).Length / 1MB
            Write-Host (" -> Saved Android APK:        {0} ({1:N2} MB)" -f $targetApkPath, $apkSize) -ForegroundColor Cyan
        } else {
            Write-Warning "Could not locate output APK at $apkSource"
        }
    }
    finally {
        Pop-Location
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  Release Build Finished Successfully!" -ForegroundColor Green
Write-Host "  Location: $TargetReleaseDir" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
Get-ChildItem -Path $TargetReleaseDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
