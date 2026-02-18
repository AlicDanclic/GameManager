const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const os = require('os');

// 数据存储路径
const dataPath = path.join(os.homedir(), '.game-manager');
const gamesFile = path.join(dataPath, 'games.json');
const settingsFile = path.join(dataPath, 'settings.json');
const guidesFile = path.join(dataPath, 'guides.json');

// 确保数据目录存在
fs.ensureDirSync(dataPath);

// 默认设置
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

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    titleBarStyle: 'default',
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

  // 开发工具
  // mainWindow.webContents.openDevTools();
}

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

// IPC 处理

// 获取设置
ipcMain.handle('get-settings', async () => {
  try {
    const settings = await fs.readJson(settingsFile);
    return settings;
  } catch (error) {
    return defaultSettings;
  }
});

// 保存设置
ipcMain.handle('save-settings', async (event, settings) => {
  try {
    await fs.writeJson(settingsFile, settings);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 选择文件
ipcMain.handle('select-file', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  return result.filePaths[0] || null;
});

// 选择文件夹
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

// 获取游戏列表
ipcMain.handle('get-games', async () => {
  try {
    const games = await fs.readJson(gamesFile);
    return games;
  } catch (error) {
    return [];
  }
});

// 保存游戏列表
ipcMain.handle('save-games', async (event, games) => {
  try {
    await fs.writeJson(gamesFile, games);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 添加游戏
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

// 删除游戏
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

// 启动程序
ipcMain.handle('launch-program', async (event, { exePath, useLocale, localeEmulatorPath }) => {
  try {
    if (!exePath || !fs.existsSync(exePath)) {
      return { success: false, error: '程序文件不存在' };
    }

    const ext = path.extname(exePath).toLowerCase();
    const isBat = ext === '.bat';

    if (useLocale && localeEmulatorPath && fs.existsSync(localeEmulatorPath)) {
      // 使用 Locale Emulator 启动
      const leProc = spawn(localeEmulatorPath, [exePath], {
        detached: true,
        windowsHide: false
      });
      leProc.unref();
    } else {
      // 直接启动
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

// 打开文件夹
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

// 选择图片
ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
    ]
  });
  return result.filePaths[0] || null;
});

// 复制图片到应用目录
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

// 获取攻略数据
ipcMain.handle('get-guide', async (event, gameId) => {
  try {
    const guides = await fs.readJson(guidesFile);
    return guides[gameId] || null;
  } catch (error) {
    return null;
  }
});

// 保存攻略数据
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

// 拖放添加游戏
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

// 启动 MTool
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
