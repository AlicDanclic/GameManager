/**
 * @fileoverview 快速启动侧边栏模块
 * @description 记录最近启动的游戏（LRU 变种），存于 localStorage，供侧边栏一键再启动。
 *              - 存储：localStorage 里只存 gameId 数组（按时间倒序，数组首位=最近启动）
 *              - 淘汰：LRU 变种 —— 已存在则提前到首位；未存在且已满(MAX)则剔除最后一个
 *              - 状态绑定：不为点击侧边栏项更新记录，而是订阅"启动成功"钩子
 *                （由 game-core.js 在启动成功后调用 FastLaunch.touch 异步刷新）
 * @module fast-launch
 * @author EternoPax
 * @since 2026/8/28
 */

(function () {
  /** @constant {string} localStorage 键名 */
  const STORAGE_KEY = 'gmFastLaunchIds';

  /** @constant {number} 快速启动列表上限 */
  const MAX_ITEMS = 5;

  /**
   * 从 localStorage 读取 gameId 数组（容错：损坏数据回退为空数组）
   * @returns {string[]}
   */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(id => typeof id === 'string') : [];
    } catch (error) {
      return [];
    }
  }

  /**
   * 写入 localStorage（尽力而为，失败静默）
   * @param {string[]} ids
   */
  function save(ids) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (error) {
      // localStorage 不可用或配额满时静默忽略，不影响启动
    }
  }

  /**
   * LRU 变种更新：最近使用的游戏提前到首位，超上限剔除最后一个。
   * @param {string} gameId - 刚成功启动的游戏 id
   */
  function touch(gameId) {
    if (!gameId) return;
    let ids = load();
    ids = ids.filter(id => id !== gameId); // 已在列表则先移除（稍后前插）
    ids.unshift(gameId);                   // 提前到第一位（最近启动）
    if (ids.length > MAX_ITEMS) {          // 已满则剔除最后一个
      ids.length = MAX_ITEMS;
    }
    save(ids);
    render();
  }

  /**
   * 渲染侧边栏：结合 games 数据把 id 映射为游戏项，过滤已删除的无效 id，
   * 并根据运行状态显示"运行中"标记。无有效记录时隐藏整个区块。
   */
  function render() {
    const blockEl = document.getElementById('fast-launch');
    const listEl = document.getElementById('fast-launch-list');
    if (!blockEl || !listEl) return;

    const games = (window.GMState && Array.isArray(window.GMState.games)) ? window.GMState.games : [];
    const running = window.GMState && window.GMState.runningGames;
    const ids = load();

    // 过滤无效 id（游戏已被删除），并顺带把干净后的列表写回 localStorage（自愈）
    const validIds = [];
    ids.forEach(id => {
      if (games.some(g => g.id === id)) validIds.push(id);
    });
    if (validIds.length !== ids.length) save(validIds);

    if (validIds.length === 0) {
      blockEl.style.display = 'none';
      listEl.innerHTML = '';
      return;
    }

    blockEl.style.display = 'flex';
    listEl.innerHTML = validIds.map(id => {
      const game = games.find(g => g.id === id);
      const isRunning = !!(running && running.has(id));
      return `
    <li class="fast-launch-item${isRunning ? ' is-running' : ''}" data-id="${game.id}" title="${game.name}">
      <span class="fast-launch-dot ${game.type}"></span>
      <span class="fast-launch-name">${game.name}</span>
      ${isRunning ? '<span class="fast-launch-running">运行中</span>' : ''}
    </li>`;
    }).join('');
  }

  /**
   * 初始化：首次渲染 + 绑定侧边栏项点击。
   * 点击仅负责启动游戏（走 window.launchGame，含运行中判重），
   * 不在此处更新记录 —— 记录更新由 game-core.js 的启动成功钩子统一完成。
   */
  function init() {
    render();
    const listEl = document.getElementById('fast-launch-list');
    if (!listEl) return;
    listEl.addEventListener('click', (e) => {
      const li = e.target.closest('.fast-launch-item');
      if (!li) return;
      const id = li.dataset.id;
      if (id && typeof window.launchGame === 'function') {
        window.launchGame(id);
      }
    });
  }

  window.FastLaunch = { touch, render, init };
})();
