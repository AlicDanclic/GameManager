/**
 * @fileoverview 游戏管理器渲染进程主脚本
 * @description 负责游戏库管理、攻略节点编辑器、设置管理等功能的渲染层逻辑
 * @module app
 * @author EternoPax
 * @since 2026/2/28
 * @version 1.0.0
 */

const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// ==================== SVG 图标加载工具 ====================

/**
 * SVG 图标缓存对象
 * @namespace
 * @property {string} locale - 转区状态图标 SVG 字符串
 * @property {string} translate - 翻译工具图标 SVG 字符串
 * @property {string} empty - 空状态图标 SVG 字符串
 * @author EternoPax
 * @since 2026/2/28
 */
const svgs = {
  locale: loadSvg('status-locale.svg'),
  translate: loadSvg('tool-translator.svg'),
  empty: loadSvg('empty-game.svg')
};

/**
 * 从文件系统加载 SVG 图标文件
 * @function loadSvg
 * @param {string} iconName - SVG 文件名（相对于 assets/icons/ 目录）
 * @returns {string} SVG 文件内容的字符串，加载失败返回空字符串
 * @description 从项目根目录的 assets/icons/ 文件夹读取 SVG 文件内容，
 *              用于在渲染时直接嵌入内联 SVG 替代 Emoji 图标
 * @author EternoPax
 * @since 2026/2/28
 */
function loadSvg(iconName) {
  try {
    // 从 src/renderer/js/app.js 定位到项目根目录的 assets/icons/
    const iconPath = path.join(__dirname, '../../assets/icons', iconName);
    return fs.readFileSync(iconPath, 'utf8');
  } catch (err) {
    console.error(`加载图标失败 ${iconName}:`, err.message);
    return '';
  }
}

// 调试用：检查图标是否加载成功
console.log('Icons loaded:', {
  locale: svgs.locale ? 'OK' : 'Failed',
  translate: svgs.translate ? 'OK' : 'Failed',
  empty: svgs.empty ? 'OK' : 'Failed'
});

// ==================== 全局状态管理 ====================

/**
 * 游戏列表数据
 * @global
 * @type {Array<Object>}
 * @default []
 * @author EternoPax
 * @since 2026/2/28
 */
let games = [];

/**
 * 应用设置配置对象
 * @global
 * @type {Object}
 * @property {string} translatorTool - 翻译工具可执行文件路径
 * @property {string} mtoolPath - MTool 工具路径
 * @property {string} localeEmulator - Locale Emulator 路径
 * @property {string} defaultGalMode - Galgame 默认启动模式 ('locale' | 'noLocale')
 * @default {}
 * @author EternoPax
 * @since 2026/2/28
 */
let settings = {};

/**
 * 当前正在编辑攻略的游戏 ID
 * @global
 * @type {string|null}
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let currentGuideGameId = null;

/**
 * 攻略编辑器数据对象
 * @global
 * @type {Object}
 * @property {Array<Object>} nodes - 节点数组
 * @property {Array<Object>} connections - 连接线数组
 * @default { nodes: [], connections: [] }
 * @author EternoPax
 * @since 2026/2/28
 */
let guideData = { nodes: [], connections: [] };

/**
 * 当前选中的节点对象（用于拖拽）
 * @global
 * @type {Object|null}
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let selectedNode = null;

/**
 * 是否正在拖拽节点
 * @global
 * @type {boolean}
 * @default false
 * @author EternoPax
 * @since 2026/2/28
 */
let isDraggingNode = false;

/**
 * 是否正在绘制连接线
 * @global
 * @type {boolean}
 * @default false
 * @author EternoPax
 * @since 2026/2/28
 */
let isConnecting = false;

/**
 * 连接线起点信息
 * @global
 * @type {Object|null}
 * @property {string} nodeId - 起始节点 ID
 * @property {number} portIndex - 起始端口索引
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let connectionStart = null;

/**
 * 拖拽偏移量（用于计算节点新位置）
 * @global
 * @type {Object}
 * @property {number} x - X 轴偏移
 * @property {number} y - Y 轴偏移
 * @default { x: 0, y: 0 }
 * @author EternoPax
 * @since 2026/2/28
 */
let dragOffset = { x: 0, y: 0 };

/**
 * 临时连接线 SVG 元素
 * @global
 * @type {SVGPathElement|null}
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let tempLine = null;

/**
 * 当前正在编辑的游戏 ID（用于编辑模式）
 * @global
 * @type {string|null}
 * @default null
 * @author EternoPax
 * @since 2026/2/28
 */
let editingGameId = null;

// ==================== 初始化 ====================

/**
 * DOM 加载完成后初始化应用
 * @function
 * @listens DOMContentLoaded
 * @async
 * @returns {Promise<void>}
 * @description 初始化设置、游戏列表、事件监听和 IPC 通信
 * @author EternoPax
 * @since 2026/2/28
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadGames();
  setupNavigation();
  setupDropZone();
  setupModals();
  setupGameTypeToggle();

  // 监听打包进度更新
  ipcRenderer.on('pack-progress', (event, progress) => {
    const percent = progress.percent || 0;
    const status = progress.status || '';
    const fill = document.getElementById('pack-progress-fill');
    const statusEl = document.getElementById('pack-progress-status');
    if (fill) fill.style.width = percent + '%';
    if (statusEl) statusEl.textContent = status;
  });
});

// ==================== 窗口控制 ====================

/**
 * 最小化应用窗口
 * @global
 * @function minimizeWindow
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
window.minimizeWindow = () => ipcRenderer.send('window-minimize');

/**
 * 最大化/还原应用窗口
 * @global
 * @function maximizeWindow
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
window.maximizeWindow = () => ipcRenderer.send('window-maximize');

/**
 * 关闭应用窗口
 * @global
 * @function closeWindow
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
window.closeWindow = () => ipcRenderer.send('window-close');

// ==================== 导航 ====================

/**
 * 设置侧边栏导航切换功能
 * @function setupNavigation
 * @returns {void}
 * @description 为导航项添加点击事件，切换活动页面和导航状态
 * @author EternoPax
 * @since 2026/2/28
 */
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`${page}-page`).classList.add('active');
    });
  });
}

// ==================== 设置管理 ====================

