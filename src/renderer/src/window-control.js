// window-control.js
const { ipcRenderer } = require('electron');

function minimizeWindow() {
  ipcRenderer.send('window-minimize');
}

function maximizeWindow() {
  ipcRenderer.send('window-maximize');
}

function closeWindow() {
  ipcRenderer.send('window-close');
}

module.exports = { minimizeWindow, maximizeWindow, closeWindow };