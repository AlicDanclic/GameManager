/**
 * @file game-drop.js
 * @module game-drop
 * @description 拖放添加游戏模块：监听拖放区与全页面的拖拽事件，拦截 exe/bat 文件，
 *              通过 IPC 解析后自动打开“添加游戏”弹窗并预填信息。
 * @author EternoPax
 * @since 2026/8/28
 */
// game-drop.js
// 拖放添加游戏
(function () {
  const api = window.gameAPI;
  const state = window.GMStore.state;

  /**
   * 拖放添加游戏：处理拖入的 exe/bat 文件，解析后打开“添加游戏”弹窗并预填信息。
   * @description 监听拖放区与全页面拖拽事件，仅接受 exe/bat 文件。
   */
  function setupDropZone() {
    const dropZone = document.getElementById('drop-zone');
    document.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    document.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); });
    dropZone.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over');
      let filePath = null;
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        filePath = e.dataTransfer.files[0].path;
      } else {
        const items = e.dataTransfer.items;
        if (items && items.length > 0) {
          const entry = items[0].webkitGetAsEntry();
          if (entry) filePath = e.dataTransfer.getData('text/plain') || items[0].getAsFile()?.path;
        }
      }
      if (!filePath && e.dataTransfer.getData('text/plain')) filePath = e.dataTransfer.getData('text/plain');
      if (filePath) {
        const ext = filePath.toLowerCase();
        if (ext.endsWith('.exe') || ext.endsWith('.bat')) {
          const result = await api.invoke('drop-game', filePath);
          if (result.success) openAddGameModalWithData(result.data);
          else window.showToast(result.error, 'error');
        } else window.showToast('只支持 exe 或 bat 文件', 'warning', { duration: 3000 });
      }
    });
  }

  function openAddGameModalWithData(data) {
    state.editingGameId = null;
    state.pendingGameData = data;
    document.querySelector('#add-game-modal .modal-header h3').textContent = '添加游戏';
    document.getElementById('add-game-modal').classList.add('active');
    document.getElementById('game-name').value = data.name;
    document.getElementById('game-type').value = data.type;
    document.getElementById('game-exe-path').value = data.exePath;
    document.getElementById('game-save-path').value = '';
    document.getElementById('game-use-locale').checked = false;
    document.getElementById('game-auto-translate').checked = false;
    document.getElementById('galgame-options').style.display = data.type === 'galgame' ? 'block' : 'none';
  }

  window.setupDropZone = setupDropZone;
})();