/**
 * 从主进程加载应用设置
 * @function loadSettings
 * @async
 * @returns {Promise<void>}
 * @description 获取设置并更新 UI 输入框的值，同时更新工具按钮显示状态
 * @author EternoPax
 * @since 2026/2/28
 */
async function loadSettings() {
  settings = await ipcRenderer.invoke('get-settings');
  document.getElementById('translator-tool-path').value = settings.translatorTool || '';
  document.getElementById('mtool-path').value = settings.mtoolPath || '';
  document.getElementById('locale-emulator-path').value = settings.localeEmulator || '';
  document.getElementById('default-gal-mode').value = settings.defaultGalMode || 'noLocale';
  updateToolButtons();
}

/**
 * 根据设置更新工具栏按钮显示状态
 * @function updateToolButtons
 * @returns {void}
 * @description 根据 MTool 和翻译工具路径是否存在，控制对应按钮的显示/隐藏
 * @author EternoPax
 * @since 2026/2/28
 */
function updateToolButtons() {
  const mtoolBtn = document.getElementById('mtool-btn');
  mtoolBtn.style.display = settings.mtoolPath ? 'inline-flex' : 'none';
  
  const translatorBtn = document.getElementById('translator-btn');
  translatorBtn.style.display = settings.translatorTool ? 'inline-flex' : 'none';
}

/**
 * 启动 MTool 工具
 * @global
 * @function launchMtool
 * @async
 * @returns {Promise<void>}
 * @description 通过 IPC 调用主进程启动 MTool，失败时显示警告
 * @author EternoPax
 * @since 2026/2/28
 */
async function launchMtool() {
  const result = await ipcRenderer.invoke('launch-mtool');
  if (!result.success) alert('启动 MTool 失败: ' + result.error);
}

/**
 * 启动翻译工具
 * @global
 * @function launchTranslator
 * @async
 * @returns {Promise<void>}
 * @description 检查配置后启动翻译工具，不使用转区
 * @author EternoPax
 * @since 2026/2/28
 */
async function launchTranslator() {
  if (!settings.translatorTool) {
    alert('翻译工具路径未配置');
    return;
  }
  const result = await ipcRenderer.invoke('launch-program', {
    exePath: settings.translatorTool,
    useLocale: false,
    localeEmulatorPath: ''
  });
  if (!result.success) alert('启动翻译器失败: ' + result.error);
}

/**
 * 选择翻译工具可执行文件
 * @global
 * @function selectTranslatorTool
 * @async
 * @returns {Promise<void>}
 * @description 打开文件选择对话框，选择 exe 文件作为翻译工具路径
 * @author EternoPax
 * @since 2026/2/28
 */
async function selectTranslatorTool() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable', extensions: ['exe'] }]);
  if (selectedPath) document.getElementById('translator-tool-path').value = selectedPath;
}

/**
 * 选择 MTool 可执行文件
 * @global
 * @function selectMtoolPath
 * @async
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function selectMtoolPath() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable/Batch', extensions: ['exe', 'bat'] }]);
  if (selectedPath) document.getElementById('mtool-path').value = selectedPath;
}

/**
 * 选择 Locale Emulator 可执行文件
 * @global
 * @function selectLocaleEmulator
 * @async
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function selectLocaleEmulator() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable', extensions: ['exe'] }]);
  if (selectedPath) document.getElementById('locale-emulator-path').value = selectedPath;
}

/**
 * 保存设置到主进程存储
 * @global
 * @function saveSettings
 * @async
 * @returns {Promise<void>}
 * @description 收集 UI 中的设置值，通过 IPC 保存，成功后刷新游戏列表显示
 * @author EternoPax
 * @since 2026/2/28
 */
async function saveSettings() {
  settings = {
    translatorTool: document.getElementById('translator-tool-path').value,
    mtoolPath: document.getElementById('mtool-path').value,
    localeEmulator: document.getElementById('locale-emulator-path').value,
    defaultGalMode: document.getElementById('default-gal-mode').value
  };
  const result = await ipcRenderer.invoke('save-settings', settings);
  if (result.success) {
    alert('设置已保存');
    updateToolButtons();
    renderGames();
  } else {
    alert('保存失败: ' + result.error);
  }
}

// ==================== 游戏管理 ====================

/**
 * 从主进程加载游戏列表
 * @global
 * @function loadGames
 * @async
 * @returns {Promise<void>}
 * @description 获取游戏数据并渲染游戏卡片网格
 * @author EternoPax
 * @since 2026/2/28
 */
async function loadGames() {
  games = await ipcRenderer.invoke('get-games');
  renderGames();
}

/**
 * 渲染游戏卡片网格
 * @function renderGames
 * @returns {void}
 * @description 根据 games 数组生成游戏卡片 HTML，包括图标状态、操作按钮等
 * @author EternoPax
 * @since 2026/2/28
 */
