// game-drop.js
const { ipcRenderer } = require('electron');
const state = require('./state.js');

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
        const result = await ipcRenderer.invoke('drop-game', filePath);
        if (result.success) openAddGameModalWithData(result.data);
        else alert(result.error);
      } else alert('只支持 exe 或 bat 文件');
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

module.exports = { setupDropZone, openAddGameModalWithData };