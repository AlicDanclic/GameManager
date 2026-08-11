// state.js
// 共享状态（使用普通对象，通过引用传递）
const state = {
  games: [],
  settings: {},
  currentGuideGameId: null,
  guideData: { nodes: [], connections: [] },
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

module.exports = state;