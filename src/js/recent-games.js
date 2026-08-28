/**
 * @file recent-games.js
 * @module recent-games
 * @description 最近游玩（侧边栏）模块：gameId 数组（最新在前，按时间戳倒序），LRU 变种淘汰
 *              （最多 5 个），随设置持久化到主进程 settings.json（与 games/settings 同层，重启保留）。
 *              只订阅“启动成功”动作钩子（GMStore 'game-launched'）异步更新，渲染时结合 games
 *              数据过滤已删除游戏，点击即重启该游戏。
 * @author EternoPax
 * @since 2026/8/28
 */
// recent-games.js
// 最近游玩（侧边栏）：gameId 数组存于 settings.json（最新在前，按时间戳倒序），LRU 变种淘汰（最多 5 个）。
// 只订阅“启动成功”动作钩子（GMStore 'game-launched'）异步更新，而不是点击侧边栏时更新；
// 渲染时结合 games 数据：过滤已被删除的游戏，显示名称，点击即重启该游戏。
(function () {
  const MAX = 5;
  const store = window.GMStore;
  const state = store.state;
  const api = window.gameAPI;
  let container = null;

  function dbg(...args) { if (window.GM_DEBUG) console.log('[recent-games]', ...args); }

  // 从已持久化的 settings（state.settings.recentGames）读取最近游玩 id 列表
  function read() {
    const arr = state.settings.recentGames;
    return Array.isArray(arr) ? arr.filter(id => typeof id === 'string') : [];
  }

  // 写入最近游玩 id 列表：合并进 settings 并调用主进程持久化到 settings.json（重启保留）
  function write(list) {
    store.setSettings({ recentGames: list });
    api.invoke('save-settings', state.settings).catch(() => {});
  }

  /**
   * LRU 变种记录：已存在则提前到首位；不存在且已满则剔除最后一位；新项插入首位。
   * @param {string} gameId - 最近启动的游戏 id
   */
  // LRU 变种：已存在则提前到首位；不存在且已满则剔除最后一位；新项插入首位
  function pushRecent(gameId) {
    let list = read().filter(id => id !== gameId);
    list.unshift(gameId);
    if (list.length > MAX) list.length = MAX; // 剔除尾部
    write(list);
    render();
  }

  function render() {
    if (!container) return;
    const recentIds = read();
    const valid = recentIds.filter(id => state.games.some(g => g.id === id));
    if (valid.length !== recentIds.length) write(valid); // 清理已删除游戏的 id
    container.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'recent-games-title';
    title.textContent = '最近游玩';
    container.appendChild(title);

    if (valid.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'recent-games-empty';
      empty.textContent = '暂无最近游玩';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'recent-games-list';
    valid.forEach(id => {
      const game = state.games.find(g => g.id === id);
      if (!game) return;
      const li = document.createElement('li');
      li.className = 'recent-games-item';
      li.textContent = game.name || id;
      li.title = '点击启动：' + (game.name || id);
      // 点击只负责重新启动，不在此处更新"最近游玩"（更新由启动成功钩子完成）
      li.addEventListener('click', () => {
        if (typeof window.launchGame === 'function') window.launchGame(id);
      });
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  function ensureContainer() {
    if (container) return;
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    container = document.createElement('div');
    container.className = 'recent-games';
    sidebar.appendChild(container);
  }

  function init() {
    ensureContainer();
    render();
    // 启动成功 -> 异步更新最近游玩（LRU）
    store.on('game-launched', (gameId) => { setTimeout(() => pushRecent(gameId), 0); });
    // games 数据变化（增/删/改名）后刷新侧边栏（结合 games 数据）
    store.on('games', () => render());
    dbg('initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.recordRecentPlay = pushRecent; // 可选：供外部直接写入
})();
