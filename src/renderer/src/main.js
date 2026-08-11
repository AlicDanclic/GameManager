// main.js
const { ipcRenderer } = require('electron');
const state = require('./state.js');
const { loadSettings, saveSettings, launchMtool, launchTranslator,
        selectTranslatorTool, selectMtoolPath, selectLocaleEmulator } = require('./settings.js');
const { setupNavigation } = require('./navigation.js');
const { setupDropZone } = require('./game-drop.js');
const { setupModals, setupGameTypeToggle, closeAddGameModal, confirmAddGame,
        selectGameExe, selectSaveFolder, openAddGameModal } = require('./game-modal.js');
const { loadGames, launchGame, deleteGame, selectGameImage,
        openGameFolder, openSaveFolder, editGame } = require('./game-core.js');
const { openGuide, closeGuideModal, addGuideNode, clearGuide,
        exportGuide, importGuide, deleteGuideNode, addPort, removePort,
        updatePortLabel, updateNodeTitle, startConnection, startNodeDrag,
        flipGuideNode } = require('./guide-editor.js');
const { packGame, deleteSourceFiles } = require('./pack-delete.js');
const { minimizeWindow, maximizeWindow, closeWindow } = require('./window-control.js');

// 挂载到 window 供内联 onclick 调用
window.minimizeWindow = minimizeWindow;
window.maximizeWindow = maximizeWindow;
window.closeWindow = closeWindow;

window.launchTranslator = launchTranslator;
window.launchMtool = launchMtool;

window.selectTranslatorTool = selectTranslatorTool;
window.selectMtoolPath = selectMtoolPath;
window.selectLocaleEmulator = selectLocaleEmulator;
window.saveSettings = saveSettings;

window.openAddGameModal = openAddGameModal;
window.closeAddGameModal = closeAddGameModal;
window.confirmAddGame = confirmAddGame;
window.selectGameExe = selectGameExe;
window.selectSaveFolder = selectSaveFolder;

window.launchGame = launchGame;
window.deleteGame = deleteGame;
window.selectGameImage = selectGameImage;
window.openGameFolder = openGameFolder;
window.openSaveFolder = openSaveFolder;
window.editGame = editGame;

window.openGuide = openGuide;
window.closeGuideModal = closeGuideModal;
window.addGuideNode = addGuideNode;
window.clearGuide = clearGuide;
window.exportGuide = exportGuide;
window.importGuide = importGuide;
window.deleteGuideNode = deleteGuideNode;
window.addPort = addPort;
window.removePort = removePort;
window.updatePortLabel = updatePortLabel;
window.updateNodeTitle = updateNodeTitle;
window.startConnection = startConnection;
window.startNodeDrag = startNodeDrag;
window.flipGuideNode = flipGuideNode;

window.packGame = packGame;
window.deleteSourceFiles = deleteSourceFiles;

// 让其他模块可以访问 games（导出到 window 供 guide-editor 使用）
window.games = state.games;

// 监听打包进度
ipcRenderer.on('pack-progress', (event, progress) => {
  const percent = progress.percent || 0;
  const status = progress.status || '';
  const fill = document.getElementById('pack-progress-fill');
  const statusEl = document.getElementById('pack-progress-status');
  if (fill) fill.style.width = percent + '%';
  if (statusEl) statusEl.textContent = status;
});

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadGames();
  setupNavigation();
  setupDropZone();
  setupModals();
  setupGameTypeToggle();
});