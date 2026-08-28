/**
 * @file window-control.js
 * @module window-control
 * @description 渲染进程窗口控制模块：向主进程发送 IPC 请求以最小化、最大化/还原、
 *              关闭当前窗口，并把这些控制函数挂载到 window，供 HTML 内联事件调用。
 * @author EternoPax
 * @since 2026/8/28
 */
// window-control.js
// 窗口控制：最小化 / 最大化 / 关闭
(function () {
  const api = window.gameAPI;

  /**
   * 最小化当前窗口。
   * @description 通过 IPC 向主进程发送 'window-minimize' 请求执行窗口最小化。
   */
  function minimizeWindow() {
    api.send('window-minimize');
  }

  /**
   * 最大化或还原当前窗口。
   * @description 通过 IPC 向主进程发送 'window-maximize' 请求执行窗口最大化/还原。
   */
  function maximizeWindow() {
    api.send('window-maximize');
  }

  /**
   * 关闭当前窗口。
   * @description 通过 IPC 向主进程发送 'window-close' 请求执行窗口关闭。
   */
  function closeWindow() {
    api.send('window-close');
  }

  window.minimizeWindow = minimizeWindow;
  window.maximizeWindow = maximizeWindow;
  window.closeWindow = closeWindow;
})();