function renderGames() {
  const grid = document.getElementById('games-grid');
  if (games.length === 0) {
    // 使用内联 SVG 替代 Emoji
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">${svgs.empty}</div>
        <p class="empty-state-text">暂无游戏，点击"添加游戏"或拖拽 exe/bat 文件添加</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = games.map(game => {
    const configIcons = [];
    if (game.type === 'galgame') {
      // 使用内联 SVG 替代 Emoji 🌐
      if (game.useLocale) configIcons.push(`
        <span class="status-icon icon-locale" title="使用转区启动">${svgs.locale}</span>
      `);
      // 使用内联 SVG 替代 Emoji 📖
      if (game.autoTranslate && settings.translatorTool) configIcons.push(`
        <span class="status-icon icon-translate" title="自动启动翻译">${svgs.translate}</span>
      `);
    }
    const iconsHtml = configIcons.length ? `<div class="game-config-icons">${configIcons.join(' ')}</div>` : '';

    return `
    <div class="game-card ${game.type}" data-id="${game.id}">
      <div class="game-type-header">${getTypeLabel(game.type)}</div>
      <div class="game-image" onclick="selectGameImage('${game.id}')">
        ${game.image ? `<img src="file://${game.image}" alt="${game.name}">` : '点击添加图片'}
      </div>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        ${iconsHtml}
        <div class="game-actions">
          <button class="btn btn-small btn-secondary" onclick="openGameFolder('${game.id}')">打开文件夹</button>
          <button class="btn btn-small btn-secondary" onclick="openSaveFolder('${game.id}')">存档</button>
        </div>
        <div class="game-actions-row">
          <button class="btn btn-small btn-primary" onclick="launchGame('${game.id}')">启动</button>
          <button class="btn btn-small btn-secondary" onclick="openGuide('${game.id}')">攻略</button>
          <button class="btn btn-small btn-secondary" onclick="packGame('${game.id}')">打包</button>
          <button class="btn btn-small btn-danger" onclick="deleteSourceFiles('${game.id}')">删源</button>
          <button class="btn btn-small btn-secondary" onclick="editGame('${game.id}')">编辑</button>
          <button class="btn btn-small btn-danger" onclick="deleteGame('${game.id}')">删除</button>
        </div>
      </div>
    </div>
  `}).join('');
}

/**
 * 获取游戏类型的显示标签
 * @function getTypeLabel
 * @param {string} type - 游戏类型标识 ('galgame' | 'rpg' | 'unity')
 * @returns {string} 类型的中文显示名称
 * @author EternoPax
 * @since 2026/2/28
 */
function getTypeLabel(type) {
  const labels = { galgame: 'Galgame', rpg: 'RPG', unity: 'Unity' };
  return labels[type] || type;
}

// ==================== 拖放添加游戏 ====================

/**
 * 设置拖放区域事件监听
 * @function setupDropZone
 * @returns {void}
 * @description 配置全局拖放事件，支持从文件系统拖拽 exe/bat 文件快速添加游戏
 * @author EternoPax
 * @since 2026/2/28
 */
function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  document.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  document.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); });
  dropZone.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over'); });
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag-over');
    let filePath = null;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      filePath = e.dataTransfer.files[0].path;
    } else {
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const entry = items[0].webkitGetAsEntry();
        if (entry) filePath = e.dataTransfer.getData('text/plain') || items[0].getAsFile()?.path;
      }
    }
    if (!filePath && e.dataTransfer.getData('text/plain')) filePath = e.dataTransfer.getData('text/plain');
    if (filePath) {
      const ext = filePath.toLowerCase();
      if (ext.endsWith('.exe') || ext.endsWith('.bat')) {
        const result = await ipcRenderer.invoke('drop-game', filePath);
        if (result.success) openAddGameModalWithData(result.data);
        else alert(result.error);
      } else alert('只支持 exe 或 bat 文件');
    }
  });
}

// ==================== 添加/编辑游戏弹窗 ====================

/**
 * 待添加的游戏数据（从拖放获取）
 * @global
 * @type {Object|null}
 * @author EternoPax
 * @since 2026/2/28
 */
let pendingGameData = null;

/**
 * 设置模态框事件监听
 * @function setupModals
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function setupModals() {
  document.getElementById('add-game-btn').addEventListener('click', () => {
    editingGameId = null;
    pendingGameData = null;
    openAddGameModal();
  });
}

/**
 * 设置游戏类型切换监听
 * @function setupGameTypeToggle
 * @returns {void}
 * @description 根据选择的游戏类型显示/隐藏 Galgame 特有选项
 * @author EternoPax
 * @since 2026/2/28
 */
function setupGameTypeToggle() {
  const typeSelect = document.getElementById('game-type');
  const galgameOptions = document.getElementById('galgame-options');
  typeSelect.addEventListener('change', () => {
    galgameOptions.style.display = typeSelect.value === 'galgame' ? 'block' : 'none';
  });
}

/**
 * 打开添加游戏模态框（空白状态）
 * @global
 * @function openAddGameModal
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function openAddGameModal() {
  document.querySelector('#add-game-modal .modal-header h3').textContent = '添加游戏';
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('game-name').value = '';
  document.getElementById('game-type').value = 'galgame';
  document.getElementById('game-exe-path').value = '';
  document.getElementById('game-save-path').value = '';
  document.getElementById('game-use-locale').checked = false;
  document.getElementById('game-auto-translate').checked = false;
  document.getElementById('galgame-options').style.display = 'block';
}

/**
 * 打开添加游戏模态框（预填充拖放数据）
 * @global
 * @function openAddGameModalWithData
 * @param {Object} data - 拖放获取的游戏数据
 * @param {string} data.name - 游戏名称
 * @param {string} data.type - 游戏类型
 * @param {string} data.exePath - 可执行文件路径
 * @param {string} data.folderPath - 游戏文件夹路径
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function openAddGameModalWithData(data) {
  editingGameId = null;
  pendingGameData = data;
  document.querySelector('#add-game-modal .modal-header h3').textContent = '添加游戏';
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('game-name').value = data.name;
  document.getElementById('game-type').value = data.type;
  document.getElementById('game-exe-path').value = data.exePath;
  document.getElementById('game-save-path').value = '';
  document.getElementById('game-use-locale').checked = false;
  document.getElementById('game-auto-translate').checked = false;
  document.getElementById('galgame-options').style.display = data.type === 'galgame' ? 'block' : 'none';
}

/**
 * 关闭添加游戏模态框并重置状态
 * @global
 * @function closeAddGameModal
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function closeAddGameModal() {
  document.getElementById('add-game-modal').classList.remove('active');
  editingGameId = null;
  pendingGameData = null;
  document.querySelector('#add-game-modal .modal-header h3').textContent = '添加游戏';
}

/**
 * 选择游戏可执行文件
 * @global
 * @function selectGameExe
 * @async
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function selectGameExe() {
  const selectedPath = await ipcRenderer.invoke('select-file', [{ name: 'Executable/Batch', extensions: ['exe', 'bat'] }]);
  if (selectedPath) document.getElementById('game-exe-path').value = selectedPath;
}

/**
 * 选择游戏存档文件夹
 * @global
 * @function selectSaveFolder
 * @async
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function selectSaveFolder() {
  const selectedPath = await ipcRenderer.invoke('select-folder');
  if (selectedPath) document.getElementById('game-save-path').value = selectedPath;
}

/**
 * 确认添加或编辑游戏
 * @global
 * @function confirmAddGame
 * @async
 * @returns {Promise<void>}
 * @description 收集表单数据，根据 editingGameId 判断是新增还是更新，保存到主进程
 * @author EternoPax
 * @since 2026/2/28
 */
