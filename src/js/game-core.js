/**
 * @file game-core.js
 * @module game-core
 * @description 游戏管理核心模块：负责游戏列表的加载与渲染（卡片/空态/搜索空态）、
 *              启动/删除/封面/打开文件夹/编辑游戏、搜索筛选 UI、运行状态订阅刷新，
 *              并对外暴露 window.* 供 HTML 内联事件调用。
 * @author EternoPax
 * @since 2026/8/28
 */
// game-core.js
// 游戏管理核心：加载/渲染游戏卡片、启动、删除、封面、打开文件夹、编辑
(function () {
  const store = window.GMStore;
  const state = store.state;
  const api = window.gameAPI;
  const svgs = window.GMIcons.svgs;

  // 待执行的删除任务（撤销模式）：gameId -> { timeoutId }
  const pendingDeletions = new Map();

  // ==================== 搜索 / 筛选（UI 派生状态，不污染 state.games 原始数据） ====================
  const SEARCH_DEBOUNCE_MS = 300;
  const SEARCH_HISTORY_LIMIT = 20;
  const SEARCH_TYPE_OPTIONS = ['all', 'galgame', 'rpg', 'unity'];
  let searchQuery = '';
  let filterType = 'all';
  let searchDebounceTimer = null;

  // 读取上次保存的搜索状态（搜索词 / 类型筛选 / 历史记录），旧版本数据缺失时回退默认值
  function getSearchState() {
    const saved = state.settings.searchState || {};
    return {
      query: typeof saved.query === 'string' ? saved.query : '',
      filterType: SEARCH_TYPE_OPTIONS.includes(saved.filterType) ? saved.filterType : 'all',
      history: Array.isArray(saved.history) ? saved.history.slice(0, SEARCH_HISTORY_LIMIT) : []
    };
  }

  // 持久化搜索状态到 settings.json（尽力而为：失败等特殊情况静默忽略，不打断使用）
  function persistSearchState(query, type, history) {
    state.settings.searchState = { query, filterType: type, history };
    api.invoke('save-settings', state.settings).catch(() => {});
  }

  // 将历史关键词渲染到 datalist（原生下拉建议，DOM 创建避免引号/注入问题）
  function renderHistoryDatalist(history) {
    const datalist = document.getElementById('search-history-list');
    if (!datalist) return;
    datalist.innerHTML = '';
    history.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item;
      datalist.appendChild(opt);
    });
  }

  // 搜索空态放大镜图标（stroke 继承 .empty-state-icon 的 currentColor 风格）
  const SEARCH_EMPTY_ICON =
    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>';

  // 纯函数：从原始数据池派生可见列表（忽略大小写 + 名称模糊匹配 + 类型过滤）
  function getFilteredGames() {
    const q = searchQuery.trim().toLowerCase();
    return state.games.filter(game => {
      const nameMatch = !q || (game.name || '').toLowerCase().includes(q);
      const typeMatch = filterType === 'all' || game.type === filterType;
      return nameMatch && typeMatch;
    });
  }

  // 搜索无结果时的上下文空态文案
  function getEmptySearchText() {
    if (searchQuery.trim()) {
      return `未找到与 "${searchQuery.trim()}" 匹配的游戏`;
    }
    if (filterType !== 'all') {
      return `暂无"${getTypeLabel(filterType)}"类型的游戏`;
    }
    return '暂无游戏';
  }

  async function loadGames() {
    const newGames = await api.invoke('get-games');
    store.setGames(newGames);
    // 首次加载一并同步运行状态：重新拉取当前运行中的游戏 id（含重启恢复的进程扫描结果）
    const runningIds = await api.invoke('get-running-games');
    store.setRunningBatch(runningIds);
  }

  function getTypeLabel(type) {
    const labels = { galgame: 'Galgame', rpg: 'RPG', unity: 'Unity' };
    return labels[type] || type;
  }

  // 更新运行状态并重渲染卡片（state.runningGames 为 Set，驱动徽标与启动按钮禁用态）
  function updateGameStatus(gameId, running) {
    store.setRunning(gameId, !!running);
  }

  // 监听主进程 game-status 推送，实时刷新运行状态（含转区/bat 的进程扫描反馈）
  function setupGameStatus() {
    api.on('game-status', (data) => {
      if (data && data.gameId !== undefined) {
        updateGameStatus(data.gameId, !!data.running);
      }
    });
  }

  function renderGames() {
    const grid = document.getElementById('games-grid');
    if (state.games.length === 0) {
      grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">${svgs.empty}</div>
        <p class="empty-state-text">暂无游戏，点击"添加游戏"或拖拽 exe/bat 文件添加</p>
      </div>
    `;
      return;
    }

    // 只遍历派生视图，原始数据池 state.games 永不被搜索/筛选污染
    const filtered = getFilteredGames();
    if (filtered.length === 0) {
      // 带搜索词上下文的空状态：明确告知“数据还在，只是没搜到”
      grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${SEARCH_EMPTY_ICON}</div>
        <p class="empty-state-text">${getEmptySearchText()}</p>
        <p class="empty-state-hint">试试调整关键词或筛选类型</p>
      </div>
    `;
      return;
    }

    grid.innerHTML = filtered.map(game => {
      const isRunning = state.runningGames.has(game.id);
      const configIcons = [];
      if (game.type === 'galgame') {
        if (game.useLocale) configIcons.push(`
        <span class="status-icon icon-locale" title="使用转区启动">${svgs.locale}</span>
      `);
        if (game.autoTranslate && state.settings.translatorTool) configIcons.push(`
        <span class="status-icon icon-translate" title="自动启动翻译">${svgs.translate}</span>
      `);
      }
      const iconsHtml = configIcons.length ? `<div class="game-config-icons">${configIcons.join(' ')}</div>` : '';

      return `
    <div class="game-card ${game.type}${isRunning ? ' is-running' : ''}" data-id="${game.id}">
      <div class="game-type-header">${getTypeLabel(game.type)}</div>
      <div class="game-image" onclick="window.selectGameImage('${game.id}')">
        ${game.image ? `<img src="file://${game.image}" alt="${game.name}">` : '点击添加图片'}
      </div>
      <div class="game-info">
        <div class="game-name"><span class="game-title">${game.name}</span>${isRunning ? '<span class="running-badge">● 运行中</span>' : ''}</div>
        ${iconsHtml}
        <div class="game-actions">
          <button class="btn btn-small btn-secondary" onclick="window.openGameFolder('${game.id}')">打开文件夹</button>
          <button class="btn btn-small btn-secondary" onclick="window.openSaveFolder('${game.id}')">存档</button>
        </div>
        <div class="game-actions-row">
          ${isRunning
            ? '<button class="btn btn-small btn-primary is-running" disabled>运行中</button>'
            : `<button class="btn btn-small btn-primary" onclick="window.launchGame('${game.id}')">启动</button>`}
          <button class="btn btn-small btn-secondary" onclick="window.openGuide('${game.id}')">攻略</button>
          <button class="btn btn-small btn-secondary" onclick="window.packGame('${game.id}')">打包</button>
          <button class="btn btn-small btn-danger" data-arm="deleteSourceFiles" data-id="${game.id}" data-ready-label="松开永久删除">删源</button>
          <button class="btn btn-small btn-secondary" onclick="window.editGame('${game.id}')">编辑</button>
          <button class="btn btn-small btn-danger" data-arm="deleteGame" data-id="${game.id}" data-ready-label="松开确认删除">删除</button>
        </div>
      </div>
    </div>
  `}).join('');
  }

  async function launchGameInternal(game) {
    let useLocale = false;
    if (game.type === 'galgame') {
      if (game.useLocale !== undefined) {
        useLocale = game.useLocale;
      } else {
        useLocale = state.settings.defaultGalMode === 'locale';
      }
    }

    const result = await api.invoke('launch-program', {
      exePath: game.exePath,
      useLocale,
      localeEmulatorPath: state.settings.localeEmulator,
      gameId: game.id
    });

    if (!result.success) {
      window.showToast('启动失败：' + result.error, 'error');
    } else {
      // 启动成功：广播“已游玩”事件，供最近游玩侧边栏订阅更新（LRU）
      window.GMStore.emit('game-launched', game.id);
    }
  }

  /**
   * 启动指定游戏。
   * @param {string} gameId - 目标游戏 id
   * @returns {Promise<void>}
   * @throws 无（失败时通过 Toast 提示）
   */
  async function launchGame(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (!game) return;

    // 运行中防重复启动
    if (state.runningGames.has(gameId)) {
      window.showToast('该游戏已处于运行中', 'warning', { duration: 3000 });
      return;
    }

    if (game.type === 'galgame' && !state.settings.translatorTool) {
      window.showToast('您尚未配置翻译工具路径，翻译功能将不可用。如需使用，请在设置中配置。', 'warning', { duration: 5000 });
    }

    if (game.type === 'galgame' && game.autoTranslate && state.settings.translatorTool) {
      const translateResult = await api.invoke('launch-program', {
        exePath: state.settings.translatorTool,
        useLocale: false,
        localeEmulatorPath: ''
      });
      if (!translateResult.success) {
        window.showToast('启动翻译工具失败：' + translateResult.error, 'error');
      }
      setTimeout(async () => {
        await launchGameInternal(game);
      }, 1000);
    } else {
      await launchGameInternal(game);
    }
  }

  function deleteGame(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (!game) return;

    // 同一游戏已有待执行删除时，先取消旧任务，避免重复定时器
    const prev = pendingDeletions.get(gameId);
    if (prev) {
      clearTimeout(prev.timeoutId);
      pendingDeletions.delete(gameId);
    }

    const pending = { timeoutId: null };
    pendingDeletions.set(gameId, pending);

    const cancel = () => {
      clearTimeout(pending.timeoutId);
      if (pendingDeletions.get(gameId) === pending) pendingDeletions.delete(gameId);
    };

    window.showToast(`正在准备删除"${game.name}"，5 秒内可撤销`, 'warning', {
      duration: 5000,
      action: {
        label: '撤销',
        callback: () => {
          cancel();
          window.showToast('已取消删除', 'success', { duration: 2000 });
        }
      },
      onDismiss: (isManual) => {
        if (isManual) cancel(); // 手动关闭视为取消
      }
    });

    pending.timeoutId = setTimeout(async () => {
      const result = await api.invoke('delete-game', gameId);
      if (result && result.success) {
        window.showToast('游戏已删除', 'success', { duration: 2500 });
        store.setGames(state.games.filter(g => g.id !== gameId));
      } else {
        window.showToast((result && result.error) || '删除失败', 'error');
      }
      if (pendingDeletions.get(gameId) === pending) pendingDeletions.delete(gameId);
    }, 5000);
  }

  async function selectGameImage(gameId) {
    const selectedPath = await api.invoke('select-image');
    if (selectedPath) {
      const newPath = await api.invoke('copy-image', selectedPath, gameId);
      if (newPath) {
        const game = state.games.find(g => g.id === gameId);
        if (game) {
          game.image = newPath;
          await api.invoke('save-games', state.games);
          store.setGames(state.games);
        }
      }
    }
  }

  async function openGameFolder(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (game) await api.invoke('open-folder', game.folderPath);
  }

  async function openSaveFolder(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (game && game.savePath) await api.invoke('open-folder', game.savePath);
    else window.showToast('未设置存档文件夹', 'warning', { duration: 3000 });
  }

  function editGame(gameId) {
    const game = state.games.find(g => g.id === gameId);
    if (!game) return;

    state.editingGameId = gameId;
    state.pendingGameData = null;

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

  // 搜索/筛选交互初始化：防抖输入、清空按钮、类型筛选、快捷键、状态持久化与恢复
  function setupGameSearch() {
    const input = document.getElementById('game-search-input');
    const clearBtn = document.getElementById('game-search-clear');
    const filterSelect = document.getElementById('game-type-filter');
    if (!input || !clearBtn || !filterSelect) return;

    // 启动恢复：还原上次保存的搜索词、类型筛选与历史记录
    const saved = getSearchState();
    searchQuery = saved.query;
    filterType = saved.filterType;
    input.value = saved.query;
    clearBtn.style.display = saved.query ? 'inline-flex' : 'none';
    filterSelect.value = saved.filterType;
    renderHistoryDatalist(saved.history);

    // 输入防抖：停止敲击 300ms 后才执行搜索，敲击过程中卡片网格纹丝不动
    input.addEventListener('input', () => {
      clearBtn.style.display = input.value ? 'inline-flex' : 'none';
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        searchQuery = input.value;
        renderGames();
        persistSearchState(searchQuery, filterType, getSearchState().history);
      }, SEARCH_DEBOUNCE_MS);
    });

    // 清空按钮：清空文本、重置列表并收回焦点
    clearBtn.addEventListener('click', () => {
      input.value = '';
      searchQuery = '';
      clearTimeout(searchDebounceTimer);
      clearBtn.style.display = 'none';
      renderGames();
      persistSearchState('', filterType, getSearchState().history);
      input.blur();
    });

    // 类型筛选：点击操作，即时响应（无防抖）
    filterSelect.addEventListener('change', () => {
      filterType = filterSelect.value;
      renderGames();
      persistSearchState(searchQuery, filterType, getSearchState().history);
    });

    // 搜索完成（输入框失焦）时记录历史关键词：去重、最近优先、上限 20 条
    input.addEventListener('blur', () => {
      const q = input.value.trim();
      if (!q) return;
      const cur = getSearchState();
      const history = cur.history.filter((h) => h !== q);
      history.unshift(q);
      if (history.length > SEARCH_HISTORY_LIMIT) history.length = SEARCH_HISTORY_LIMIT;
      state.settings.searchState = { query: searchQuery, filterType, history };
      renderHistoryDatalist(history);
      api.invoke('save-settings', state.settings).catch(() => {});
    });

    // 快捷键：Ctrl/Cmd+F 聚焦并全选；搜索框聚焦时 Esc 清空并退出
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        input.focus();
        input.select();
        return;
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.value = '';
        searchQuery = '';
        clearTimeout(searchDebounceTimer);
        clearBtn.style.display = 'none';
        renderGames();
        persistSearchState('', filterType, getSearchState().history);
        input.blur();
      }
    });

    // 按已恢复的条件渲染一次（搜索结果列表随之还原）
    renderGames();
  }

  // 订阅数据域变更，自动重渲染（打破“改数据忘刷新”死锁）
  store.on('games', renderGames);
  store.on('settings', renderGames);
  store.on('runningGames', renderGames);

  window.loadGames = loadGames;
  window.renderGames = renderGames;
  window.getTypeLabel = getTypeLabel;
  window.setupGameSearch = setupGameSearch;
  window.setupGameStatus = setupGameStatus;
  window.launchGame = launchGame;
  window.deleteGame = deleteGame;
  window.selectGameImage = selectGameImage;
  window.openGameFolder = openGameFolder;
  window.openSaveFolder = openSaveFolder;
  window.editGame = editGame;

  // 防误触：对“删源 / 删除”按钮绑定长按蓄力确认（事件委托到游戏网格）
  const gamesGrid = document.getElementById('games-grid');
  if (gamesGrid && typeof window.setupArmConfirm === 'function') window.setupArmConfirm(gamesGrid);
})();
