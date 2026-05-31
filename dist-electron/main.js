//#region electron/main.js
var { app, BrowserWindow, ipcMain } = require("electron");
var path = require("path");
var { spawn } = require("child_process");
var mainWindow;
var pythonProcess = null;
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 720,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
			backgroundThrottling: false
		}
	});
	if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
	mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
		if (permission === "media") callback(true);
		else callback(false);
	});
	mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
		if (permission === "media") return true;
		return false;
	});
}
app.whenReady().then(() => {
	createWindow();
	pythonProcess = spawn("python", ["-u", path.join(__dirname, "mouse_control.py")]);
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
app.on("window-all-closed", () => {
	if (pythonProcess) {
		sendCommand({ type: "quit" });
		if (pythonProcess.stdin) pythonProcess.stdin.end();
	}
	if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
	if (pythonProcess) {
		sendCommand({ type: "quit" });
		if (pythonProcess.stdin) pythonProcess.stdin.end();
	}
});
var isActive = true;
app.whenReady().then(() => {
	const { screen } = require("electron");
	const primaryDisplay = screen.getPrimaryDisplay();
	primaryDisplay.size.width;
	primaryDisplay.size.height;
});
ipcMain.on("toggle-control", () => {
	isActive = !isActive;
	console.log("OS Control Active:", isActive);
});
function sendCommand(cmd) {
	if (pythonProcess && pythonProcess.stdin && pythonProcess.stdin.writable) try {
		pythonProcess.stdin.write(JSON.stringify(cmd) + "\n");
	} catch (e) {
		console.log("Failed to send command to python:", e.message);
	}
}
ipcMain.on("move-mouse", (event, x, y) => {
	if (!isActive) return;
	sendCommand({
		type: "move",
		x,
		y
	});
});
var clickingState = {
	left: false,
	right: false,
	middle: false
};
ipcMain.on("mouse-click", (event, isDown, button = "left") => {
	if (!isActive) return;
	if (isDown && !clickingState[button]) {
		sendCommand({
			type: "click",
			down: true,
			button
		});
		clickingState[button] = true;
	} else if (!isDown && clickingState[button]) {
		sendCommand({
			type: "click",
			down: false,
			button
		});
		clickingState[button] = false;
	}
});
ipcMain.on("mouse-scroll", (event, direction) => {
	if (!isActive) return;
	sendCommand({
		type: "scroll",
		amount: direction === "up" ? 100 : -100
	});
});
ipcMain.on("quit-app", () => {
	app.quit();
});
//#endregion
