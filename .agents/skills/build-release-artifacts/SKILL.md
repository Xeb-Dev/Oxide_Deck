---
name: build-release-artifacts
description: >-
  Automates building production release artifacts for Oxide Deck (.apk for Android and .exe for Windows Desktop)
  and saves them into C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases\ with the user's chosen release name.
  Use this skill whenever the user asks to build, compile, package, or export release versions, APKs, or EXE installers.
---

# Build Release Artifacts for Oxide Deck

This skill automates compiling production releases for **Android (`.apk`)** and **Windows Desktop (`.exe` / installer)**, and exports the final binary files to `C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases\` using the custom name provided by the user.

## Workflow

### 1. Identify or Prompt for the Release Name
- If the user provided a release name (e.g. `OxideDeck_v1.0.0`, `OxideDeck_Release_Aug29`), use it directly.
- If not provided in the user's prompt, ask or use a default timestamped name format (e.g. `OxideDeck_YYYYMMDD_HHMMSS`).

### 2. Execute the Release Build Script
Run the PowerShell build script located at [`scripts/build_releases.ps1`](./scripts/build_releases.ps1):

```powershell
powershell -ExecutionPolicy Bypass -File ".agents/skills/build-release-artifacts/scripts/build_releases.ps1" -ReleaseName "<ReleaseName>"
```

#### Optional Flags:
- **Build both APK & EXE (Default)**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File ".agents/skills/build-release-artifacts/scripts/build_releases.ps1" -ReleaseName "OxideDeck_v1.0"
  ```
- **Android APK Only**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File ".agents/skills/build-release-artifacts/scripts/build_releases.ps1" -ReleaseName "OxideDeck_v1.0" -ApkOnly
  ```
- **Windows EXE Only**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File ".agents/skills/build-release-artifacts/scripts/build_releases.ps1" -ReleaseName "OxideDeck_v1.0" -ExeOnly
  ```

### 3. Verification & Output Location
All compiled artifacts are saved to:
`C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases\`

- **Android APK**: `C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases\<ReleaseName>.apk`
- **Windows Executable**: `C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases\<ReleaseName>.exe`
- **Windows Installer**: `C:\Users\Mark\vscode proj\Tauri\Oxide_deck\Releases\<ReleaseName>_setup.exe` (if generated)
