/**
 * @fileoverview 原生应用菜单配置
 * @description 构建应用菜单。应用为无边框窗口（frame: false），Windows/Linux 下
 *              菜单栏不显示，但菜单仍提供 macOS 所需的 App 菜单以及全局快捷键
 *              （如复制/粘贴，攻略编辑器中的 contenteditable 文本编辑依赖此功能）。
 * @module menu
 * @author EternoPax
 * @since 2026/2/28
 * @version 2.0.0
 */

const { Menu } = require('electron');

/**
 * 构建应用菜单
 * @function buildAppMenu
 * @returns {Menu} Electron 菜单实例
 */
function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS 专属的 App 菜单（提供 about/quit 等标准项）
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { buildAppMenu };
