/**
 * @file pack-delete.js
 * @module pack-delete
 * @description 游戏打包与源文件删除模块：打包游戏（含文件夹与存档）并展示进度，
 *              以“5 秒可撤销”确认方式永久删除源文件。
 * @author EternoPax
 * @since 2026/8/28
 */
// pack-delete.js
// 游戏打包与源文件删除
(function () {
  const state = window.GMStore.state;
  const api = window.gameAPI;

  // 待执行的源文件删除任务（撤销模式）：gameId -> { timeoutId }
  const pendingDeletions = new Map();

  /**
   * 打包指定游戏（含游戏文件夹与存档文件夹），并展示打包进度模态框。
   * @param {string} gameId - 目标游戏 id
   * @returns {Promise<void>}
   */
  async function packGame(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (!game) { window.showToast('游戏不存在', 'error'); return; }
    if (!confirm(`确定要打包游戏"${game.name}"吗？\n将包含游戏文件夹和存档文件夹。`)) return;
    const modal = document.getElementById('pack-progress-modal');
    modal.classList.add('active');
    document.getElementById('pack-progress-fill').style.width = '0%';
    document.getElementById('pack-progress-status').textContent = '正在计算文件大小...';
    try {
      const result = await api.invoke('pack-game', gameId);
      if (result.success) window.showToast(`打包成功！\n文件已保存到：${result.filePath}`, 'success', { duration: 6000 });
      else window.showToast('打包失败：' + result.error, 'error');
    } catch (error) {
      window.showToast('打包出错：' + error.message, 'error');
    } finally {
      modal.classList.remove('active');
    }
  }

  /**
   * 以“5 秒可撤销”方式永久删除游戏的源文件。
   * @param {string} gameId - 目标游戏 id
   * @returns {Promise<void>}
   */
  function deleteSourceFiles(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (!game) { window.showToast('游戏不存在', 'error'); return; }

    // 同一游戏已有待执行删除时，先取消旧任务，避免重复定时器
    const prev = pendingDeletions.get(gameId);
    if (prev) {
      clearTimeout(prev.timeoutId);
      pendingDeletions.delete(gameId);
    }

    const pending = { timeoutId: null };
    pendingDeletions.set(gameId, pending);

    const cancel = () => {
      clearTimeout(pending.timeoutId);
      if (pendingDeletions.get(gameId) === pending) pendingDeletions.delete(gameId);
    };

    let detail = `游戏文件夹：${game.folderPath}`;
    if (game.savePath && game.savePath !== game.folderPath) detail += `，存档文件夹：${game.savePath}`;

    window.showToast(`即将永久删除"${game.name}"的源文件（${detail}），5 秒内可撤销`, 'warning', {
      duration: 5000,
      action: {
        label: '撤销',
        callback: () => {
          cancel();
          window.showToast('已取消删除', 'success', { duration: 2000 });
        }
      },
      onDismiss: (isManual) => {
        if (isManual) cancel(); // 手动关闭视为取消
      }
    });

    pending.timeoutId = setTimeout(async () => {
      const result = await api.invoke('delete-source-files', gameId);
      if (result && result.success) {
        window.showToast('源文件已删除', 'success', { duration: 2500 });
        await loadGames();
      } else {
        window.showToast((result && result.error) || '删除失败', 'error');
      }
      if (pendingDeletions.get(gameId) === pending) pendingDeletions.delete(gameId);
    }, 5000);
  }

  window.packGame = packGame;
  window.deleteSourceFiles = deleteSourceFiles;
})();
