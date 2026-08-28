/**
 * @fileoverview 主进程 IPC 处理器
 * @description 集中注册所有 ipcMain 处理器：窗口控制、设置管理、文件选择、
 *              游戏管理、程序启动、图片管理、攻略管理、拖放添加、MTool 启动、
 *              文件导入导出、游戏打包与源文件删除，以及新增的安全读取接口。
 * @module ipc
 * @author EternoPax
 * @since 2026/2/28
 * @version 2.0.0
 */

const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const archiver = require('archiver');
const { spawn } = require('child_process');
const processUtil = require('./process-util');

// ==================== 数据存储配置 ====================

/**
 * 应用数据存储根目录（用户主目录下的隐藏文件夹）
 * @constant {string}
 */
const dataPath = path.join(os.homedir(), '.game-manager');

/** @constant {string} 游戏列表数据文件路径 */
const gamesFile = path.join(dataPath, 'games.json');

/** @constant {string} 应用设置文件路径 */
const settingsFile = path.join(dataPath, 'settings.json');

/** @constant {string} 攻略数据文件路径 */
const guidesFile = path.join(dataPath, 'guides.json');

/**
 * 默认设置配置对象
 * @constant {Object}
 */
const defaultSettings = {
  translatorTool: '',
  mtoolPath: '',
  localeEmulator: '',
  defaultGalMode: 'noLocale',
  // 搜索状态持久化：搜索词、类型筛选与历史记录（尽量保存；旧版本文件缺失时由渲染层回退默认）
  searchState: {
    query: '',
    filterType: 'all',
    history: []
  },
  // 最近游玩游戏 id 列表（最新在前，最多 5 个），随设置一起持久化到 settings.json
  recentGames: []
};

/**
 * 允许渲染层通过 read-icon 读取的内联图标白名单
 * @constant {string[]}
 */
const ICON_WHITELIST = ['status-locale.svg', 'tool-translator.svg', 'empty-game.svg'];

/**
 * 注册全部 IPC 处理器（应用 ready 后调用一次）
 * @function registerIpcHandlers
 * @param {Function} getMainWindow - 返回当前主窗口引用的函数
 * @returns {void}
 */
