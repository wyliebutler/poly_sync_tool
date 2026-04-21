const { app, BrowserWindow, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Hardware acceleration left default.

let mainWindow;
let tray;
let pythonProcess;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.9),
    height: Math.floor(height * 0.9),
    show: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window is shown immediately now

  mainWindow.on('close', (event) => {
    // Prevent default closing, hide instead
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function startPythonBackend() {
  const { execSync } = require('child_process');
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM polyunity_sync_daemon.exe', { stdio: 'ignore' });
    } else {
      execSync('killall -9 polyunity_sync_daemon', { stdio: 'ignore' });
    }
  } catch (e) {
    // Ignore errors if process not found
  }

  if (app.isPackaged) {
    const backendPath = path.join(process.resourcesPath, 'backend');
    const executableName = process.platform === 'win32' ? 'polyunity_sync_daemon.exe' : 'polyunity_sync_daemon';
    const executable = path.join(backendPath, executableName);
    console.log('Starting Packaged Python backend at:', executable);
    pythonProcess = spawn(executable, [], {
      cwd: backendPath,
    });
  } else {
    const backendPath = path.join(__dirname, '../../backend');
    const pythonExecutable = process.platform === 'win32' 
      ? path.join(backendPath, 'venv', 'Scripts', 'python.exe')
      : path.join(backendPath, 'venv', 'bin', 'python');
    console.log('Starting Dev Python backend using:', pythonExecutable);
    pythonProcess = spawn(pythonExecutable, ['-m', 'uvicorn', 'api:app', '--host', '127.0.0.1', '--port', '8001'], {
      cwd: backendPath,
    });
  }

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Python Backend: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python Backend Error: ${data}`);
  });
}

function updateTrayStatus() {
  if (!tray) return;
  const { net } = require('electron');
  const request = net.request('http://127.0.0.1:8001/sync/status');
  
  request.on('response', (response) => {
    let data = '';
    response.on('data', (chunk) => data += chunk);
    response.on('end', () => {
      try {
        const json = JSON.parse(data);
        const lastSync = json.last_sync_timestamp ? new Date(json.last_sync_timestamp * 1000).toLocaleTimeString() : 'Never';
        const isSyncing = json.is_syncing;
        
        const contextMenu = Menu.buildFromTemplate([
          { label: isSyncing ? 'Status: Syncing...' : 'Status: Connected', enabled: false },
          { label: `Last Sync: ${lastSync}`, enabled: false },
          { type: 'separator' },
          { label: 'Show Dashboard', click: () => mainWindow.show() },
          { type: 'separator' },
          { label: 'Force Sync Now', click: () => triggerSync(), enabled: !isSyncing },
          { type: 'separator' },
          { label: 'Quit Polyunity Sync', click: () => {
            app.isQuitting = true;
            app.quit();
          }}
        ]);
        tray.setContextMenu(contextMenu);
      } catch (e) {
        console.error("Error parsing status:", e)
      }
    });
  });
  
  request.on('error', () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Status: Disconnected', enabled: false },
      { type: 'separator' },
      { label: 'Show Dashboard', click: () => mainWindow.show() },
      { type: 'separator' },
      { label: 'Quit Polyunity Sync', click: () => {
        app.isQuitting = true;
        app.quit();
      }}
    ]);
    tray.setContextMenu(contextMenu);
  });
  
  request.end();
}

function triggerSync() {
  const { net } = require('electron');
  const req = net.request({ method: 'POST', url: 'http://127.0.0.1:8001/sync/pull' });
  req.on('response', () => updateTrayStatus());
  req.end();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  // Resize icon for system tray so it fits properly
  const trayIcon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  
  updateTrayStatus();
  
  tray.setToolTip('Polyunity Smart Sync');
  tray.on('click', () => mainWindow.show());
  
  // Poll every 10 seconds
  setInterval(updateTrayStatus, 10000);
}

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
  createTray();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  // On macOS it is common for applications to stay open until the user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  if (pythonProcess) {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /pid ${pythonProcess.pid} /T /F`, { stdio: 'ignore' });
      } catch (e) {}
    } else {
      pythonProcess.kill();
    }
  }
  process.exit(0);
});
