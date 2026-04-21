# Polyunity Sync Data Architecture

This document outlines how and where the Polyunity Sync application stores its configuration, state, and authentication data across different operating systems.

## 1. User-Specific Configuration

To ensure the application functions correctly in multi-user environments and adheres to standard OS permissions (avoiding `PermissionError` in `C:\Program Files`), all user-specific state is strictly isolated to the user's home directory.

**Storage Location:**
- **Windows:** `C:\Users\<YourUsername>\.polyunity_sync\`
- **macOS:** `/Users/<YourUsername>/.polyunity_sync/`

**Files Stored Here:**
- **`settings.json`**: Contains user preferences (sync intervals, eviction thresholds, exclusions, UI theme).
- **`mappings.json`**: Contains the specific local-to-cloud directory mappings created by the user.

## 2. Authentication Tokens

OAuth tokens provide access to the user's Google Drive. These must be securely stored and strictly isolated.

**Storage Mechanism:**
Instead of writing raw JSON tokens to the disk, the application leverages the `keyring` Python library.
- **Windows:** Tokens are securely encrypted and stored within the **Windows Credential Manager**.
- **macOS:** Tokens are securely stored inside the **macOS Keychain**.

This guarantees that tokens are cryptographically locked to the active user's OS session and cannot be extracted or overwritten by other users on the same machine.

## 3. Global Application Identity

The application needs to identify itself to the Google API regardless of which user is currently running it.

**Storage Location:**
- Inside the application installation directory (e.g., alongside the `polyunity_sync_daemon.exe` or `api.py`).

**Files Stored Here:**
- **`client_secrets.json`**: The global Google Cloud OAuth Client ID and Secret. This file is strictly read-only for standard users and is universally shared across the application.
