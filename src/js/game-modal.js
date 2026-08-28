/**
 * @file game-modal.js
 * @module game-modal
 * @description 添加/编辑游戏弹窗逻辑：管理“添加游戏”模态框的打开/关闭、表单重置、
 *              游戏类型切换扩展项、程序/存档路径选择，以及确认添加/保存游戏数据。
 * @author EternoPax
 * @since 2026/8/28
 */
// game-modal.js
// 添加/编辑游戏弹窗逻辑
(function () {
  const store = window.GMStore;
  const state = store.state;
  const api = window.gameAPI;

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

  /**
   * 打开“添加游戏”模态框并重置表单为默认值。
   */
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
    const selectedPath = await api.invoke('select-file', [{ name: 'Executable/Batch', extensions: ['exe', 'bat'] }]);
    if (selectedPath) document.getElementById('game-exe-path').value = selectedPath;
  }

  async function selectSaveFolder() {
    const selectedPath = await api.invoke('select-folder');
    if (selectedPath) document.getElementById('game-save-path').value = selectedPath;
  }

  /**
   * 确认添加/保存游戏：校验必填项，新增或编辑后写回主进程并刷新列表。
   * @returns {Promise<void>}
   */
  async function confirmAddGame() {
    const name = document.getElementById('game-name').value.trim();
    const type = document.getElementById('game-type').value;
    const exePath = document.getElementById('game-exe-path').value;
    const savePath = document.getElementById('game-save-path').value;
    const useLocale = document.getElementById('game-use-locale').checked;
    const autoTranslate = document.getElementById('game-auto-translate').checked;

    if (!name || !exePath) {
      window.showToast('请填写游戏名称和程序文件', 'warning', { duration: 3000 });
      return;
    }

    if (state.editingGameId) {
      const index = state.games.findIndex(g => g.id === state.editingGameId);
      if (index === -1) {
        window.showToast('游戏不存在，请刷新重试', 'error');
        return;
      }
      // folderPath 由主进程 save-games 依据 exePath 自动同步
      const updatedGame = {
        ...state.games[index],
        name,
        type,
        exePath,
        savePath,
        useLocale,
        autoTranslate
      };
      const newGames = state.games.slice();
      newGames[index] = updatedGame;
      const result = await api.invoke('save-games', newGames);
      if (result.success) {
        store.setGames(newGames);
        closeAddGameModal();
      } else {
        window.showToast('保存失败：' + result.error, 'error');
      }
    } else {
      const game = {
        name,
        type,
        exePath,
        savePath,
        folderPath: state.pendingGameData ? state.pendingGameData.folderPath : undefined,
        image: null,
        useLocale,
        autoTranslate
      };
      const result = await api.invoke('add-game', game);
      if (result.success) {
        store.setGames(state.games.concat(result.game));
        closeAddGameModal();
      } else {
        window.showToast('添加失败：' + result.error, 'error');
      }
    }
  }

  window.setupModals = setupModals;
  window.setupGameTypeToggle = setupGameTypeToggle;
  window.openAddGameModal = openAddGameModal;
  window.closeAddGameModal = closeAddGameModal;
  window.selectGameExe = selectGameExe;
  window.selectSaveFolder = selectSaveFolder;
  window.confirmAddGame = confirmAddGame;
})();
