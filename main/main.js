/**
 * @fileoverview Electron 主进程入口
 * @description 负责窗口管理、应用生命周期、系统托盘，并注册 IPC 处理器与应用菜单。
 *              文件系统、游戏数据持久化、打包压缩等逻辑见 ./ipc.js，原生菜单见 ./menu.js。
 * @module main
 * @author EternoPax
 * @since 2026/2/28
 * @version 2.0.0
 */

const { app, BrowserWindow, Menu, Tray } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { registerIpcHandlers } = require('./ipc');
const { buildAppMenu } = require('./menu');

// 终端调试开关：GM_DEBUG=0 关闭终端日志（默认开启）
const MAIN_DEBUG = process.env.GM_DEBUG !== '0';
function mainLog(...args) {
  if (MAIN_DEBUG) console.log('[main]', ...args);
}

// ==================== 图标配置 ====================

/**
 * 应用图标路径（根据平台自动选择）
 * @constant {string}
 * @description Windows 使用 .ico，macOS 使用 .icns，Linux 使用 .png
 */
const iconPath = process.platform === 'win32'
  ? path.join(__dirname, '../assets/icon.ico')      // Windows
  : process.platform === 'darwin'
    ? path.join(__dirname, '../assets/icon.icns')   // macOS
    : path.join(__dirname, '../assets/icon.png');   // Linux

// ==================== 全局窗口和托盘引用 ====================

/** @type {BrowserWindow|null} 主窗口实例引用 */
let mainWindow;

/** @type {Tray|null} 系统托盘实例引用 */
let tray;

/**
 * 获取主窗口引用（供 IPC 模块使用）
 * @returns {BrowserWindow|null}
 */
function getMainWindow() {
  return mainWindow;
}

// ==================== 窗口创建 ====================

/**
 * 创建主应用窗口
 * @function createWindow
 * @returns {void}
 * @description 初始化无边框主窗口。渲染进程默认关闭 nodeIntegration，
 *              通过 preload 脚本（contextBridge）安全暴露白名单 IPC API。
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
    titleBarStyle: 'default',
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,   // 隔离渲染进程与主进程上下文
      nodeIntegration: false,   // 渲染进程不再拥有 Node.js 能力
      sandbox: true,            // 启用渲染进程沙箱
      webSecurity: true,        // 恢复同源策略
      devTools: true
    }
  });

  // 允许拖放文件（拦截浏览器默认的“打开文件”导航行为）
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    `);
  });

  mainWindow.loadFile(path.join(__dirname, '../public/index.html'));
  mainLog('Window file loaded:', path.join(__dirname, '../public/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainLog('Window ready-to-show, shown:', mainWindow.getBounds());
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 创建系统托盘
  createTray();
}

// ==================== 系统托盘 ====================

/**
 * 创建系统托盘图标和菜单
 * @function createTray
 * @returns {void}
 */
function createTray() {
  // 托盘图标通常使用 PNG 格式（Windows 也支持）
  const trayIconPath = path.join(__dirname, '../assets/icon.png');

  // 如果 PNG 不存在，回退到平台图标
  const finalTrayIcon = fs.existsSync(trayIconPath) ? trayIconPath : iconPath;

  tray = new Tray(finalTrayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Game Manager');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

// ==================== 全局错误日志（便于诊断启动失败） ====================

// 确保主进程任何未捕获错误都能在终端看到，而不是静默退出
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

// ==================== 应用生命周期 ====================

app.whenReady().then(() => {
  try {
    // 注册原生应用菜单（macOS 上提供复制/粘贴等快捷键）
    Menu.setApplicationMenu(buildAppMenu());
    // 注册全部 IPC 处理器（含数据文件初始化）
    registerIpcHandlers(getMainWindow);
    createWindow();
    mainLog('App started ✔');
  } catch (err) {
    console.error('[main] startup failed:', err);
    app.exit(1);
  }
});

app.on('window-all-closed', () => {
  mainLog('All windows closed, quitting');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