function registerIpcHandlers(getMainWindow) {
  if (process.env.GM_DEBUG !== '0') console.log('[ipc] registering IPC handlers...');
  const win = () => getMainWindow();

  // 确保数据目录与初始文件存在
  fs.ensureDirSync(dataPath);
  if (!fs.existsSync(settingsFile)) fs.writeJsonSync(settingsFile, defaultSettings);
  if (!fs.existsSync(gamesFile)) fs.writeJsonSync(gamesFile, []);
  if (!fs.existsSync(guidesFile)) fs.writeJsonSync(guidesFile, {});

  // ==================== 游戏运行状态管理 ====================

  /**
   * 正在运行的游戏集合。
   * gameId -> { mode: 'proc'|'scan', exePath, running, proc? }
   *  - 'proc'：普通 exe，主进程直接持有子进程引用，靠 exit 事件精确判断退出
   *  - 'scan'：转区 / bat / 重启恢复，子进程不代表游戏本体，改由系统进程列表按 exePath 兜底
   * @type {Map<string, {mode: string, exePath: string, running: boolean, proc?: import('child_process').ChildProcess}>}
   */
  const runningGames = new Map();

  /** @constant {number} 进程列表兜底扫描间隔（毫秒） */
  const SCAN_INTERVAL_MS = 2000;

  /** @type {NodeJS.Timeout|null} 扫描器定时器 */
  let scanTimer = null;

  /**
   * 向主窗口推送游戏运行状态（若无窗口则静默忽略）。
   * @param {string} gameId - 游戏 id
   * @param {boolean} running - 是否运行中
   */
  function sendGameStatus(gameId, running) {
    const w = win();
    if (w && !w.isDestroyed()) {
      w.webContents.send('game-status', { gameId, running });
    }
  }

  /**
   * 判断某游戏是否已被本应用标记为运行中（用于防重复启动）。
   * @param {string} gameId - 游戏 id
   * @returns {boolean}
   */
  function hasRunningGame(gameId) {
    const entry = runningGames.get(gameId);
    return !!entry && entry.running;
  }

  /**
   * 是否存在待扫描（mode='scan' 且运行中）条目，决定扫描器是否空转。
   * @returns {boolean}
   */
  function hasScanEntries() {
    for (const entry of runningGames.values()) {
      if (entry.mode === 'scan' && entry.running) return true;
    }
    return false;
  }

  function startScanner() {
    if (scanTimer) return;
    scanTimer = setInterval(scanRunningGames, SCAN_INTERVAL_MS);
  }

  function stopScanner() {
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  /** 按需求启停扫描器（仅在存在待扫描条目时运行，避免空转系统调用） */
  function ensureScanner() {
    if (hasScanEntries()) startScanner();
    else stopScanner();
  }

  /**
   * 扫描一次系统进程列表，刷新所有 mode='scan' 条目的运行状态。
   * 检测到某个游戏已退出时，推送状态并移出跟踪集合。
   */
  async function scanRunningGames() {
    if (!hasScanEntries()) {
      stopScanner();
      return;
    }
    try {
      const paths = await processUtil.getRunningProcessPaths();
      const pathSet = new Set(paths);
      for (const [gameId, entry] of runningGames) {
        if (entry.mode !== 'scan') continue;
        const isRunning = pathSet.has(processUtil.normalizePath(entry.exePath));
        if (isRunning === entry.running) continue;
        entry.running = isRunning;
        if (!isRunning) runningGames.delete(gameId);
        sendGameStatus(gameId, isRunning);
      }
    } catch (error) {
      console.error('[ipc] 扫描运行中游戏失败:', error.message);
    }
    ensureScanner();
  }

  /**
   * 应用启动时恢复运行状态：游戏因 detached 在应用退出后可能仍在后台运行，
   * 此处按 exePath 扫描一次并把仍在运行的游戏标记运行中（统一按 scan 模式跟踪，
   * 因此时已无子进程引用，只能轮询）。
   */
  async function restoreRunningGames() {
    try {
      const games = await fs.readJson(gamesFile);
      if (!Array.isArray(games)) return;
      const targets = games.filter(g => g && g.id && g.exePath);
      if (!targets.length) return;
      const paths = await processUtil.getRunningProcessPaths();
      const pathSet = new Set(paths);
      for (const game of targets) {
        if (pathSet.has(processUtil.normalizePath(game.exePath))) {
          runningGames.set(game.id, { mode: 'scan', exePath: game.exePath, running: true });
        }
      }
      ensureScanner();
    } catch (error) {
      console.error('[ipc] 恢复运行中游戏失败:', error.message);
    }
  }
  // 触发一次启动恢复扫描（fire-and-forget，不阻塞窗口创建）
  restoreRunningGames();

  // ==================== 安全读取接口 ====================

  /**
   * IPC：读取内联图标内容（白名单内）
   * @listens ipcMain#read-icon
   */
  ipcMain.handle('read-icon', async (event, name) => {
    if (typeof name !== 'string' || !ICON_WHITELIST.includes(name)) return '';
    const iconPath = path.join(__dirname, '../public/icons', name);
    try {
      return await fs.readFile(iconPath, 'utf8');
    } catch (error) {
      console.error(`读取图标失败 ${name}:`, error.message);
      return '';
    }
  });

  /**
   * IPC：读取文本文件内容（仅限 .gwalk/.json，供攻略导入使用）
   * @listens ipcMain#read-text-file
   */
  ipcMain.handle('read-text-file', async (event, filePath) => {
    if (typeof filePath !== 'string') return { success: false, error: '无效的文件路径' };
    const ext = path.extname(filePath).toLowerCase();
    if (!['.gwalk', '.json'].includes(ext)) {
      return { success: false, error: '仅支持 .gwalk 或 .json 攻略文件' };
    }
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== 窗口控制 IPC ====================

  ipcMain.on('window-minimize', () => {
    if (win()) win().minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (win()) {
      if (win().isMaximized()) win().unmaximize();
      else win().maximize();
    }
  });

  ipcMain.on('window-close', () => {
    if (win()) win().close();
  });

  // ==================== 设置管理 ====================

  ipcMain.handle('get-settings', async () => {
    try {
      const loaded = await fs.readJson(settingsFile);
      // 与默认值合并，补齐旧版本文件缺失的字段（如 recentGames / searchState）
      return { ...defaultSettings, ...(loaded || {}) };
    } catch (error) {
      return defaultSettings;
    }
  });

  ipcMain.handle('save-settings', async (event, settings) => {
    try {
      await fs.writeJson(settingsFile, settings);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== 文件选择 ====================

  ipcMain.handle('select-file', async (event, filters) => {
    const result = await dialog.showOpenDialog(win(), {
      properties: ['openFile'],
      filters: filters || [{ name: 'All Files', extensions: ['*'] }]
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(win(), {
      properties: ['openDirectory']
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog(win(), {
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp'] }
      ]
    });
    return result.filePaths[0] || null;
  });

  // ==================== 游戏管理 ====================

  ipcMain.handle('get-games', async () => {
    try {
      return await fs.readJson(gamesFile);
    } catch (error) {
      return [];
    }
  });

  ipcMain.handle('save-games', async (event, games) => {
    try {
      await fs.writeJson(gamesFile, games);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('add-game', async (event, game) => {
    try {
      const games = await fs.readJson(gamesFile);
      game.id = Date.now().toString();
      // 未提供 folderPath 时由主进程根据 exePath 自动推导
      if (!game.folderPath && game.exePath) {
        game.folderPath = path.dirname(game.exePath);
      }
      games.push(game);
      await fs.writeJson(gamesFile, games);
      return { success: true, game };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

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

  ipcMain.handle('launch-program', async (event, { exePath, useLocale, localeEmulatorPath, gameId }) => {
    try {
      if (!exePath || !fs.existsSync(exePath)) {
        return { success: false, error: '程序文件不存在' };
      }

      // 防重复启动：该游戏已被标记为运行中时直接拒绝
      if (gameId && hasRunningGame(gameId)) {
        return { success: false, error: '游戏已在运行' };
      }

      const ext = path.extname(exePath).toLowerCase();
      const isBat = ext === '.bat';

      let proc;
      if (useLocale && localeEmulatorPath && fs.existsSync(localeEmulatorPath)) {
        proc = spawn(localeEmulatorPath, [exePath], {
          detached: true,
          windowsHide: false
        });
      } else if (isBat) {
        proc = spawn('cmd.exe', ['/c', exePath], {
          detached: true,
          windowsHide: false,
          cwd: path.dirname(exePath)
        });
      } else {
        proc = spawn(exePath, [], {
          detached: true,
          windowsHide: false,
          cwd: path.dirname(exePath)
        });
      }

      if (gameId) {
        if (useLocale || isBat) {
          // 子进程是 LEProc / cmd 外壳，不代表游戏本体，交由扫描器按 exePath 判定
          runningGames.set(gameId, { mode: 'scan', exePath, running: true });
          ensureScanner();
        } else {
          // 普通 exe：持有子进程引用，靠 exit 事件精确判断退出
          const entry = { mode: 'proc', exePath, running: true, proc };
          runningGames.set(gameId, entry);
          proc.on('exit', () => {
            const cur = runningGames.get(gameId);
            if (cur && cur === entry && cur.mode === 'proc') {
              runningGames.delete(gameId);
              sendGameStatus(gameId, false);
            }
          });
        }
        sendGameStatus(gameId, true);
      }

      // 进程创建失败（如权限/格式错误会触发 error 而非 throw）时清理运行状态，
      // 避免残留"运行中"垃圾条目
      proc.on('error', (err) => {
        console.error('[ipc] 启动进程出错:', err.message);
        if (gameId) {
          const cur = runningGames.get(gameId);
          if (cur) {
            runningGames.delete(gameId);
            sendGameStatus(gameId, false);
          }
        }
      });

      // unref：允许主进程退出时不被游戏进程拖住；但引用仍保留在 runningGames，
      // 普通 exe 的 exit 事件依旧可监听
      proc.unref();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-running-games', async () => {
    const ids = [];
    for (const [gameId, entry] of runningGames) {
      if (entry.running) ids.push(gameId);
    }
    return ids;
  });

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

  ipcMain.handle('get-guide', async (event, gameId) => {
    try {
      const guides = await fs.readJson(guidesFile);
      return guides[gameId] || null;
    } catch (error) {
      return null;
    }
  });

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

  ipcMain.handle('save-file', async (event, { defaultPath, content }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(win(), {
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

      const { canceled, filePath } = await dialog.showSaveDialog(win(), {
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
}

module.exports = { registerIpcHandlers };
