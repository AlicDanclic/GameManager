const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { exec, spawn } = require('child_process');
const os = require('os');
const archiver = require('archiver'); // 用于打包

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
    width: 1080,
    height: 720,
    minWidth: 1080,
    minHeight: 720,
    frame: false, // 隐藏默认窗口边框，使用自定义标题栏
    titleBarStyle: 'default', // 对 Windows 无影响
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

  // 开发工具（可选）
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

// ==================== 窗口控制 IPC ====================
ipcMain.on('window-minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow.close();
});

// ==================== 原有 IPC 处理 ====================

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

// ==================== 新增：保存文件（用于导出攻略，仅支持 .gwalk） ====================
ipcMain.handle('save-file', async (event, { defaultPath, content }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存攻略文件',
      defaultPath: defaultPath,
      filters: [{ name: '攻略文件', extensions: ['gwalk'] }] // 只允许 .gwalk 扩展名
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

// ==================== 一键打包（带进度，预计算总大小，包含攻略文件） ====================
ipcMain.handle('pack-game', async (event, gameId) => {
  try {
    // 读取游戏列表
    const games = await fs.readJson(gamesFile);
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return { success: false, error: '游戏不存在' };
    }

    const gameFolder = game.folderPath;
    const saveFolder = game.savePath;

    // 检查游戏文件夹是否存在
    if (!gameFolder || !fs.existsSync(gameFolder)) {
      return { success: false, error: '游戏文件夹不存在' };
    }

    // 弹出保存对话框，让用户选择 ZIP 保存位置
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存打包文件',
      defaultPath: path.join(os.homedir(), `${game.name}.zip`),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
    });

    if (canceled || !filePath) {
      return { success: false, error: '用户取消' };
    }

    // --- 预计算总大小 ---
    event.sender.send('pack-progress', {
      percent: 0,
      status: '正在计算文件总大小...'
    });

    // 辅助函数：递归计算文件夹大小
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
    
    // 如果存在攻略，预估攻略文件大小（通常很小，粗略估算1KB）
    const guides = await fs.readJson(guidesFile);
    if (guides[gameId]) {
      totalBytes += 1024; 
    }
    // --- 预计算完成 ---

    // 创建输出流
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } }); // 最高压缩比

    // 监听进度（使用预计算总大小）
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

    // 监听错误
    archive.on('error', err => {
      throw err;
    });

    // 当输出流关闭时完成
    const completion = new Promise((resolve, reject) => {
      output.on('close', () => resolve());
      archive.on('error', err => reject(err));
    });

    archive.pipe(output);

    // 添加游戏文件夹（保持原名）
    const gameBaseName = path.basename(gameFolder);
    archive.directory(gameFolder, gameBaseName);

    // 如果存档文件夹存在且与游戏文件夹不同，则添加存档文件夹并重命名
    if (saveFolder && fs.existsSync(saveFolder) && path.resolve(saveFolder) !== path.resolve(gameFolder)) {
      const saveBaseName = path.basename(saveFolder);
      archive.directory(saveFolder, `Savedata-${saveBaseName}`);
    }

    // ==================== 新增：添加攻略文件 ====================
    if (guides[gameId]) {
      // 将攻略数据序列化为JSON字符串
      const guideContent = JSON.stringify(guides[gameId], null, 2);
      // 添加到压缩包，文件名为"游戏名.gwalk"
      archive.append(guideContent, { name: `${game.name}.gwalk` });
      console.log(`已添加攻略文件: ${game.name}.gwalk`);
    }
    // =========================================================

    // 完成打包
    await archive.finalize();
    await completion;

    return { success: true, filePath };
  } catch (error) {
    console.error('打包失败:', error);
    return { success: false, error: error.message };
  }
});

// ==================== 删除源文件（游戏文件夹和存档文件夹） ====================
ipcMain.handle('delete-source-files', async (event, gameId) => {
  try {
    const games = await fs.readJson(gamesFile);
    const game = games.find(g => g.id === gameId);
    if (!game) {
      return { success: false, error: '游戏不存在' };
    }

    const gameFolder = game.folderPath;
    const saveFolder = game.savePath;

    // 检查游戏文件夹是否存在
    if (!gameFolder || !fs.existsSync(gameFolder)) {
      return { success: false, error: '游戏文件夹不存在或已被删除' };
    }

    // 删除游戏文件夹
    await fs.remove(gameFolder);

    // 如果存档文件夹存在且与游戏文件夹不同，则删除存档文件夹
    if (saveFolder && fs.existsSync(saveFolder) && path.resolve(saveFolder) !== path.resolve(gameFolder)) {
      await fs.remove(saveFolder);
    }

    return { success: true };
  } catch (error) {
    console.error('删除源文件失败:', error);
    return { success: false, error: error.message };
  }
});