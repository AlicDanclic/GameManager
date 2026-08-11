// pack-delete.js
const { ipcRenderer } = require('electron');
const state = require('./state.js');
const { loadGames } = require('./game-core.js');

async function packGame(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) { alert('游戏不存在'); return; }
  if (!confirm(`确定要打包游戏"${game.name}"吗？\n将包含游戏文件夹和存档文件夹。`)) return;
  const modal = document.getElementById('pack-progress-modal');
  modal.classList.add('active');
  document.getElementById('pack-progress-fill').style.width = '0%';
  document.getElementById('pack-progress-status').textContent = '正在计算文件大小...';
  try {
    const result = await ipcRenderer.invoke('pack-game', gameId);
    if (result.success) alert(`打包成功！\n文件已保存到：${result.filePath}`);
    else alert('打包失败：' + result.error);
  } catch (error) {
    alert('打包出错：' + error.message);
  } finally {
    modal.classList.remove('active');
  }
}

async function deleteSourceFiles(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) { alert('游戏不存在'); return; }
  let message = `确定要永久删除以下文件夹吗？\n此操作不可恢复！\n\n游戏文件夹：${game.folderPath}`;
  if (game.savePath && game.savePath !== game.folderPath) message += `\n存档文件夹：${game.savePath}`;
  if (!confirm(message)) return;
  if (!confirm('再次确认：删除后将无法恢复，确定继续？')) return;
  const result = await ipcRenderer.invoke('delete-source-files', gameId);
  if (result.success) {
    alert('源文件删除成功！');
    await loadGames();
  } else {
    alert('删除失败：' + result.error);
  }
}

module.exports = { packGame, deleteSourceFiles };