/**
 * @file state.js
 * @module state
 * @description 渲染进程发布-订阅数据枢纽（GMStore）：统一管理业务数据（游戏列表、
 *              设置、运行中游戏、攻略数据）与 UI 瞬时状态，写入业务数据后自动广播
 *              `<domain>:changed` 事件，订阅方据此刷新视图，打破“改数据 vs 忘刷新”的死锁。
 * @author EternoPax
 * @since 2026/8/28
 */
// state.js —— 发布-订阅数据枢纽（GMStore）
// 取代原 window.GMState：业务数据统一经 GMStore.state 读取、经 GMStore.set* 写入，
// 写入后自动广播 `<domain>:changed`，订阅方自动刷新，打破“改数据 vs 忘刷新”的死锁。
// 调试：window.GM_DEBUG 默认开启；页面脚本可设 window.GM_DEBUG = false 关闭 console 日志。
(function () {
  if (typeof window.GM_DEBUG === 'undefined') window.GM_DEBUG = true;

  // —— 业务数据域（写入触发事件）——
  const state = {
    games: [],
    settings: {},
    runningGames: new Set(),
    currentGuideGameId: null,
    guideData: { nodes: [], connections: [] },
    // —— UI 瞬时状态（直接读写，不触发事件）——
    selectedNode: null,
    isDraggingNode: false,
    isConnecting: false,
    connectionStart: null,
    dragOffset: { x: 0, y: 0 },
    editingGameId: null,
    pendingGameData: null,
    isPanning: false,
    panStartX: 0, panStartY: 0,
    panStartScrollLeft: 0, panStartScrollTop: 0,
    currentSelectedNodeId: null,
    isDraggingForClickFlag: false,
    guideKeyHandler: null,
    tempLine: null,
  };

  // domain -> Set<fn>
  const listeners = new Map();

  /**
   * 订阅指定业务域的变更事件。
   * @param {string} domain - 业务域名（如 'games'、'settings'）
   * @param {Function} fn - 变更回调函数
   * @returns {Function} 返回取消订阅函数
   */
  function on(domain, fn) {
    if (typeof fn !== 'function') return () => {};
    if (!listeners.has(domain)) listeners.set(domain, new Set());
    listeners.get(domain).add(fn);
    if (window.GM_DEBUG) console.log(`[GMStore] on "${domain}:changed" 订阅 +1 (${listeners.get(domain).size})`);
    return () => off(domain, fn);
  }

  /**
   * 取消订阅指定业务域的变更事件。
   * @param {string} domain - 业务域名
   * @param {Function} fn - 原订阅回调函数
   */
  function off(domain, fn) {
    const set = listeners.get(domain);
    if (!set) return;
    set.delete(fn);
    if (window.GM_DEBUG) console.log(`[GMStore] off "${domain}:changed" (-1, left=${set.size})`);
  }

  /**
   * 触发指定业务域的变更事件，通知所有订阅回调。
   * @param {string} domain - 业务域名
   * @param {any} payload - 广播给订阅方的数据载荷
   */
  function emit(domain, payload) {
    const set = listeners.get(domain);
    if (window.GM_DEBUG) console.log(`[GMStore] emit "${domain}" (subscribers=${set ? set.size : 0})`, payload);
    if (!set) return;
    set.forEach(fn => {
      try { fn(payload); } catch (e) {
        if (window.GM_DEBUG) console.error('[GMStore] 订阅回调异常', domain, e);
      }
    });
  }

  /**
   * 调试日志：记录业务域数据被写入的值。
   * @param {string} domain - 业务域名
   * @param {any} value - 写入的新值
   */
  function logSet(domain, value) {
    if (window.GM_DEBUG) console.log(`[GMStore] set "${domain}" →`, value);
  }

  function setGames(games) {
    state.games = Array.isArray(games) ? games : [];
    logSet('games', state.games);
    emit('games', state.games);
  }

  function setSettings(patch) {
    Object.assign(state.settings, patch || {});
    logSet('settings', state.settings);
    emit('settings', state.settings);
  }

  function setRunning(gameId, running) {
    if (running) state.runningGames.add(gameId);
    else state.runningGames.delete(gameId);
    if (window.GM_DEBUG) console.log(`[GMStore] setRunning "${gameId}" → ${running ? 'running' : 'stopped'} (${state.runningGames.size} running)`);
    emit('runningGames', state.runningGames);
  }

  function setRunningBatch(ids) {
    state.runningGames = new Set(Array.isArray(ids) ? ids : []);
    logSet('runningGames', state.runningGames);
    emit('runningGames', state.runningGames);
  }

  function setGuideData(data) {
    state.guideData = (data && typeof data === 'object') ? data : { nodes: [], connections: [] };
    logSet('guideData', state.guideData);
    emit('guideData', state.guideData);
  }

  window.GMStore = {
    state,
    get: (domain) => state[domain],
    on, off, emit,
    setGames, setSettings, setRunning, setRunningBatch, setGuideData,
  };

  if (window.GM_DEBUG) console.log('[GMStore] initialized (GM_DEBUG=' + window.GM_DEBUG + ')');
})();