async function confirmAddGame() {
  const name = document.getElementById('game-name').value.trim();
  const type = document.getElementById('game-type').value;
  const exePath = document.getElementById('game-exe-path').value;
  const savePath = document.getElementById('game-save-path').value;
  const useLocale = document.getElementById('game-use-locale').checked;
  const autoTranslate = document.getElementById('game-auto-translate').checked;

  if (!name || !exePath) {
    alert('请填写游戏名称和程序文件');
    return;
  }

  if (editingGameId) {
    // 编辑模式：更新现有游戏
    const index = games.findIndex(g => g.id === editingGameId);
    if (index === -1) {
      alert('游戏不存在，请刷新重试');
      return;
    }
    const updatedGame = {
      ...games[index],
      name,
      type,
      exePath,
      savePath,
      folderPath: path.dirname(exePath),
      useLocale,
      autoTranslate
    };
    games[index] = updatedGame;
    const result = await ipcRenderer.invoke('save-games', games);
    if (result.success) {
      renderGames();
      closeAddGameModal();
    } else {
      alert('保存失败: ' + result.error);
    }
  } else {
    // 添加模式：创建新游戏
    const game = {
      name,
      type,
      exePath,
      savePath,
      folderPath: pendingGameData ? pendingGameData.folderPath : path.dirname(exePath),
      image: null,
      useLocale,
      autoTranslate
    };
    const result = await ipcRenderer.invoke('add-game', game);
    if (result.success) {
      games.push(result.game);
      renderGames();
      closeAddGameModal();
    } else {
      alert('添加失败: ' + result.error);
    }
  }
}

/**
 * 删除游戏（仅从库中移除，不删除文件）
 * @global
 * @function deleteGame
 * @async
 * @param {string} gameId - 要删除的游戏 ID
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function deleteGame(gameId) {
  if (!confirm('确定要删除这个游戏吗？')) return;
  const result = await ipcRenderer.invoke('delete-game', gameId);
  if (result.success) {
    games = games.filter(g => g.id !== gameId);
    renderGames();
  }
}

/**
 * 选择游戏封面图片
 * @global
 * @function selectGameImage
 * @async
 * @param {string} gameId - 游戏 ID
 * @returns {Promise<void>}
 * @description 打开图片选择对话框，复制图片到应用目录并更新游戏数据
 * @author EternoPax
 * @since 2026/2/28
 */
async function selectGameImage(gameId) {
  const selectedPath = await ipcRenderer.invoke('select-image');
  if (selectedPath) {
    const newPath = await ipcRenderer.invoke('copy-image', selectedPath, gameId);
    if (newPath) {
      const game = games.find(g => g.id === gameId);
      if (game) {
        game.image = newPath;
        await ipcRenderer.invoke('save-games', games);
        renderGames();
      }
    }
  }
}

/**
 * 打开游戏所在文件夹
 * @global
 * @function openGameFolder
 * @async
 * @param {string} gameId - 游戏 ID
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function openGameFolder(gameId) {
  const game = games.find(g => g.id === gameId);
  if (game) await ipcRenderer.invoke('open-folder', game.folderPath);
}

/**
 * 打开游戏存档文件夹
 * @global
 * @function openSaveFolder
 * @async
 * @param {string} gameId - 游戏 ID
 * @returns {Promise<void>}
 * @author EternoPax
 * @since 2026/2/28
 */
async function openSaveFolder(gameId) {
  const game = games.find(g => g.id === gameId);
  if (game && game.savePath) await ipcRenderer.invoke('open-folder', game.savePath);
  else alert('未设置存档文件夹');
}

/**
 * 启动游戏
 * @global
 * @function launchGame
 * @async
 * @param {string} gameId - 要启动的游戏 ID
 * @returns {Promise<void>}
 * @description 根据游戏配置决定是否先启动翻译工具，以及是否使用转区启动
 * @author EternoPax
 * @since 2026/2/28
 */
async function launchGame(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) return;

  if (game.type === 'galgame' && !settings.translatorTool) {
    alert('您尚未配置翻译工具路径，翻译功能将不可用。如需使用，请在设置中配置。');
  }

  if (game.type === 'galgame' && game.autoTranslate && settings.translatorTool) {
    const translateResult = await ipcRenderer.invoke('launch-program', {
      exePath: settings.translatorTool,
      useLocale: false,
      localeEmulatorPath: ''
    });
    if (!translateResult.success) {
      alert('启动翻译工具失败: ' + translateResult.error);
    }
    setTimeout(async () => {
      await launchGameInternal(game);
    }, 1000);
  } else {
    await launchGameInternal(game);
  }
}

/**
 * 内部游戏启动逻辑
 * @function launchGameInternal
 * @async
 * @param {Object} game - 游戏对象
 * @returns {Promise<void>}
 * @description 根据游戏类型和设置决定是否使用 Locale Emulator 启动
 * @author EternoPax
 * @since 2026/2/28
 */
async function launchGameInternal(game) {
  let useLocale = false;
  if (game.type === 'galgame') {
    if (game.useLocale !== undefined) {
      useLocale = game.useLocale;
    } else {
      useLocale = settings.defaultGalMode === 'locale';
    }
  }

  const result = await ipcRenderer.invoke('launch-program', {
    exePath: game.exePath,
    useLocale,
    localeEmulatorPath: settings.localeEmulator
  });

  if (!result.success) {
    alert('启动失败: ' + result.error);
  }
}

/**
 * 打开游戏编辑模态框
 * @global
 * @function editGame
 * @param {string} gameId - 要编辑的游戏 ID
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function editGame(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) return;

  editingGameId = gameId;
  pendingGameData = null;

  document.getElementById('game-name').value = game.name;
  document.getElementById('game-type').value = game.type;
  document.getElementById('game-exe-path').value = game.exePath;
  document.getElementById('game-save-path').value = game.savePath || '';
  document.getElementById('game-use-locale').checked = game.useLocale || false;
  document.getElementById('game-auto-translate').checked = game.autoTranslate || false;

  document.querySelector('#add-game-modal .modal-header h3').textContent = '编辑游戏';
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('galgame-options').style.display = game.type === 'galgame' ? 'block' : 'none';
}

// ==================== 攻略编辑器 ====================

/**
 * 打开攻略编辑器
 * @global
 * @function openGuide
 * @async
 * @param {string} gameId - 游戏 ID
 * @returns {Promise<void>}
 * @description 加载游戏的攻略数据，初始化节点编辑器
 * @author EternoPax
 * @since 2026/2/28
 */
