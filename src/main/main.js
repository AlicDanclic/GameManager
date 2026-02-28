/**
 * @fileoverview Electron 主进程入口文件
 * @description 游戏管理器的主进程脚本，负责窗口管理、系统托盘、IPC 通信、
 *              文件系统操作、游戏数据持久化、打包压缩等核心功能
 * @module main
 * @author EternoPax
 * @since 2026/2/28
 * @version 1.0.0
 */

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const os = require('os');
const archiver = require('archiver');

// ==================== 数据存储配置 ====================

/**
 * 应用数据存储根目录路径
 * @constant {string}
 * @default path.join(os.homedir(), '.game-manager')
 * @description 存储在用户主目录下的隐藏文件夹，包含游戏列表、设置和攻略数据
 * @author EternoPax
 * @since 2026/2/28
 */
const dataPath = path.join(os.homedir(), '.game-manager');

/**
 * 游戏列表数据文件路径
 * @constant {string}
 * @description JSON 格式存储所有游戏的基本信息
 * @author EternoPax
 * @since 2026/2/28
 */
const gamesFile = path.join(dataPath, 'games.json');

/**
 * 应用设置文件路径
 * @constant {string}
 * @description JSON 格式存储用户设置，包括工具路径和默认选项
 * @author EternoPax
 * @since 2026/2/28
 */
const settingsFile = path.join(dataPath, 'settings.json');

/**
 * 攻略数据文件路径
 * @constant {string}
 * @description JSON 格式存储所有游戏的攻略节点和连接数据
 * @author EternoPax
 * @since 2026/2/28
 */
const guidesFile = path.join(dataPath, 'guides.json');

// 确保数据目录存在
fs.ensureDirSync(dataPath);

/**
 * 默认设置配置对象
 * @constant {Object}
 * @property {string} translatorTool - 翻译工具路径
 * @property {string} mtoolPath - MTool 工具路径
 * @property {string} localeEmulator - Locale Emulator 路径
 * @property {string} defaultGalMode - Galgame 默认启动模式
 * @author EternoPax
 * @since 2026/2/28
 */
const defaultSettings = {
  translatorTool: '',
  mtoolPath: '',
  localeEmulator: '',
  defaultGalMode: 'noLocale'
};

// 初始化设置文件
if (!fs.existsSync(settingsFile)) {
  fs.writeJsonSync(settingsFile, defaultSettings);
}

// 初始化游戏列表
if (!fs.existsSync(gamesFile)) {
  fs.writeJsonSync(gamesFile, []);
}

// 初始化攻略数据
if (!fs.existsSync(guidesFile)) {
  fs.writeJsonSync(guidesFile, {});
}

// ==================== 全局窗口和托盘引用 ====================

/**
 * 主窗口实例引用
 * @global
 * @type {BrowserWindow|null}
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let mainWindow;

/**
 * 系统托盘实例引用
 * @global
 * @type {Tray|null}
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let tray;

// ==================== 图标配置 ====================

/**
 * 应用图标路径（根据平台自动选择）
 * @constant {string}
 * @description Windows 使用 .ico，macOS 使用 .icns，Linux 使用 .png
 * @author EternoPax
 * @since 2026/2/28
 */
const iconPath = process.platform === 'win32' 
  ? path.join(__dirname, '../../assets/icon.ico')      // Windows
  : process.platform === 'darwin' 
  ? path.join(__dirname, '../../assets/icon.icns')     // macOS
  : path.join(__dirname, '../../assets/icon.png');     // Linux

// ==================== 窗口创建 ====================

/**
 * 创建主应用窗口
 * @function createWindow
 * @returns {void}
 * @description 初始化主窗口，配置无边框、节点集成、拖放支持等特性
 * @author EternoPax
 * @since 2026/2/28
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 1080,
    minHeight: 720,
    frame: false,
    titleBarStyle: 'default',
    icon: iconPath,  // 设置窗口图标
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      devTools: false
    },
    show: false
  });

  // 允许拖放文件
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

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
 * @description 在系统托盘区域创建图标，提供显示/隐藏窗口和退出功能
 * @author EternoPax
 * @since 2026/2/28
 */
