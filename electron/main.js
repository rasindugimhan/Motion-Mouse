const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

// Spawn python child process for OS control
let pythonProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Allows webcam tracking and requestAnimationFrame while minimized
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Grant media permissions
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'media') {
      return true;
    }
    return false;
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Start python script
  pythonProcess = spawn('python', ['-u', path.join(__dirname, 'mouse_control.py')]);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
      sendCommand({ type: 'quit' });
      if (pythonProcess.stdin) pythonProcess.stdin.end();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
    if (pythonProcess) {
        sendCommand({ type: 'quit' });
        if (pythonProcess.stdin) pythonProcess.stdin.end();
    }
});

// OS Control Logic
let isActive = true;
// Assuming standard 1080p screen for normalized mapping if no screen width info
let screenWidth = 1920;
let screenHeight = 1080;

// Try to get screen size dynamically using electron's screen module after ready
app.whenReady().then(() => {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    screenWidth = primaryDisplay.size.width;
    screenHeight = primaryDisplay.size.height;
});

ipcMain.on('toggle-control', () => {
    isActive = !isActive;
    console.log("OS Control Active:", isActive);
});

function sendCommand(cmd) {
    if (pythonProcess && pythonProcess.stdin && pythonProcess.stdin.writable) {
        try {
            pythonProcess.stdin.write(JSON.stringify(cmd) + '\n');
        } catch (e) {
            console.log("Failed to send command to python:", e.message);
        }
    }
}

ipcMain.on('move-mouse', (event, x, y) => {
    if (!isActive) return;
    // Pass normalized coordinates directly (0.0 to 1.0)
    // Python's pyautogui will handle the screen resolution mapping
    sendCommand({ type: 'move', x: x, y: y });
});

let clickingState = { left: false, right: false, middle: false };
ipcMain.on('mouse-click', (event, isDown, button = 'left') => {
    if (!isActive) return;
    if (isDown && !clickingState[button]) {
        sendCommand({ type: 'click', down: true, button: button });
        clickingState[button] = true;
    } else if (!isDown && clickingState[button]) {
        sendCommand({ type: 'click', down: false, button: button });
        clickingState[button] = false;
    }
});

ipcMain.on('mouse-scroll', (event, direction) => {
    if (!isActive) return;
    const amount = direction === 'up' ? 100 : -100;
    sendCommand({ type: 'scroll', amount: amount });
});

ipcMain.on('quit-app', () => {
    app.quit();
});