async function openGuide(gameId) {
  currentGuideGameId = gameId;
  const savedGuide = await ipcRenderer.invoke('get-guide', gameId);
  
  if (savedGuide) {
    guideData = savedGuide;
  } else {
    guideData = { nodes: [], connections: [] };
  }
  
  initGuideEditor();
  document.getElementById('guide-modal').classList.add('active');
}

/**
 * 关闭攻略编辑器
 * @global
 * @function closeGuideModal
 * @returns {void}
 * @description 保存当前攻略数据并关闭模态框
 * @author EternoPax
 * @since 2026/2/28
 */
function closeGuideModal() {
  saveGuide();
  document.getElementById('guide-modal').classList.remove('active');
  currentGuideGameId = null;
  guideData = { nodes: [], connections: [] };
}

/**
 * 保存攻略数据
 * @function saveGuide
 * @async
 * @returns {Promise<void>}
 * @description 将当前攻略数据通过 IPC 保存到主进程
 * @author EternoPax
 * @since 2026/2/28
 */
async function saveGuide() {
  if (currentGuideGameId) {
    await ipcRenderer.invoke('save-guide', currentGuideGameId, guideData);
  }
}

/**
 * 初始化攻略编辑器界面
 * @function initGuideEditor
 * @returns {void}
 * @description 创建 SVG 画布和节点容器，渲染现有节点和连接
 * @author EternoPax
 * @since 2026/2/28
 */
function initGuideEditor() {
  const container = document.getElementById('guide-flow-container');
  container.innerHTML = '';
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'guide-svg';
  svg.className.baseVal = 'guide-svg';
  svg.setAttribute('width', '3000');
  svg.setAttribute('height', '3000');
  svg.innerHTML = `
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
      </marker>
    </defs>
    <g id="connections-group"></g>
    <path id="temp-connection" class="temp-connection" style="display: none;"></path>
  `;
  container.appendChild(svg);
  
  const nodesContainer = document.createElement('div');
  nodesContainer.id = 'nodes-container';
  nodesContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 3000px; height: 3000px; z-index: 2;';
  container.appendChild(nodesContainer);
  
  guideData.nodes.forEach(node => renderGuideNode(node));
  
  requestAnimationFrame(() => {
    renderGuideConnections();
  });
  
  container.addEventListener('mousemove', handleContainerMouseMove);
  container.addEventListener('mouseup', handleContainerMouseUp);
  container.addEventListener('click', (e) => {
    if (e.target === container || e.target === svg) {
      deselectAllNodes();
    }
  });
}

/**
 * 添加新节点到攻略
 * @global
 * @function addGuideNode
 * @param {string} type - 节点类型 ('single' | 'multi-in' | 'multi-out')
 * @returns {void}
 * @description 根据类型创建默认节点数据并渲染
 * @author EternoPax
 * @since 2026/2/28
 */
function addGuideNode(type) {
  const container = document.getElementById('guide-flow-container');
  const rect = container.getBoundingClientRect();
  
  const node = {
    id: 'node_' + Date.now(),
    type: type,
    title: type === 'single' ? '一入一出' : (type === 'multi-in' ? '多入一出' : '一入多出'),
    x: container.scrollLeft + rect.width / 2 - 80,
    y: container.scrollTop + rect.height / 2 - 50,
    inputs: type === 'single' ? ['入口'] : (type === 'multi-in' ? ['入口1', '入口2'] : ['入口']),
    outputs: type === 'single' ? ['出口'] : (type === 'multi-in' ? ['出口'] : ['出口1', '出口2'])
  };
  
  guideData.nodes.push(node);
  renderGuideNode(node);
  saveGuide();
}

/**
 * 渲染单个攻略节点
 * @function renderGuideNode
 * @param {Object} node - 节点数据对象
 * @param {string} node.id - 节点唯一标识
 * @param {string} node.type - 节点类型
 * @param {string} node.title - 节点标题
 * @param {number} node.x - X 坐标
 * @param {number} node.y - Y 坐标
 * @param {Array<string>} node.inputs - 输入端口标签数组
 * @param {Array<string>} node.outputs - 输出端口标签数组
 * @returns {void}
 * @description 创建节点的 DOM 元素，包括端口、编辑区域和事件绑定
 * @author EternoPax
 * @since 2026/2/28
 */
function renderGuideNode(node) {
  const container = document.getElementById('nodes-container');
  
  const nodeEl = document.createElement('div');
  nodeEl.id = node.id;
  nodeEl.className = 'flow-node';
  nodeEl.style.left = node.x + 'px';
  nodeEl.style.top = node.y + 'px';
  
  const typeLabel = {
    'single': '一入一出',
    'multi-in': '多入一出',
    'multi-out': '一入多出'
  }[node.type];
  
  const inputsHtml = node.inputs.map((input, i) => `
    <div class="port-row input-row" data-node="${node.id}">
      <div class="port-handle input" 
           data-node="${node.id}" data-port="${i}" data-type="input"
           onmousedown="startConnection(event, '${node.id}', ${i}, 'input')"></div>
      <div contenteditable="true" class="port-label-input"
           onblur="updatePortLabel('${node.id}', 'input', ${i}, this.textContent)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           onpaste="handlePaste(event)"
           onclick="event.stopPropagation()">${input}</div>
      ${node.type !== 'single' && i === node.inputs.length - 1 ? `
        <button class="port-add-btn" onclick="addPort('${node.id}', 'input')">+</button>
      ` : ''}
      ${node.inputs.length > 1 ? `
        <button class="port-remove-btn" onclick="removePort('${node.id}', 'input', ${i})">-</button>
      ` : ''}
    </div>
  `).join('');
  
  const outputsHtml = node.outputs.map((output, i) => `
    <div class="port-row output-row" data-node="${node.id}">
      <div contenteditable="true" class="port-label-input"
           onblur="updatePortLabel('${node.id}', 'output', ${i}, this.textContent)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           onpaste="handlePaste(event)"
           onclick="event.stopPropagation()">${output}</div>
      ${node.type !== 'single' && i === node.outputs.length - 1 ? `
        <button class="port-add-btn" onclick="addPort('${node.id}', 'output')">+</button>
      ` : ''}
      ${node.outputs.length > 1 ? `
        <button class="port-remove-btn" onclick="removePort('${node.id}', 'output', ${i})">-</button>
      ` : ''}
      <div class="port-handle output" 
           data-node="${node.id}" data-port="${i}" data-type="output"
           onmousedown="startConnection(event, '${node.id}', ${i}, 'output')"></div>
    </div>
  `).join('');
  
  // 删除按钮保持为 &times; 符号（不改成 SVG）
  nodeEl.innerHTML = `
    <div class="node-header" onmousedown="startNodeDrag(event, '${node.id}')">
      <span class="node-type-icon">${typeLabel}</span>
      <div contenteditable="true" class="node-title-input" 
           onblur="updateNodeTitle('${node.id}', this.textContent)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           onpaste="handlePaste(event)"
           onclick="event.stopPropagation()">${node.title}</div>
      <button class="node-delete-btn" onclick="deleteGuideNode('${node.id}')" title="删除节点">&times;</button>
    </div>
    <div class="node-ports-container">
      <div class="node-inputs">
        ${inputsHtml}
      </div>
      <div class="node-outputs">
        ${outputsHtml}
      </div>
    </div>
  `;
  
  container.appendChild(nodeEl);
  
  nodeEl.querySelectorAll('[contenteditable="true"]').forEach(el => {
    el.setAttribute('spellcheck', 'false');
  });
}

