/**
 * @fileoverview 预加载脚本（安全 API 桥）
 * @description 在沙箱化渲染进程与主进程之间建立安全边界：
 *              - 渲染进程关闭 nodeIntegration，无法直接 require('electron')
 *              - 本脚本通过 contextBridge 暴露白名单化的 gameAPI
 *              - 所有 IPC 通道均经过白名单校验，未授权通道直接拒绝
 * @module preload
 * @author EternoPax
 * @since 2026/2/28
 * @version 2.0.0
 */

const { contextBridge, ipcRenderer } = require('electron');

/** 允许通过 invoke 调用的通道（单向请求-响应） */
const INVOKE_CHANNELS = [
  'get-settings',
  'save-settings',
  'select-file',
  'select-folder',
  'select-image',
  'get-games',
  'save-games',
  'add-game',
  'delete-game',
  'launch-program',
  'open-folder',
  'copy-image',
  'get-guide',
  'save-guide',
  'drop-game',
  'launch-mtool',
  'save-file',
  'pack-game',
  'delete-source-files',
  'read-icon',
  'read-text-file',
  'get-running-games'
];

/** 允许通过 send 调用的通道（单向通知） */
const SEND_CHANNELS = [
  'window-minimize',
  'window-maximize',
  'window-close'
];

/** 允许监听的事件通道（主进程主动推送） */
const RECEIVE_CHANNELS = [
  'pack-progress',
  'game-status'
];

/**
 * 暴露给渲染进程的安全 API 对象
 * @namespace gameAPI
 */
contextBridge.exposeInMainWorld('gameAPI', {
  /**
   * 调用主进程的请求-响应接口
   * @param {string} channel - IPC 通道名
   * @param {...*} args - 参数列表
   * @returns {Promise<*>} 主进程返回值
   */
  invoke: (channel, ...args) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`未授权的 IPC 通道: ${channel}`));
  },

  /**
   * 向主进程发送单向通知
   * @param {string} channel - IPC 通道名
   * @param {...*} args - 参数列表
   */
  send: (channel, ...args) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },

  /**
   * 订阅主进程推送的事件
   * @param {string} channel - IPC 通道名
   * @param {Function} callback - 事件回调（参数为主进程发送的数据）
   * @returns {Function} 取消订阅函数
   */
  on: (channel, callback) => {
    if (!RECEIVE_CHANNELS.includes(channel) || typeof callback !== 'function') {
      return () => {};
    }
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
});
