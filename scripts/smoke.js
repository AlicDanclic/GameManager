/**
 * 冒烟测试脚本
 * @description 无头加载真实页面 + preload，验证渲染层初始化状态与关键 API。
 *              通过后输出 SMOKE_RESULT 与 RENDER_ERRORS，用于 CI/发布前快速回归。
 * 用法：xvfb-run -a npx electron scripts/smoke.js --no-sandbox
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('../main/ipc');

const ROOT = path.join(__dirname, '..');
let mainWindow;

app.whenReady().then(async () => {
  // 模拟真实主进程：注册全部 IPC 处理器（含数据文件初始化）
  registerIpcHandlers(() => mainWindow);

  mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  const errors = [];
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message); // 3 = error 级别
  });

  await mainWindow.loadFile(path.join(ROOT, 'public/index.html'));
  await new Promise(r => setTimeout(r, 3500)); // 等待 DOMContentLoaded 初始化链完成

  // 超时保护：无论成败 30 秒内强制退出
  const guard = setTimeout(() => {
    console.log('SMOKE_RESULT: TIMEOUT');
    app.exit(1);
  }, 30000);

  try {
    const result = await mainWindow.webContents.executeJavaScript(`JSON.stringify({
      hasGameAPI: !!window.gameAPI,
      hasGMStore: !!window.GMStore,
      gamesCount: window.GMStore && window.GMStore.state ? window.GMStore.state.games.length : -1,
      settingsKeys: window.GMStore && window.GMStore.state && window.GMStore.state.settings ? Object.keys(window.GMStore.state.settings) : [],
      iconsLoaded: window.GMIcons ? [!!window.GMIcons.svgs.locale, !!window.GMIcons.svgs.translate, !!window.GMIcons.svgs.empty] : 'GMIcons缺失',
      renderGames: typeof window.renderGames,
      openGuide: typeof window.openGuide,
      launchGame: typeof window.launchGame,
      saveSettings: typeof window.saveSettings
    })`);
    console.log('SMOKE_RESULT:', result);
  } catch (e) {
    console.log('SMOKE_EXEC_ERROR:', e.message);
  }
  console.log('RENDER_ERRORS:', JSON.stringify(errors));
  clearTimeout(guard);
  app.quit();
});