/**
 * 开始拖拽节点
 * @global
 * @function startNodeDrag
 * @param {MouseEvent} e - 鼠标事件对象
 * @param {string} nodeId - 节点 ID
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function startNodeDrag(e, nodeId) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.isContentEditable) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  selectedNode = node;
  isDraggingNode = true;
  
  const nodeEl = document.getElementById(nodeId);
  dragOffset.x = e.clientX - nodeEl.getBoundingClientRect().left;
  dragOffset.y = e.clientY - nodeEl.getBoundingClientRect().top;
  
  document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('selected'));
  nodeEl.classList.add('selected');
}

/**
 * 处理容器鼠标移动事件（拖拽节点或绘制连线）
 * @function handleContainerMouseMove
 * @param {MouseEvent} e - 鼠标事件对象
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function handleContainerMouseMove(e) {
  if (isDraggingNode && selectedNode) {
    const container = document.getElementById('guide-flow-container');
    const rect = container.getBoundingClientRect();
    
    const x = e.clientX - rect.left + container.scrollLeft - dragOffset.x;
    const y = e.clientY - rect.top + container.scrollTop - dragOffset.y;
    
    selectedNode.x = Math.max(0, x);
    selectedNode.y = Math.max(0, y);
    
    const nodeEl = document.getElementById(selectedNode.id);
    nodeEl.style.left = selectedNode.x + 'px';
    nodeEl.style.top = selectedNode.y + 'px';
    
    renderGuideConnections();
  }
  
  if (isConnecting && connectionStart) {
    updateTempConnection(e);
  }
}

/**
 * 处理容器鼠标释放事件
 * @function handleContainerMouseUp
 * @param {MouseEvent} e - 鼠标事件对象
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function handleContainerMouseUp(e) {
  if (isDraggingNode) {
    isDraggingNode = false;
    selectedNode = null;
    saveGuide();
  }
}

/**
 * 取消所有节点的选中状态
 * @function deselectAllNodes
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function deselectAllNodes() {
  document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('selected'));
}

/**
 * 更新节点标题
 * @global
 * @function updateNodeTitle
 * @param {string} nodeId - 节点 ID
 * @param {string} title - 新标题
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function updateNodeTitle(nodeId, title) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    node.title = title.trim();
    saveGuide();
  }
}

/**
 * 更新端口标签
 * @global
 * @function updatePortLabel
 * @param {string} nodeId - 节点 ID
 * @param {string} portType - 端口类型 ('input' | 'output')
 * @param {number} index - 端口索引
 * @param {string} label - 新标签文本
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function updatePortLabel(nodeId, portType, index, label) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    const trimmedLabel = label.trim();
    if (portType === 'input') {
      node.inputs[index] = trimmedLabel;
    } else {
      node.outputs[index] = trimmedLabel;
    }
    saveGuide();
  }
}

/**
 * 添加新端口到节点
 * @global
 * @function addPort
 * @param {string} nodeId - 节点 ID
 * @param {string} portType - 端口类型 ('input' | 'output')
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function addPort(nodeId, portType) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  if (portType === 'input') {
    node.inputs.push(`入口${node.inputs.length + 1}`);
  } else {
    node.outputs.push(`出口${node.outputs.length + 1}`);
  }
  
  const nodeEl = document.getElementById(nodeId);
  nodeEl.remove();
  renderGuideNode(node);
  renderGuideConnections();
  saveGuide();
}

/**
 * 移除节点的指定端口
 * @global
 * @function removePort
 * @param {string} nodeId - 节点 ID
 * @param {string} portType - 端口类型 ('input' | 'output')
 * @param {number} index - 要移除的端口索引
 * @returns {void}
 * @description 移除端口时同时清理相关的连接线
 * @author EternoPax
 * @since 2026/2/28
 */
function removePort(nodeId, portType, index) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  if (portType === 'input') {
    // 清理连接到该输入端口的连线，并调整索引大于当前端口连线的端口号
    guideData.connections = guideData.connections.filter(c => !(c.toNode === nodeId && c.toPort === index));
    guideData.connections.forEach(c => {
      if (c.toNode === nodeId && c.toPort > index) {
        c.toPort--;
      }
    });
    node.inputs.splice(index, 1);
  } else {
    // 清理从该输出端口出发的连线，并调整索引大于当前端口连线的端口号
    guideData.connections = guideData.connections.filter(c => !(c.fromNode === nodeId && c.fromPort === index));
    guideData.connections.forEach(c => {
      if (c.fromNode === nodeId && c.fromPort > index) {
        c.fromPort--;
      }
    });
    node.outputs.splice(index, 1);
  }
  
  const nodeEl = document.getElementById(nodeId);
  nodeEl.remove();
  renderGuideNode(node);
  renderGuideConnections();
  saveGuide();
}

