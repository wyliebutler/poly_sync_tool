Polyunity Google Drive Smart Sync Application
Project Type: Cross-Platform Desktop Application (Windows & macOS)
Objective: A background application that seamlessly maps local folders to Google Drive, utilizing a "Smart Local Caching" system to optimize local storage while treating Google Drive as the absolute source of truth.

1. Architecture & Tech Stack
Backend: Python (handling API interactions, file system logic, and OS-level operations).

Frontend: React (for a clean, modern user dashboard).

Integration: System Tray (Windows) / Menu Bar (macOS) integration for persistent background operation.

Packaging: PyInstaller, Tauri, or Electron to compile native .exe/.msi (Windows) and .app/.dmg (macOS) executables.

2. Core Functional Requirements
Google Drive as Backup Destination (Local-to-Cloud Push): The app maps local folders and pushes their contents up to Google Drive. Local modifications overwrite the cloud versions, treating local files as the source of truth for synchronization.

Eviction Engine (Auto-Delete): Files untouched locally for a set period (default 30 days) are automatically deleted from the local hard drive to save space, but remain intact on Google Drive. This frees up local capacity for completed projects.

The timeframe and excluded file extensions (e.g. .tmp, .log) are configurable by the user in the Settings tab.

Sync Triggers:

Scheduled: A background loop running at user-defined intervals (e.g., 15 mins, 60 mins).

Manual: A "Sync Now" button available in the UI to force an immediate push and eviction cycle.

Cloud Explorer: A dedicated tab allowing users to view their entire Drive tree.

3. UI/UX Design
The System Anchor (Tray/Menu Bar)
The app runs silently on startup with a persistent icon using Polyunity brand colors to indicate status:

Solid Color: Connected, authenticated, idle.

Spinning/Animated: Actively syncing.

Secondary Color/Subtle Indicator: Eviction engine running.

Red Dot/Warning: Offline or OAuth token expired.

Interaction: Clicking the icon opens a pop-over menu with "Connection Status", "Last Synced" time, a "Sync Now" trigger, and a shortcut to Open the Dashboard.

The Main Dashboard (React UI)

View A: Status Hub: Displays overall sync health, manual sync trigger, and an analytics widget showing "Storage Saved" via the eviction engine.

View B: Folder Mappings & Cloud Explorer: A visual interface to map local folders to remote Google Drive destinations. A separate Cloud Explorer tab lets users browse their Drive tree.

View C: Settings: Interface for configuring background sync intervals, adjusting the Eviction threshold, adding file exclusion filters, and toggling Dark Mode.

4. Authentication & Security
Access is strictly restricted to active @polyunity.com organization members.

Google Cloud Setup: Application registered as "Internal" in the OAuth Consent Screen to block external Google accounts at the server level.

Zero-Touch Login: On first launch, opens the default browser with the hd=polyunity.com parameter to streamline login.

App-Level Fail-Safe: The Python backend decodes the JWT ID token. If the email does not end with @polyunity.com, access is denied and local data is wiped.

Credential Storage: OAuth tokens are securely stored using the OS-native Windows Credential Manager and macOS Keychain (via the keyring library), completely avoiding plain-text storage.

5. Deployment & Execution
Startup Hook: The installers will configure the application to run automatically on system boot (Windows Registry write, macOS .plist LaunchAgent).

Connection Monitor: The app runs a 5-10 minute background "heartbeat" pinging the Google Drive API (drive/v3/about quota check) to verify internet and auth token validity, updating the System Tray icon accordingly.

Distribution: Installers (.msi for Windows, .dmg for Mac) will be hosted in a read-only shared Google Drive folder for team access, accompanied by a single-page setup PDF.