function createTray() {
  // 托盘图标通常使用 PNG 格式（Windows 也支持）
  const trayIconPath = path.join(__dirname, '../../assets/icon.png');
  
  // 如果 PNG 不存在，回退到 ICO
  const finalTrayIcon = fs.existsSync(trayIconPath) 
    ? trayIconPath 
    : iconPath;

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

// ==================== 应用生命周期 ====================

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ==================== 窗口控制 IPC ====================

/**
 * IPC 处理器：最小化窗口
 * @listens ipcMain#window-minimize
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

/**
 * IPC 处理器：最大化/还原窗口
 * @listens ipcMain#window-maximize
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

/**
 * IPC 处理器：关闭窗口
 * @listens ipcMain#window-close
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// ==================== 设置管理 ====================

/**
 * IPC 处理器：获取应用设置
 * @listens ipcMain#get-settings
 * @async
 * @returns {Promise<Object>} 设置对象，读取失败返回默认设置
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('get-settings', async () => {
  try {
    const settings = await fs.readJson(settingsFile);
    return settings;
  } catch (error) {
    return defaultSettings;
  }
});

/**
 * IPC 处理器：保存应用设置
 * @listens ipcMain#save-settings
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {Object} settings - 要保存的设置对象
 * @returns {Promise<{success: boolean, error?: string}>} 操作结果
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('save-settings', async (event, settings) => {
  try {
    await fs.writeJson(settingsFile, settings);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== 文件选择 ====================

/**
 * IPC 处理器：选择文件对话框
 * @listens ipcMain#select-file
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {Array<Object>} filters - 文件过滤器数组
 * @returns {Promise<string|null>} 选中的文件路径，取消返回 null
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.filePaths[0] || null;
});

/**
 * IPC 处理器：选择文件夹对话框
 * @listens ipcMain#select-folder
 * @async
 * @returns {Promise<string|null>} 选中的文件夹路径，取消返回 null
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

/**
 * IPC 处理器：选择图片文件
 * @listens ipcMain#select-image
 * @async
 * @returns {Promise<string|null>} 选中的图片路径，取消返回 null
 * @description 支持的格式：jpg, jpeg, png, gif, bmp
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
    ]
  });
  return result.filePaths[0] || null;
});

// ==================== 游戏管理 ====================

/**
 * IPC 处理器：获取游戏列表
 * @listens ipcMain#get-games
 * @async
 * @returns {Promise<Array<Object>>} 游戏对象数组，失败返回空数组
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('get-games', async () => {
  try {
    const games = await fs.readJson(gamesFile);
    return games;
  } catch (error) {
    return [];
  }
});

/**
 * IPC 处理器：保存游戏列表
 * @listens ipcMain#save-games
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {Array<Object>} games - 游戏对象数组
 * @returns {Promise<{success: boolean, error?: string}>} 操作结果
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('save-games', async (event, games) => {
  try {
    await fs.writeJson(gamesFile, games);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC 处理器：添加新游戏
 * @listens ipcMain#add-game
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {Object} game - 游戏数据对象（不含 ID）
 * @returns {Promise<{success: boolean, game?: Object, error?: string}>} 
 *          成功返回包含自动生成 ID 的游戏对象
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('add-game', async (event, game) => {
  try {
    const games = await fs.readJson(gamesFile);
    game.id = Date.now().toString();
    games.push(game);
    await fs.writeJson(gamesFile, games);
    return { success: true, game };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC 处理器：删除游戏
 * @listens ipcMain#delete-game
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} gameId - 要删除的游戏 ID
 * @returns {Promise<{success: boolean, error?: string}>} 操作结果
 * @description 仅从列表中移除，不删除实际文件
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('delete-game', async (event, gameId) => {
  try {
    const games = await fs.readJson(gamesFile);
    const filteredGames = games.filter(g => g.id !== gameId);
    await fs.writeJson(gamesFile, filteredGames);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== 程序启动 ====================

/**
 * IPC 处理器：启动外部程序
 * @listens ipcMain#launch-program
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {Object} params - 启动参数
 * @param {string} params.exePath - 可执行文件路径
 * @param {boolean} params.useLocale - 是否使用转区启动
 * @param {string} params.localeEmulatorPath - Locale Emulator 路径
 * @returns {Promise<{success: boolean, error?: string}>} 启动结果
 * @description 支持 exe 和 bat 文件，支持通过 Locale Emulator 转区启动
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('launch-program', async (event, { exePath, useLocale, localeEmulatorPath }) => {
  try {
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, error: '程序文件不存在' };
    }

    const ext = path.extname(exePath).toLowerCase();
    const isBat = ext === '.bat';

    if (useLocale && localeEmulatorPath && fs.existsSync(localeEmulatorPath)) {
      const leProc = spawn(localeEmulatorPath, [exePath], {
        detached: true,
        windowsHide: false
      });
      leProc.unref();
    } else {
      if (isBat) {
        const batProc = spawn('cmd.exe', ['/c', exePath], {
          detached: true,
          windowsHide: false,
          cwd: path.dirname(exePath)
        });
        batProc.unref();
      } else {
        const proc = spawn(exePath, [], {
          detached: true,
          windowsHide: false,
          cwd: path.dirname(exePath)
        });
        proc.unref();
      }
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

/**
 * IPC 处理器：打开文件夹
 * @listens ipcMain#open-folder
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} folderPath - 要打开的文件夹路径
 * @returns {Promise<{success: boolean, error?: string}>} 操作结果
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      shell.openPath(folderPath);
      return { success: true };
    }
    return { success: false, error: '文件夹不存在' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== 图片管理 ====================

/**
 * IPC 处理器：复制游戏图片到应用目录
 * @listens ipcMain#copy-image
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} imagePath - 源图片路径
 * @param {string} gameId - 游戏 ID（用于生成文件名）
 * @returns {Promise<string|null>} 目标路径，失败返回 null
 * @description 将图片复制到 dataPath/images/ 目录下，命名为 game_{id}.{ext}
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('copy-image', async (event, imagePath, gameId) => {
  try {
    const ext = path.extname(imagePath);
    const targetName = `game_${gameId}${ext}`;
    const targetPath = path.join(dataPath, 'images', targetName);
    await fs.ensureDir(path.dirname(targetPath));
    await fs.copy(imagePath, targetPath);
    return targetPath;
  } catch (error) {
    return null;
  }
});

// ==================== 攻略管理 ====================

/**
 * IPC 处理器：获取攻略数据
 * @listens ipcMain#get-guide
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} gameId - 游戏 ID
 * @returns {Promise<Object|null>} 攻略数据对象，不存在返回 null
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('get-guide', async (event, gameId) => {
  try {
    const guides = await fs.readJson(guidesFile);
    return guides[gameId] || null;
  } catch (error) {
    return null;
  }
});

/**
 * IPC 处理器：保存攻略数据
 * @listens ipcMain#save-guide
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} gameId - 游戏 ID
 * @param {Object} guideData - 攻略数据（节点和连接）
 * @returns {Promise<{success: boolean, error?: string}>} 操作结果
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('save-guide', async (event, gameId, guideData) => {
  try {
    const guides = await fs.readJson(guidesFile);
    guides[gameId] = guideData;
    await fs.writeJson(guidesFile, guides);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== 拖放添加游戏 ====================

/**
 * IPC 处理器：处理拖放的文件
 * @listens ipcMain#drop-game
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} filePath - 拖放的文件路径
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>} 
 *          成功返回游戏初始数据对象
 * @description 验证文件类型（仅支持 exe/bat），提取文件名和目录信息
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('drop-game', async (event, filePath) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.exe' && ext !== '.bat') {
      return { success: false, error: '只支持 exe 或 bat 文件' };
    }

    const folderPath = path.dirname(filePath);
    const gameName = path.basename(filePath, ext);

    return {
      success: true,
      data: {
        name: gameName,
        exePath: filePath,
        folderPath: folderPath,
        type: 'galgame'
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== MTool 启动 ====================

/**
 * IPC 处理器：启动 MTool 工具
 * @listens ipcMain#launch-mtool
 * @async
 * @returns {Promise<{success: boolean, error?: string}>} 启动结果
 * @description 从设置中读取 MTool 路径并启动，支持 exe 和 bat
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('launch-mtool', async () => {
  try {
    const settings = await fs.readJson(settingsFile);
    if (!settings.mtoolPath || !fs.existsSync(settings.mtoolPath)) {
      return { success: false, error: 'MTool 路径未配置或文件不存在' };
    }

    const ext = path.extname(settings.mtoolPath).toLowerCase();
    const isBat = ext === '.bat';

    if (isBat) {
      const batProc = spawn('cmd.exe', ['/c', settings.mtoolPath], {
        detached: true,
        windowsHide: false,
        cwd: path.dirname(settings.mtoolPath)
      });
      batProc.unref();
    } else {
      const proc = spawn(settings.mtoolPath, [], {
        detached: true,
        windowsHide: false,
        cwd: path.dirname(settings.mtoolPath)
      });
      proc.unref();
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== 文件导出 ====================

/**
 * IPC 处理器：保存攻略到文件（导出）
 * @listens ipcMain#save-file
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {Object} params - 保存参数
 * @param {string} params.defaultPath - 默认文件名
 * @param {string} params.content - 文件内容（JSON 字符串）
 * @returns {Promise<{success: boolean, filePath?: string, canceled?: boolean, error?: string}>} 
 *          操作结果
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('save-file', async (event, { defaultPath, content }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存攻略文件',
      defaultPath: defaultPath,
      filters: [{ name: '攻略文件', extensions: ['gwalk'] }]
    });
    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== 游戏打包 ====================

/**
 * IPC 处理器：打包游戏文件为 ZIP
 * @listens ipcMain#pack-game
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} gameId - 要打包的游戏 ID
 * @returns {Promise<{success: boolean, filePath?: string, error?: string}>} 
 *          操作结果
 * @description 将游戏文件夹、存档文件夹和攻略文件打包为 ZIP，支持进度反馈
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('pack-game', async (event, gameId) => {
  try {
    const games = await fs.readJson(gamesFile);
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return { success: false, error: '游戏不存在' };
    }

    const gameFolder = game.folderPath;
    const saveFolder = game.savePath;

    if (!gameFolder || !fs.existsSync(gameFolder)) {
      return { success: false, error: '游戏文件夹不存在' };
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存打包文件',
      defaultPath: path.join(os.homedir(), `${game.name}.zip`),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
    });

    if (canceled || !filePath) {
      return { success: false, error: '用户取消' };
    }

    event.sender.send('pack-progress', {
      percent: 0,
      status: '正在计算文件总大小...'
    });

    /**
     * 递归计算文件夹大小
     * @param {string} dir - 目录路径
     * @returns {Promise<number>} 字节数
     */
    async function getFolderSize(dir) {
      let total = 0;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += await getFolderSize(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          total += stat.size;
        }
      }
      return total;
    }

    let totalBytes = 0;
    totalBytes += await getFolderSize(gameFolder);
    if (saveFolder && fs.existsSync(saveFolder) && path.resolve(saveFolder) !== path.resolve(gameFolder)) {
      totalBytes += await getFolderSize(saveFolder);
    }
    
    const guides = await fs.readJson(guidesFile);
    if (guides[gameId]) {
      totalBytes += 1024; 
    }

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('progress', (progress) => {
      const percent = totalBytes > 0 
        ? Math.min(100, Math.round((progress.fs.processedBytes / totalBytes) * 100))
        : 0;
      const processedMB = (progress.fs.processedBytes / 1024 / 1024).toFixed(2);
      const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
      const status = `已打包 ${processedMB} MB / ${totalMB} MB (${percent}%)`;
      
      event.sender.send('pack-progress', {
        percent: percent,
        status: status
      });
    });

    archive.on('error', err => {
      throw err;
    });

    const completion = new Promise((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', err => reject(err));
    });

    archive.pipe(output);

    const gameBaseName = path.basename(gameFolder);
    archive.directory(gameFolder, gameBaseName);

    if (saveFolder && fs.existsSync(saveFolder) && path.resolve(saveFolder) !== path.resolve(gameFolder)) {
      const saveBaseName = path.basename(saveFolder);
      archive.directory(saveFolder, `Savedata-${saveBaseName}`);
    }

    if (guides[gameId]) {
      const guideContent = JSON.stringify(guides[gameId], null, 2);
      archive.append(guideContent, { name: `${game.name}.gwalk` });
    }

    await archive.finalize();
    await completion;

    return { success: true, filePath };
  } catch (error) {
    console.error('打包失败:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 删除源文件 ====================

/**
 * IPC 处理器：永久删除游戏源文件
 * @listens ipcMain#delete-source-files
 * @async
 * @param {Electron.IpcMainInvokeEvent} event - IPC 事件对象
 * @param {string} gameId - 要删除的游戏 ID
 * @returns {Promise<{success: boolean, error?: string}>} 操作结果
 * @description 删除游戏文件夹和存档文件夹（如果分开存储），操作不可恢复
 * @author EternoPax
 * @since 2026/2/28
 */
ipcMain.handle('delete-source-files', async (event, gameId) => {
  try {
    const games = await fs.readJson(gamesFile);
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return { success: false, error: '游戏不存在' };
    }

    const gameFolder = game.folderPath;
    const saveFolder = game.savePath;

    if (!gameFolder || !fs.existsSync(gameFolder)) {
      return { success: false, error: '游戏文件夹不存在或已被删除' };
    }

    await fs.remove(gameFolder);

    if (saveFolder && fs.existsSync(saveFolder) && path.resolve(saveFolder) !== path.resolve(gameFolder)) {
      await fs.remove(saveFolder);
    }

    return { success: true };
  } catch (error) {
    console.error('删除源文件失败:', error);
    return { success: false, error: error.message };
  }
});