/**
 * 删除攻略节点
 * @global
 * @function deleteGuideNode
 * @param {string} nodeId - 要删除的节点 ID
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function deleteGuideNode(nodeId) {
  if (!confirm('确定要删除这个节点吗？')) return;
  
  guideData.nodes = guideData.nodes.filter(n => n.id !== nodeId);
  guideData.connections = guideData.connections.filter(
    c => c.fromNode !== nodeId && c.toNode !== nodeId
  );
  
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) nodeEl.remove();
  
  renderGuideConnections();
  saveGuide();
}

// ==================== 连接线系统 ====================

/**
 * 开始绘制连接线
 * @global
 * @function startConnection
 * @param {MouseEvent} e - 鼠标事件对象
 * @param {string} nodeId - 起始节点 ID
 * @param {number} portIndex - 起始端口索引
 * @param {string} portType - 端口类型 ('input' | 'output')
 * @returns {void}
 * @description 只有输出端口可以开始连线
 * @author EternoPax
 * @since 2026/2/28
 */
function startConnection(e, nodeId, portIndex, portType) {
  e.preventDefault();
  e.stopPropagation();
  
  if (portType === 'output') {
    isConnecting = true;
    connectionStart = { nodeId, portIndex };
    
    const tempPath = document.getElementById('temp-connection');
    tempPath.style.display = 'block';
    updateTempConnection(e);
  }
}

/**
 * 更新临时连接线位置
 * @function updateTempConnection
 * @param {MouseEvent} e - 鼠标事件对象
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function updateTempConnection(e) {
  if (!connectionStart) return;
  
  const container = document.getElementById('guide-flow-container');
  const fromNode = document.getElementById(connectionStart.nodeId);
  if (!fromNode) return;
  
  const fromHandle = fromNode.querySelector(`.port-handle.output[data-port="${connectionStart.portIndex}"]`);
  if (!fromHandle) return;
  
  const fromRect = fromHandle.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  
  const x1 = fromRect.left - containerRect.left + container.scrollLeft + fromRect.width / 2;
  const y1 = fromRect.top - containerRect.top + container.scrollTop + fromRect.height / 2;
  const x2 = e.clientX - containerRect.left + container.scrollLeft;
  const y2 = e.clientY - containerRect.top + container.scrollTop;
  
  const tempPath = document.getElementById('temp-connection');
  tempPath.setAttribute('d', createBezierPath(x1, y1, x2, y2));
}

/**
 * 创建贝塞尔曲线路径字符串
 * @function createBezierPath
 * @param {number} x1 - 起点 X
 * @param {number} y1 - 起点 Y
 * @param {number} x2 - 终点 X
 * @param {number} y2 - 终点 Y
 * @returns {string} SVG 路径 d 属性值
 * @author EternoPax
 * @since 2026/2/28
 */
function createBezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// 全局鼠标释放事件监听（用于完成连线）
document.addEventListener('mouseup', (e) => {
  if (isConnecting && connectionStart) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.classList.contains('port-handle') && target.dataset.type === 'input') {
      const toNodeId = target.dataset.node;
      const toPortIndex = parseInt(target.dataset.port);
      
      if (toNodeId !== connectionStart.nodeId) {
        const connection = {
          fromNode: connectionStart.nodeId,
          fromPort: connectionStart.portIndex,
          toNode: toNodeId,
          toPort: toPortIndex
        };
        
        // 检查是否已存在相同连接
        const exists = guideData.connections.some(c => 
          c.fromNode === connection.fromNode && 
          c.fromPort === connection.fromPort &&
          c.toNode === connection.toNode &&
          c.toPort === connection.toPort
        );
        
        if (!exists) {
          guideData.connections.push(connection);
          renderGuideConnections();
          saveGuide();
        }
      }
    }
    
    isConnecting = false;
    connectionStart = null;
    const tempPath = document.getElementById('temp-connection');
    if (tempPath) tempPath.style.display = 'none';
  }
});

/**
 * 渲染所有连接线
 * @function renderGuideConnections
 * @returns {void}
 * @description 根据 guideData.connections 重新绘制 SVG 路径
 * @author EternoPax
 * @since 2026/2/28
 */
function renderGuideConnections() {
  const group = document.getElementById('connections-group');
  if (!group) return;
  
  group.innerHTML = '';
  
  const container = document.getElementById('guide-flow-container');
  const containerRect = container.getBoundingClientRect();
  
  guideData.connections.forEach((conn, index) => {
    const fromNode = document.getElementById(conn.fromNode);
    const toNode = document.getElementById(conn.toNode);
    
    if (!fromNode || !toNode) return;
    
    const fromHandle = fromNode.querySelector(`.port-handle.output[data-port="${conn.fromPort}"]`);
    const toHandle = toNode.querySelector(`.port-handle.input[data-port="${conn.toPort}"]`);
    
    if (!fromHandle || !toHandle) return;
    
    const fromRect = fromHandle.getBoundingClientRect();
    const toRect = toHandle.getBoundingClientRect();
    
    const x1 = fromRect.left - containerRect.left + container.scrollLeft + fromRect.width / 2;
    const y1 = fromRect.top - containerRect.top + container.scrollTop + fromRect.height / 2;
    const x2 = toRect.left - containerRect.left + container.scrollLeft + toRect.width / 2;
    const y2 = toRect.top - containerRect.top + container.scrollTop + toRect.height / 2;
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection-path');
    path.setAttribute('d', createBezierPath(x1, y1, x2, y2));
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.addEventListener('dblclick', () => deleteConnection(index));
    
    group.appendChild(path);
  });
}

/**
 * 删除指定索引的连接线
 * @function deleteConnection
 * @param {number} index - 连接线在数组中的索引
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function deleteConnection(index) {
  if (!confirm('删除这条连接线？')) return;
  guideData.connections.splice(index, 1);
  renderGuideConnections();
  saveGuide();
}

/**
 * 清空所有攻略节点
 * @global
 * @function clearGuide
 * @returns {void}
 * @author EternoPax
 * @since 2026/2/28
 */
