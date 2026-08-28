/**
 * @file guide-history.js
 * @module guide-history
 * @description 双栈撤销/重做历史管理器（Command Pattern）：维护 undoStack / redoStack，
 *              栈中保存整份 guideData 的 JSON 快照（深拷贝）。供攻略编辑器通过
 *              GMGuideHistory 调用，仅负责数据层的栈管理与状态覆写，渲染/保存由调用方完成。
 * @author EternoPax
 * @since 2026/8/28
 */
// guide-history.js
// 双栈撤销/重做历史管理器（Command Pattern）：维护 undoStack / redoStack，
// 栈中保存整份 guideData 的 JSON 快照（深拷贝）。供攻略编辑器通过
// GMGuideHistory 调用。仅负责数据层的栈管理与状态覆写，渲染/保存由调用方完成。
(function () {
  const MAX_HISTORY = 50; // 可撤销的历史步数上限；栈含当前态，故状态数上限为 MAX+1
  let undoStack = [];
  let redoStack = [];
  let target = null; // 指向 window.GMStore.state.guideData（保持引用不变）

  function snapshot() {
    return JSON.stringify(target);
  }

  // 初始化：打开攻略时调用，从初始状态开始
  function init(guideData) {
    target = guideData;
    undoStack = [snapshot()];
    redoStack = [];
  }

  // 记录一次原子编辑后的快照；无变化则跳过。同时清空 redoStack。
  function commit() {
    if (!target) return;
    const s = snapshot();
    if (undoStack[undoStack.length - 1] === s) return;
    undoStack.push(s);
    if (undoStack.length > MAX_HISTORY + 1) undoStack.shift();
    redoStack = [];
  }

  // 将快照覆写回 target（保持 guideData 引用不变，只替换 nodes/connections）
  function apply(str) {
    const data = JSON.parse(str);
    target.nodes = data.nodes || [];
    target.connections = data.connections || [];
    // 广播 guideData 变更，通知视图层自动重绘（break 改数据忘刷新）
    if (window.GMStore && window.GMStore.state.guideData) {
      window.GMStore.setGuideData(window.GMStore.state.guideData);
    }
  }

  /**
   * 撤销：把当前栈顶弹出到 redoStack，再应用新的栈顶。
   * @returns {boolean} 有更早状态可撤销时返回 true，否则 false
   */
  // 撤销：把当前栈顶弹出到 redoStack，再应用新的栈顶。无更早状态时返回 false。
  function undo() {
    if (undoStack.length <= 1) return false;
    const current = undoStack.pop();
    redoStack.push(current);
    apply(undoStack[undoStack.length - 1]);
    return true;
  }

  /**
   * 重做：从 redoStack 弹回 undoStack 并应用。
   * @returns {boolean} 有可重做的状态时返回 true，否则 false
   */
  // 重做：从 redoStack 弹回 undoStack 并应用。
  function redo() {
    if (redoStack.length === 0) return false;
    const next = redoStack.pop();
    undoStack.push(next);
    apply(next);
    return true;
  }

  function canUndo() {
    return undoStack.length > 1;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  window.GMGuideHistory = { init, commit, undo, redo, canUndo, canRedo };
})();
