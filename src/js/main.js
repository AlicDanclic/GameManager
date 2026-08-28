/**
 * @file main.js
 * @module main
 * @description 渲染进程引导入口：初始化数据、绑定事件、监听主进程推送。应用启动时
 *              按依赖顺序加载设置、图标与游戏数据，随后初始化导航、拖放、模态框、
 *              游戏类型筛选、搜索与运行状态监听，并订阅主进程的打包进度推送。
 * @author EternoPax
 * @since 2026/8/28
 */
// main.js
// 渲染进程引导入口：初始化数据、绑定事件、监听主进程推送
(function () {
  const api = window.gameAPI;

  /**
   * 安全调用封装：统一处理 IPC 错误，失败时自动弹出错误 Toast。
   * @param {string} channel - IPC 通道名
   * @param {...any} args - 透传给主进程的参数
   * @returns {Promise<any|null>} 成功返回原始结果；失败返回 null
   */
  // 安全调用封装：统一处理 IPC 错误，失败时自动弹出错误 Toast
  // 成功返回原始结果；失败（result.success === false 或抛异常）返回 null
  window.safeInvoke = async (channel, ...args) => {
    try {
      const result = await api.invoke(channel, ...args);
      if (result && result.success === false && result.error) {
        window.showToast(result.error, 'error');
        return null;
      }
      return result;
    } catch (error) {
      window.showToast(`系统错误：${error.message || '未知错误'}`, 'error');
      return null;
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    await window.loadSettings();
    await window.GMIcons.loadIcons(); // 需先于 loadGames（卡片渲染依赖内联 SVG）
    await window.loadGames();
    window.setupNavigation();
    window.setupDropZone();
    window.setupModals();
    window.setupGameTypeToggle();
    window.setupGameSearch();
    window.setupGameStatus(); // 监听游戏运行状态推送

    // 验证 Toast 系统就绪
    window.showToast('应用已启动', 'success', { duration: 1500 });

    // 监听打包进度
    api.on('pack-progress', (progress) => {
      const percent = progress.percent || 0;
      const status = progress.status || '';
      const fill = document.getElementById('pack-progress-fill');
      const statusEl = document.getElementById('pack-progress-status');
      if (fill) fill.style.width = percent + '%';
      if (statusEl) statusEl.textContent = status;
    });
  });
})();
