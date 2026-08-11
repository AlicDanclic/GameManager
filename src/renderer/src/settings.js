// settings.js
const { ipcRenderer } = require('electron');
const state = require('./state.js');
const { renderGames } = require('./game-core.js');

async function loadSettings() {
  const newSettings = await ipcRenderer.invoke('get-settings');
  Object.assign(state.settings, newSettings);
  document.getElementById('translator-tool-path').value = state.settings.translatorTool || '';
  document.getElementById('mtool-path').value = state.settings.mtoolPath || '';
  document.getElementById('locale-emulator-path').value = state.settings.localeEmulator || '';
  document.getElementById('default-gal-mode').value = state.settings.defaultGalMode || 'noLocale';
  updateToolButtons();
}

function updateToolButtons() {
  const mtoolBtn = document.getElementById('mtool-btn');
  mtoolBtn.style.display = state.settings.mtoolPath ? 'inline-flex' : 'none';
  const translatorBtn = document.getElementById('translator-btn');
  translatorBtn.style.display = state.settings.translatorTool ? 'inline-flex' : 'none';
}

async function launchMtool() {
  const result = await ipcRenderer.invoke('launch-mtool');
  if (!result.success) alert('启动 MTool 失败: ' + result.error);
}

async function launchTranslator() {
  if (!state.settings.translatorTool) {
    alert('翻译工具路径未配置');
    return;
  }
  const result = await ipcRenderer.invoke('launch-program', {
    exePath: state.settings.translatorTool,
    useLocale: false,
    localeEmulatorPath: ''
  });
  if (!result.success) alert('启动翻译器失败: ' + result.error);
}

async function selectTranslatorTool() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable', extensions: ['exe'] }]);
  if (selectedPath) document.getElementById('translator-tool-path').value = selectedPath;
}

async function selectMtoolPath() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable/Batch', extensions: ['exe', 'bat'] }]);
  if (selectedPath) document.getElementById('mtool-path').value = selectedPath;
}

async function selectLocaleEmulator() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable', extensions: ['exe'] }]);
  if (selectedPath) document.getElementById('locale-emulator-path').value = selectedPath;
}

async function saveSettings() {
  const newSettings = {
    translatorTool: document.getElementById('translator-tool-path').value,
    mtoolPath: document.getElementById('mtool-path').value,
    localeEmulator: document.getElementById('locale-emulator-path').value,
    defaultGalMode: document.getElementById('default-gal-mode').value
  };
  Object.assign(state.settings, newSettings);
  const result = await ipcRenderer.invoke('save-settings', state.settings);
  if (result.success) {
    alert('设置已保存');
    updateToolButtons();
    renderGames(); // 重新渲染以更新按钮状态
  } else {
    alert('保存失败: ' + result.error);
  }
}

module.exports = {
  loadSettings,
  updateToolButtons,
  launchMtool,
  launchTranslator,
  selectTranslatorTool,
  selectMtoolPath,
  selectLocaleEmulator,
  saveSettings,
};