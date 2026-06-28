const { app, BrowserWindow } = require("electron");
const path = require("path");

// ponytail: minimal electron wrapper — webview to the Next.js frontend
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, "icon.ico"),
    title: "Market Aquarium",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(FRONTEND_URL);
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
