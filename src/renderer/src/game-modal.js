// game-modal.js
const { ipcRenderer } = require('electron');
const path = require('path');
const state = require('./state.js');
const { renderGames } = require('./game-core.js');

function setupModals() {
  document.getElementById('add-game-btn').addEventListener('click', () => {
    state.editingGameId = null;
    state.pendingGameData = null;
    openAddGameModal();
  });
}

function setupGameTypeToggle() {
  const typeSelect = document.getElementById('game-type');
  const galgameOptions = document.getElementById('galgame-options');
  typeSelect.addEventListener('change', () => {
    galgameOptions.style.display = typeSelect.value === 'galgame' ? 'block' : 'none';
  });
}

function openAddGameModal() {
  document.querySelector('#add-game-modal .modal-header h3').textContent = '添加游戏';
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('game-name').value = '';
  document.getElementById('game-type').value = 'galgame';
  document.getElementById('game-exe-path').value = '';
  document.getElementById('game-save-path').value = '';
  document.getElementById('game-use-locale').checked = false;
  document.getElementById('game-auto-translate').checked = false;
  document.getElementById('galgame-options').style.display = 'block';
}

function closeAddGameModal() {
  document.getElementById('add-game-modal').classList.remove('active');
  state.editingGameId = null;
  state.pendingGameData = null;
  document.querySelector('#add-game-modal .modal-header h3').textContent = '添加游戏';
}

async function selectGameExe() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable/Batch', extensions: ['exe', 'bat'] }]);
  if (selectedPath) document.getElementById('game-exe-path').value = selectedPath;
}

async function selectSaveFolder() {
  const selectedPath = await ipcRenderer.invoke('select-folder');
  if (selectedPath) document.getElementById('game-save-path').value = selectedPath;
}

async function confirmAddGame() {
  const name = document.getElementById('game-name').value.trim();
  const type = document.getElementById('game-type').value;
  const exePath = document.getElementById('game-exe-path').value;
  const savePath = document.getElementById('game-save-path').value;
  const useLocale = document.getElementById('game-use-locale').checked;
  const autoTranslate = document.getElementById('game-auto-translate').checked;

  if (!name || !exePath) {
    alert('请填写游戏名称和程序文件');
    return;
  }

  if (state.editingGameId) {
    const index = state.games.findIndex(g => g.id === state.editingGameId);
    if (index === -1) {
      alert('游戏不存在，请刷新重试');
      return;
    }
    const updatedGame = {
      ...state.games[index],
      name,
      type,
      exePath,
      savePath,
      folderPath: path.dirname(exePath),
      useLocale,
      autoTranslate
    };
    state.games[index] = updatedGame;
    const result = await ipcRenderer.invoke('save-games', state.games);
    if (result.success) {
      renderGames();
      closeAddGameModal();
    } else {
      alert('保存失败: ' + result.error);
    }
  } else {
    const game = {
      name,
      type,
      exePath,
      savePath,
      folderPath: state.pendingGameData ? state.pendingGameData.folderPath : path.dirname(exePath),
      image: null,
      useLocale,
      autoTranslate
    };
    const result = await ipcRenderer.invoke('add-game', game);
    if (result.success) {
      state.games.push(result.game);
      renderGames();
      closeAddGameModal();
    } else {
      alert('添加失败: ' + result.error);
    }
  }
}

module.exports = {
  setupModals,
  setupGameTypeToggle,
  openAddGameModal,
  closeAddGameModal,
  selectGameExe,
  selectSaveFolder,
  confirmAddGame,
};