# Polyunity Sync App — Architecture & Cross-Platform Build Process

This document outlines the high-level architecture of the Polyunity Sync App and details the dual-build pipeline required to generate native installers for both **macOS (`.dmg`)** and **Windows (`.msi`)**.

## 1. High-Level Architecture

The application is built using a hybrid **Electron + Python** architecture. This ensures cross-platform compatibility while maintaining high-performance file synchronization logic.

*   **Frontend (React + Vite + Electron):** 
    Provides the Graphical User Interface (GUI). The Electron core (`main.cjs`) dynamically detects the operating system executing the app (`win32` or `darwin`) and spawns the correct local Native Python backend process. It proactively handles lifecycle events like forcefully terminating orphaned `"zombie"` background daemons upon startup to prevent port-binding conflicts.
    
*   **Backend (Python + FastAPI):**
    Handles OAuth, Google Drive APIs, file watching, and local filesystem orchestration. It listens natively on `127.0.0.1:8001`. Because macOS strictly denies Keychain access for unsigned developer apps, the backend dynamically falls back to a flat-file JSON credentials cache (`~/.polyunity_sync_token.json`) when Apple Gatekeeper enforces constraints.

*   **The Orchestration:** 
    Upon launching, the Electron Application suppresses the UI until the heavy PyInstaller payload fully extracts and binds its network sockets. Once a successful heartbeat is detected, the Electron UI transitions into its native state.

---

## 2. The Twin Build Pipelines

Because Python code must be compiled into native hardware-specific executables (using `pyinstaller`), **you must compile the app on the host operating system you are targeting.**

### A. Windows Build Pipeline (`.msi`)
_Must be executed on a Windows physical or virtual machine._

1.  **Compile Python to Native `.exe`**
    ```bash
    cd backend
    ./venv/Scripts/activate
    pip install -r requirements.txt # Or install dependencies
    pyinstaller --noconfirm polyunity_sync_daemon.spec
    ```
    This generates `polyunity_sync_daemon.exe` inside `backend/dist`.

2.  **Package Electron MSI**
    ```bash
    cd frontend
    npm run build:msi
    ```
    This seamlessly packages the `polyunity_sync_daemon.exe` payload natively via `electron-builder` and produces an installer.

### B. macOS Build Pipeline (`.dmg`)
_Must be executed on a macOS physical or Apple Silicon virtual machine._

1.  **Compile Python to Native `.app` Mach-O Binary**
    ```bash
    cd backend
    source venv/bin/activate
    pip install -r requirements.txt # Or install dependencies natively via pip
    pyinstaller --noconfirm polyunity_sync_daemon.spec
    ```
    This generates a Unix executable natively bound to the Mac architecture (`polyunity_sync_daemon`).

2.  **Package Electron DMG**
    ```bash
    cd frontend
    # Suppress Code Signing constraints for Ad-Hoc beta testing
    export CSC_IDENTITY_AUTO_DISCOVERY=false 
    npm run build:mac
    ```
    *   **Gatekeeper Awareness:** `electron-builder` checks the `package.json` for customized macOS bindings (explicitly `mac.binaries`). It unpacks the internal Python binary and natively synchronizes its Ad-Hoc cryptographic signature to perfectly match the main Electron `.app` framework, effectively guaranteeing it bypasses Gatekeeper tampering checks.

---

## 3. Notable Gotchas & Behaviors

*   **Network / ExFAT Volume Constraints:** Building inside natively formatted drives (APFS for Mac / NTFS for Windows) is highly recommended. Cross-platform ExFAT volumes often break npm symlinks and severely throttle Python `venv` compilations.
*   **Zero-Touch Cleanup:** The Electron node explicitly issues `killall -9 polyunity_sync_daemon` (or `taskkill /F`) on launch. 
*   **Startup Heartbeat:** Because PyInstaller binaries take up to ~4 seconds to defensively unpack into memory during a cold-start, the React App's `checkAuth` loop natively loops internal polling up to 20 seconds before signaling a network fetch timeout to the UI.
