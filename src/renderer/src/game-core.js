// game-core.js
const { ipcRenderer } = require('electron');
const path = require('path');
const state = require('./state.js');
const { svgs } = require('./icons.js');

async function loadGames() {
  const newGames = await ipcRenderer.invoke('get-games');
  state.games.length = 0;
  state.games.push(...newGames);
  renderGames();
}

function getTypeLabel(type) {
  const labels = { galgame: 'Galgame', rpg: 'RPG', unity: 'Unity' };
  return labels[type] || type;
}

function renderGames() {
  const grid = document.getElementById('games-grid');
  if (state.games.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">${svgs.empty}</div>
        <p class="empty-state-text">暂无游戏，点击"添加游戏"或拖拽 exe/bat 文件添加</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.games.map(game => {
    const configIcons = [];
    if (game.type === 'galgame') {
      if (game.useLocale) configIcons.push(`
        <span class="status-icon icon-locale" title="使用转区启动">${svgs.locale}</span>
      `);
      if (game.autoTranslate && state.settings.translatorTool) configIcons.push(`
        <span class="status-icon icon-translate" title="自动启动翻译">${svgs.translate}</span>
      `);
    }
    const iconsHtml = configIcons.length ? `<div class="game-config-icons">${configIcons.join(' ')}</div>` : '';

    return `
    <div class="game-card ${game.type}" data-id="${game.id}">
      <div class="game-type-header">${getTypeLabel(game.type)}</div>
      <div class="game-image" onclick="window.selectGameImage('${game.id}')">
        ${game.image ? `<img src="file://${game.image}" alt="${game.name}">` : '点击添加图片'}
      </div>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        ${iconsHtml}
        <div class="game-actions">
          <button class="btn btn-small btn-secondary" onclick="window.openGameFolder('${game.id}')">打开文件夹</button>
          <button class="btn btn-small btn-secondary" onclick="window.openSaveFolder('${game.id}')">存档</button>
        </div>
        <div class="game-actions-row">
          <button class="btn btn-small btn-primary" onclick="window.launchGame('${game.id}')">启动</button>
          <button class="btn btn-small btn-secondary" onclick="window.openGuide('${game.id}')">攻略</button>
          <button class="btn btn-small btn-secondary" onclick="window.packGame('${game.id}')">打包</button>
          <button class="btn btn-small btn-danger" onclick="window.deleteSourceFiles('${game.id}')">删源</button>
          <button class="btn btn-small btn-secondary" onclick="window.editGame('${game.id}')">编辑</button>
          <button class="btn btn-small btn-danger" onclick="window.deleteGame('${game.id}')">删除</button>
        </div>
      </div>
    </div>
  `}).join('');
}

async function launchGameInternal(game) {
  let useLocale = false;
  if (game.type === 'galgame') {
    if (game.useLocale !== undefined) {
      useLocale = game.useLocale;
    } else {
      useLocale = state.settings.defaultGalMode === 'locale';
    }
  }

  const result = await ipcRenderer.invoke('launch-program', {
    exePath: game.exePath,
    useLocale,
    localeEmulatorPath: state.settings.localeEmulator
  });

  if (!result.success) {
    alert('启动失败: ' + result.error);
  }
}

async function launchGame(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  if (game.type === 'galgame' && !state.settings.translatorTool) {
    alert('您尚未配置翻译工具路径，翻译功能将不可用。如需使用，请在设置中配置。');
  }

  if (game.type === 'galgame' && game.autoTranslate && state.settings.translatorTool) {
    const translateResult = await ipcRenderer.invoke('launch-program', {
      exePath: state.settings.translatorTool,
      useLocale: false,
      localeEmulatorPath: ''
    });
    if (!translateResult.success) {
      alert('启动翻译工具失败: ' + translateResult.error);
    }
    setTimeout(async () => {
      await launchGameInternal(game);
    }, 1000);
  } else {
    await launchGameInternal(game);
  }
}

async function deleteGame(gameId) {
  if (!confirm('确定要删除这个游戏吗？')) return;
  const result = await ipcRenderer.invoke('delete-game', gameId);
  if (result.success) {
    const index = state.games.findIndex(g => g.id === gameId);
    if (index !== -1) state.games.splice(index, 1);
    renderGames();
  }
}

async function selectGameImage(gameId) {
  const selectedPath = await ipcRenderer.invoke('select-image');
  if (selectedPath) {
    const newPath = await ipcRenderer.invoke('copy-image', selectedPath, gameId);
    if (newPath) {
      const game = state.games.find(g => g.id === gameId);
      if (game) {
        game.image = newPath;
        await ipcRenderer.invoke('save-games', state.games);
        renderGames();
      }
    }
  }
}

async function openGameFolder(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (game) await ipcRenderer.invoke('open-folder', game.folderPath);
}

async function openSaveFolder(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (game && game.savePath) await ipcRenderer.invoke('open-folder', game.savePath);
  else alert('未设置存档文件夹');
}

function editGame(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  state.editingGameId = gameId;
  state.pendingGameData = null;

  document.getElementById('game-name').value = game.name;
  document.getElementById('game-type').value = game.type;
  document.getElementById('game-exe-path').value = game.exePath;
  document.getElementById('game-save-path').value = game.savePath || '';
  document.getElementById('game-use-locale').checked = game.useLocale || false;
  document.getElementById('game-auto-translate').checked = game.autoTranslate || false;

  document.querySelector('#add-game-modal .modal-header h3').textContent = '编辑游戏';
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('galgame-options').style.display = game.type === 'galgame' ? 'block' : 'none';
}

module.exports = {
  loadGames,
  renderGames,
  getTypeLabel,
  launchGame,
  deleteGame,
  selectGameImage,
  openGameFolder,
  openSaveFolder,
  editGame,
};