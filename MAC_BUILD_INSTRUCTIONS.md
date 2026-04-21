# Polyunity Sync - macOS Build Instructions

This document outlines the steps to build a production-ready, code-signed, and Gatekeeper-compliant macOS installer (`.dmg`) for the Polyunity Sync application.

## Prerequisites

Because Apple restricts code signing and notarization to macOS environments, you **must** perform these steps on a physical Mac or a macOS virtual machine. 

1. **Node.js & npm:** Ensure Node.js (v18+) is installed.
2. **Python:** Ensure Python 3 is installed.
3. **Apple Developer Account:** You must have an active Apple Developer Program membership.
4. **Xcode Command Line Tools:** Install them by running `xcode-select --install` in your terminal.

## 1. Configure Certificates

Before building, you must install your Apple Developer ID certificates into your Mac's **Keychain Access**.

1. Open Xcode -> Settings -> Accounts.
2. Sign in with your Apple ID.
3. Click "Manage Certificates..." and ensure you have a **Developer ID Application** certificate installed.
   - *Note: `electron-builder` will automatically detect this certificate in your keychain during the build process.*

## 2. Prepare the Environment

1. Open your terminal and navigate to the project root:
   ```bash
   cd path/to/POLYUNITY_SYNC_APP
   ```
2. Navigate into the `frontend` directory and install dependencies:
   ```bash
   cd frontend
   npm install
   ```

## 3. Build the Installer

The codebase has already been pre-configured with the necessary Apple Entitlements (`frontend/build/entitlements.mac.plist` and `entitlements.mac.inherit.plist`) and the Hardened Runtime configurations required by macOS Gatekeeper.

To start the build, run:

```bash
npm run build:mac
```

### What happens during this command:
1. **Vite Build:** Compiles the React frontend into static assets.
2. **Backend Bundling:** Copies the local Python `backend` folder into the Electron package.
3. **Electron Packaging:** Wraps everything into a Mac `.app` bundle.
4. **Code Signing:** `electron-builder` finds your Developer ID Application certificate in the Keychain, applies the Hardened Runtime entitlements, and cryptographically signs the `.app` bundle.
5. **DMG Creation:** Generates a polished `Polyunity Sync.dmg` installer in the `frontend/release/` directory.

## 4. Troubleshooting Gatekeeper

If the generated `.dmg` still throws a warning when shared with other users, it means the app needs to be **Notarized** by Apple's servers. 

To enable automatic notarization in the future:
1. Generate an App-Specific Password from your Apple ID account page.
2. Export it as an environment variable in your terminal before running the build:
   ```bash
   export APPLE_ID="your.email@polyunity.com"
   export APPLE_ID_PASSWORD="your-app-specific-password"
   export APPLE_TEAM_ID="YOUR_10_CHAR_TEAM_ID"
   ```
3. `electron-builder` will detect these credentials and automatically upload the app to Apple's notary service during `npm run build:mac`.