function clearGuide() {
  if (!confirm('确定要清空所有节点吗？')) return;
  
  guideData.nodes = [];
  guideData.connections = [];
  
  const container = document.getElementById('nodes-container');
  if (container) container.innerHTML = '';
  
  renderGuideConnections();
  saveGuide();
}

// ==================== 导入导出攻略 ====================

/**
 * 导出攻略到文件
 * @global
 * @function exportGuide
 * @async
 * @returns {Promise<void>}
 * @description 将当前攻略数据导出为 .gwalk 文件（JSON 格式）
 * @author EternoPax
 * @since 2026/2/28
 */
window.exportGuide = async function() {
  if (!currentGuideGameId) {
    alert('没有正在编辑的攻略');
    return;
  }

  const game = games.find(g => g.id === currentGuideGameId);
  const defaultName = game ? `${game.name}_攻略.gwalk` : 'guide.gwalk';

  const content = JSON.stringify(guideData, null, 2);

  const result = await ipcRenderer.invoke('save-file', {
    defaultPath: defaultName,
    content: content
  });

  if (result.success) {
    alert(`攻略已导出到：${result.filePath}`);
  } else if (!result.canceled) {
    alert('导出失败：' + result.error);
  }
};

/**
 * 从文件导入攻略
 * @global
 * @function importGuide
 * @async
 * @returns {Promise<void>}
 * @description 读取 .gwalk 或 .json 文件并加载到编辑器
 * @author EternoPax
 * @since 2026/2/28
 */
window.importGuide = async function() {
  if (!currentGuideGameId) {
    alert('没有正在编辑的攻略');
    return;
  }

  const filePath = await ipcRenderer.invoke('select-file', [{ name: '攻略文件', extensions: ['gwalk', 'json'] }]);
  if (!filePath) return;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const importedData = JSON.parse(content);

    if (!importedData || typeof importedData !== 'object' ||
        !Array.isArray(importedData.nodes) || !Array.isArray(importedData.connections)) {
      alert('无效的攻略文件：缺少 nodes 或 connections 数组');
      return;
    }

    guideData = importedData;
    initGuideEditor();
    await saveGuide();
    alert('攻略导入成功');
  } catch (error) {
    alert('导入失败：' + error.message);
  }
};

// ==================== 打包与删除功能 ====================

/**
 * 打包游戏文件
 * @global
 * @function packGame
 * @async
 * @param {string} gameId - 要打包的游戏 ID
 * @returns {Promise<void>}
 * @description 将游戏文件夹和存档打包为压缩文件，显示进度模态框
 * @author EternoPax
 * @since 2026/2/28
 */
async function packGame(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) { alert('游戏不存在'); return; }
  if (!confirm(`确定要打包游戏"${game.name}"吗？\n将包含游戏文件夹和存档文件夹。`)) return;
  const modal = document.getElementById('pack-progress-modal');
  modal.classList.add('active');
  document.getElementById('pack-progress-fill').style.width = '0%';
  document.getElementById('pack-progress-status').textContent = '正在计算文件大小...';
  try {
    const result = await ipcRenderer.invoke('pack-game', gameId);
    if (result.success) alert(`打包成功！\n文件已保存到：${result.filePath}`);
    else alert('打包失败：' + result.error);
  } catch (error) {
    alert('打包出错：' + error.message);
  } finally {
    modal.classList.remove('active');
  }
}

/**
 * 永久删除游戏源文件
 * @global
 * @function deleteSourceFiles
 * @async
 * @param {string} gameId - 要删除的游戏 ID
 * @returns {Promise<void>}
 * @description 删除游戏文件夹和存档文件夹（不可恢复），需要两次确认
 * @author EternoPax
 * @since 2026/2/28
 */
async function deleteSourceFiles(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) { alert('游戏不存在'); return; }
  let message = `确定要永久删除以下文件夹吗？\n此操作不可恢复！\n\n游戏文件夹：${game.folderPath}`;
  if (game.savePath && game.savePath !== game.folderPath) message += `\n存档文件夹：${game.savePath}`;
  if (!confirm(message)) return;
  if (!confirm('再次确认：删除后将无法恢复，确定继续？')) return;
  const result = await ipcRenderer.invoke('delete-source-files', gameId);
  if (result.success) {
    alert('源文件删除成功！');
    await loadGames();
  } else {
    alert('删除失败：' + result.error);
  }
}

// ==================== 辅助函数 ====================

/**
 * 处理粘贴事件（纯文本粘贴）
 * @function handlePaste
 * @param {ClipboardEvent} e - 剪贴板事件对象
 * @returns {void}
 * @description 阻止默认粘贴行为，仅粘贴纯文本内容
 * @author EternoPax
 * @since 2026/2/28
 */
function handlePaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

// ==================== 全局函数暴露 ====================

/**
 * 将函数暴露到全局作用域，供 HTML 内联事件调用
 * @namespace window
 * @author EternoPax
 * @since 2026/2/28
 */

// 文件操作
window.deleteSourceFiles = deleteSourceFiles;
window.packGame = packGame;

// 工具启动
window.launchTranslator = launchTranslator;
window.launchMtool = launchMtool;

// 攻略编辑
window.openGuide = openGuide;
window.closeGuideModal = closeGuideModal;
window.addGuideNode = addGuideNode;
window.clearGuide = clearGuide;
window.exportGuide = exportGuide;
window.importGuide = importGuide;
window.deleteGuideNode = deleteGuideNode;
window.addPort = addPort;
window.removePort = removePort;
window.updatePortLabel = updatePortLabel;
window.updateNodeTitle = updateNodeTitle;
window.startConnection = startConnection;
window.startNodeDrag = startNodeDrag;

// 游戏管理
window.closeAddGameModal = closeAddGameModal;
window.confirmAddGame = confirmAddGame;
window.selectGameExe = selectGameExe;
window.selectSaveFolder = selectSaveFolder;
window.selectTranslatorTool = selectTranslatorTool;
window.selectMtoolPath = selectMtoolPath;
window.selectLocaleEmulator = selectLocaleEmulator;
window.saveSettings = saveSettings;
window.openGameFolder = openGameFolder;
window.openSaveFolder = openSaveFolder;
window.launchGame = launchGame;
window.editGame = editGame;
window.deleteGame = deleteGame;
window.selectGameImage = selectGameImage;