/**
 * @file icons.js
 * @module icons
 * @description 内联 SVG 图标加载模块：通过 preload 暴露的 read-icon IPC 从磁盘读取
 *              图标文件内容。采用内联而非 <img> 的原因：CSS 通过 currentColor 控制
 *              图标颜色，必须将 SVG 文本内联进 DOM 才能随颜色变化着色。
 * @author EternoPax
 * @since 2026/8/28
 */
// icons.js
// 内联 SVG 图标加载：通过 preload 暴露的 read-icon IPC 从磁盘读取。
// 采用内联而非 <img> 的原因：CSS 通过 currentColor 控制图标颜色，需保持 SVG 文本内联。
(function () {
  const api = window.gameAPI;

  // 内联图标缓存：键为图标名，值为从磁盘读取到的 SVG 文本
  const svgs = {
    locale: '',    // 转区/语言状态图标（status-locale.svg）
    translate: '', // 翻译工具图标（tool-translator.svg）
    empty: ''      // 空游戏库占位图标（empty-game.svg）
  };

  /**
   * 异步加载全部内联图标（渲染前调用一次）
   * @returns {Promise<void>}
   */
  async function loadIcons() {
    const results = await Promise.all([
      api.invoke('read-icon', 'status-locale.svg'),
      api.invoke('read-icon', 'tool-translator.svg'),
      api.invoke('read-icon', 'empty-game.svg')
    ]);
    svgs.locale = results[0] || '';
    svgs.translate = results[1] || '';
    svgs.empty = results[2] || '';
  }

  window.GMIcons = { svgs, loadIcons };
})();
