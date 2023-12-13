const { app, BrowserWindow } = require('electron');

let mainWindow;

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true // Habilita Node.js en el contexto de la ventana
    }
  });

  mainWindow.loadFile('index.html'); // Carga un archivo HTML en la ventana principal

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});