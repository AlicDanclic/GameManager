/**
 * @file guide-editor.js
 * @module guide-editor
 * @description 节点式攻略编辑器：节点/连线的创建、渲染与拖拽、导入导出（.gwalk）、
 *              上游高亮、连线标签、撤销/重做、节点翻转等交互逻辑。
 * @author EternoPax
 * @since 2026/8/28
 */
// guide-editor.js
// 节点式攻略编辑器：节点/连线渲染、导入导出、上游高亮
(function () {
const store = window.GMStore;
const state = store.state;
const api = window.gameAPI;

// 本地变量
let tempLine = null;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let panStartScrollLeft = 0, panStartScrollTop = 0;
let globalMouseupAdded = false;
// 连线 DOM 映射：conn 对象引用 -> { path, hitPath }，用于增量更新（属性补丁）
let connectionEls = new Map();

function createBezierPath(x1, y1, x2, y2, fromFlip = false, toFlip = false) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 30);
  // 起点为输出端口：未翻转朝右出线（控制点在 x1 右侧），翻转后朝左出线（控制点在 x1 左侧）
  const c1x = fromFlip ? x1 - dx : x1 + dx;
  // 终点为输入端口：未翻转从左侧进线（控制点在 x2 左侧），翻转后从右侧进线（控制点在 x2 右侧）
  const c2x = toFlip ? x2 + dx : x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

// 三次贝塞尔曲线 t=0.5 的中点坐标（用于叠加标签层定位）
function calculateBezierMidpoint(x1, y1, x2, y2, fromFlip = false, toFlip = false) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 30);
  const c1x = fromFlip ? x1 - dx : x1 + dx;
  const c2x = toFlip ? x2 + dx : x2 - dx;
  const c1y = y1, c2y = y2;
  // 标准三次贝塞尔：B(t) = (1-t)^3 P0 + 3(1-t)^2 t C1 + 3(1-t)t^2 C2 + t^3 P3，t=0.5
  const x = 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2;
  const y = 0.125 * y1 + 0.375 * c1y + 0.375 * c2y + 0.125 * y2;
  return { x, y };
}

// 计算并更新某条连线对应 path/hitPath 的 d 属性（属性补丁，不重建元素）
function updateConnectionPath(entry, conn) {
  const container = document.getElementById('guide-flow-container');
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
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
  // 根据两端节点的翻转状态确定出线/进线方向（翻转后右进左出）
  const fromNodeData = state.guideData.nodes.find(n => n.id === conn.fromNode);
  const toNodeData = state.guideData.nodes.find(n => n.id === conn.toNode);
  const fromFlip = !!(fromNodeData && fromNodeData.flip);
  const toFlip = !!(toNodeData && toNodeData.flip);
  const d = createBezierPath(x1, y1, x2, y2, fromFlip, toFlip);
  entry.path.setAttribute('d', d);
  entry.hitPath.setAttribute('d', d);
  // 同步标签层位置到连线中点（若该连线有标签 DOM）
  updateConnectionLabelPosition(entry, conn, x1, y1, x2, y2, fromFlip, toFlip);
}

// 更新某条连线标签 DOM 的位置（left/top，配合 CSS translate(-50%,-50%) 居中）
function updateConnectionLabelPosition(entry, conn, x1, y1, x2, y2, fromFlip = false, toFlip = false) {
  if (!entry || !entry.labelEl) return;
  const p = calculateBezierMidpoint(x1, y1, x2, y2, fromFlip, toFlip);
  entry.labelEl.style.left = p.x + 'px';
  entry.labelEl.style.top = p.y + 'px';
}

// 根据 conn.label / 编辑状态，刷新标签 DOM 的外观与内容
// 结构：外层定位容器 labelEl(wrapper) + 文本/编辑区 labelMain
function setConnectionLabelState(entry, conn) {
  const w = entry.labelEl;
  const main = entry.labelMain;
  if (!w || !main) return;
  main.classList.remove('text', 'editing');
  if (entry.editing) {
    w.style.display = 'block';
    main.classList.add('editing');
    return;
  }
  if (conn.label) {
    main.textContent = conn.label;
    w.style.display = 'block';
    main.classList.add('text');
  } else {
    w.style.display = 'none';
    main.textContent = '';
  }
}

// 有标签的连线加粗（stroke-width 2→3），实现“视觉权重”强调
function syncConnectionVisual(entry, conn) {
  if (!entry || !entry.path) return;
  if (conn.label) entry.path.classList.add('has-label');
  else entry.path.classList.remove('has-label');
}

// 进入标签编辑态（contenteditable）
function enterConnectionEdit(entry, conn) {
  const main = entry.labelMain;
  if (!main) return;
  entry.editing = true;
  main.setAttribute('contenteditable', 'true');
  main.textContent = conn.label || '';
  setConnectionLabelState(entry, conn);
  main.focus();
  const range = document.createRange();
  range.selectNodeContents(main);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) { sel.removeAllRanges(); sel.addRange(range); }
}

// 编辑结束：保存 / 清空，恢复到显示态（文本为空则移除标签且隐藏）
function commitConnectionLabel(entry, conn) {
  if (!entry.editing || !entry.labelMain) return;
  const main = entry.labelMain;
  const value = (main.textContent || '').trim();
  entry.editing = false;
  main.removeAttribute('contenteditable');
  conn.label = value || undefined;
  setConnectionLabelState(entry, conn);
  syncConnectionVisual(entry, conn);
  saveGuide();
  commitGuideHistory();
}

// 删除标签：清空 label、退出编辑、隐藏标签框并取消连线加粗（记录撤销历史）
function deleteConnectionLabel(entry, conn) {
  entry.editing = false;
  if (entry.labelMain) entry.labelMain.removeAttribute('contenteditable');
  conn.label = undefined;
  setConnectionLabelState(entry, conn);
  syncConnectionVisual(entry, conn);
  saveGuide();
  commitGuideHistory();
}

// 删除连线（右键菜单 / Delete 键复用）
function deleteConnection(conn) {
  const idx = state.guideData.connections.indexOf(conn);
  if (idx === -1) return;
  state.guideData.connections.splice(idx, 1);
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

// ==================== 连线右键上下文菜单 ====================
let connectionMenuEl = null;
let connectionMenuCtx = null; // { entry, conn }
let connectionMenuListenerAdded = false;

function ensureConnectionMenu() {
  if (connectionMenuEl && connectionMenuEl.isConnected) return;
  connectionMenuEl = document.createElement('div');
  connectionMenuEl.className = 'connection-context-menu';
  connectionMenuEl.style.display = 'none';
  connectionMenuEl.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || !connectionMenuCtx) return;
    const action = item.dataset.action;
    closeConnectionMenu();
    if (action === 'edit-label') enterConnectionEdit(connectionMenuCtx.entry, connectionMenuCtx.conn);
    else if (action === 'delete-label') deleteConnectionLabel(connectionMenuCtx.entry, connectionMenuCtx.conn);
    else if (action === 'delete-connection') deleteConnection(connectionMenuCtx.conn);
  });
  document.body.appendChild(connectionMenuEl);
}

function closeConnectionMenu() {
  if (connectionMenuEl) connectionMenuEl.style.display = 'none';
}

function openConnectionMenu(e, entry, conn) {
  ensureConnectionMenu();
  connectionMenuCtx = { entry, conn };
  const hasLabel = !!conn.label;
  const labelItems = hasLabel
    ? '<button class="context-menu-item" data-action="edit-label">修改标签</button>' +
      '<button class="context-menu-item danger" data-action="delete-label">删除标签</button>'
    : '<button class="context-menu-item" data-action="edit-label">添加标签</button>';
  connectionMenuEl.innerHTML = labelItems +
    '<button class="context-menu-item danger" data-action="delete-connection">删除连线</button>';
  connectionMenuEl.style.display = 'block';
  // 定位到鼠标，防止溢出视口
  const mw = connectionMenuEl.offsetWidth;
  const mh = connectionMenuEl.offsetHeight;
  let left = e.clientX, top = e.clientY;
  if (left + mw > window.innerWidth - 4) left = Math.max(4, window.innerWidth - mw - 4);
  if (top + mh > window.innerHeight - 4) top = Math.max(4, window.innerHeight - mh - 4);
  connectionMenuEl.style.left = left + 'px';
  connectionMenuEl.style.top = top + 'px';
}

// 点击菜单外关闭；仅注册一次
function ensureConnectionMenuGlobalListener() {
  if (connectionMenuListenerAdded) return;
  document.addEventListener('click', (e) => {
    if (connectionMenuEl && connectionMenuEl.style.display !== 'none' &&
        !e.target.closest('.connection-context-menu')) {
      closeConnectionMenu();
    }
  });
  connectionMenuListenerAdded = true;
}

// 为一条连线创建 DOM（path + hitPath）并绑定命中事件；仅在首次出现该连线时调用
function createConnectionEntry(conn) {
  const group = document.getElementById('connections-group');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'connection-path');
  path.setAttribute('marker-end', 'url(#arrowhead)');
  const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hitPath.setAttribute('class', 'connection-hit-area');
  hitPath.style.fill = 'none';
  hitPath.style.stroke = 'transparent';
  hitPath.style.strokeWidth = '15';
  hitPath.style.cursor = 'pointer';
  hitPath.style.pointerEvents = 'stroke';
  // 连线中点上的标签交互层（绝对定位 Div，坐标随连线刷新）
  // 结构：外层定位容器 labelEl(wrapper) + 文本/编辑区 labelMain
  const labelsLayer = document.getElementById('guide-labels-layer');
  const labelEl = document.createElement('div');
  labelEl.className = 'connection-label';
  labelEl.style.display = 'none';
  const labelMain = document.createElement('div');
  labelMain.className = 'connection-label-main';
  labelMain.setAttribute('spellcheck', 'false');
  labelMain.contentEditable = 'false';
  labelEl.appendChild(labelMain);
  if (labelsLayer) labelsLayer.appendChild(labelEl);

  const entry = { path, hitPath, labelEl, labelMain, editing: false };

  // 单击选中 / 取消选中（Ctrl/Cmd 多选）
  hitPath.addEventListener('click', (e) => {
    e.stopPropagation();
    if (path.classList.contains('selected')) {
      path.classList.remove('selected');
    } else {
      if (!e.ctrlKey && !e.metaKey) {
        document.querySelectorAll('.connection-path').forEach(p => p.classList.remove('selected'));
      }
      path.classList.add('selected');
    }
  });
  hitPath.addEventListener('mouseenter', () => {
    path.style.stroke = '#333';
    path.style.strokeWidth = '3';
  });
  hitPath.addEventListener('mouseleave', () => {
    if (!path.classList.contains('selected')) {
      path.style.stroke = '';
      path.style.strokeWidth = '';
    } else {
      path.style.stroke = '#4ecdc4';
      path.style.strokeWidth = '3';
    }
  });
  // 右键弹出标签/连线上下文菜单（修改/删除标签、删除连线）
  hitPath.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openConnectionMenu(e, entry, conn);
  });
  // 编辑态：Enter 提交 / blur 保存 / paste 文本
  labelMain.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); labelMain.blur(); } });
  labelMain.addEventListener('blur', () => { if (entry.editing) commitConnectionLabel(entry, conn); });
  labelMain.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  group.appendChild(path);
  group.appendChild(hitPath);
  syncConnectionVisual(entry, conn);
  setConnectionLabelState(entry, conn);
  updateConnectionPath(entry, conn);
  return entry;
}

// 增量同步：按 connections 顺序确保每条连线都有 DOM（新增则创建、已存在则仅补丁 d、被移除则删除），
// 不再清空 group 全量重建，从而保留连线选中态等 DOM 状态。
function renderGuideConnections() {
  const group = document.getElementById('connections-group');
  if (!group) return;
  const conns = state.guideData.connections;
  const seen = new Set();
  conns.forEach(conn => {
    let entry = connectionEls.get(conn);
    if (!entry) {
      entry = createConnectionEntry(conn);
      connectionEls.set(conn, entry);
    } else {
      updateConnectionPath(entry, conn);
    }
    seen.add(conn);
  });
  // 删除已被从数据层移除的连线 DOM
  for (const [conn, entry] of connectionEls) {
    if (!seen.has(conn)) {
      if (entry.labelEl) entry.labelEl.remove();
      entry.path.remove();
      entry.hitPath.remove();
      connectionEls.delete(conn);
    }
  }
  updateAllHighlights();
}

// 仅当某节点移动时，增量更新与它相连的连线（避免每帧全量重建连线树）
function updateConnectionsForNode(nodeId) {
  state.guideData.connections.forEach(conn => {
    if (conn.fromNode === nodeId || conn.toNode === nodeId) {
      const entry = connectionEls.get(conn);
      if (entry) updateConnectionPath(entry, conn);
    }
  });
}


function renderGuideNode(node) {
  const container = document.getElementById('nodes-container');
  const nodeEl = document.createElement('div');
  nodeEl.id = node.id;
  nodeEl.className = 'flow-node';
  nodeEl.style.left = node.x + 'px';
  nodeEl.style.top = node.y + 'px';
  nodeEl.style.pointerEvents = 'auto';
  const typeLabel = { 'single': '一入一出', 'multi-in': '多入一出', 'multi-out': '一入多出' }[node.type];
  // 翻转状态：翻转后输出列在左（左边出）、输入列在右（右边进）
  const flipped = !!node.flip;
  const inputsHtml = node.inputs.map((input, i) => {
    const handleHtml = `
      <div class="port-handle input"
           data-node="${node.id}" data-port="${i}" data-type="input"
           onmousedown="window.startConnection(event, '${node.id}', ${i}, 'input')"></div>`;
    const labelHtml = `
      <div contenteditable="true" class="port-label-input"
           onblur="window.updatePortLabel('${node.id}', 'input', ${i}, this.textContent)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           onpaste="window.handlePaste(event)"
           onclick="event.stopPropagation()">${input}</div>`;
    const btnsHtml = `
      ${node.type !== 'single' && i === node.inputs.length - 1 ? `
        <button class="port-add-btn" onclick="window.addPort('${node.id}', 'input')">+</button>
      ` : ''}
      ${node.inputs.length > 1 ? `
        <button class="port-remove-btn" onclick="window.removePort('${node.id}', 'input', ${i})">-</button>
      ` : ''}`;
    return `
    <div class="port-row input-row${flipped ? ' flipped' : ''}" data-node="${node.id}">
      ${flipped ? labelHtml + btnsHtml + handleHtml : handleHtml + labelHtml + btnsHtml}
    </div>
  `;
  }).join('');
  const outputsHtml = node.outputs.map((output, i) => {
    const handleHtml = `
      <div class="port-handle output"
           data-node="${node.id}" data-port="${i}" data-type="output"
           onmousedown="window.startConnection(event, '${node.id}', ${i}, 'output')"></div>`;
    const labelHtml = `
      <div contenteditable="true" class="port-label-input"
           onblur="window.updatePortLabel('${node.id}', 'output', ${i}, this.textContent)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           onpaste="window.handlePaste(event)"
           onclick="event.stopPropagation()">${output}</div>`;
    const btnsHtml = `
      ${node.type !== 'single' && i === node.outputs.length - 1 ? `
        <button class="port-add-btn" onclick="window.addPort('${node.id}', 'output')">+</button>
      ` : ''}
      ${node.outputs.length > 1 ? `
        <button class="port-remove-btn" onclick="window.removePort('${node.id}', 'output', ${i})">-</button>
      ` : ''}`;
    return `
    <div class="port-row output-row${flipped ? ' flipped' : ''}" data-node="${node.id}">
      ${flipped ? handleHtml + labelHtml + btnsHtml : labelHtml + btnsHtml + handleHtml}
    </div>
  `;
  }).join('');
  const inputsBlock = `
      <div class="node-inputs">
        ${inputsHtml}
      </div>`;
  const outputsBlock = `
      <div class="node-outputs">
        ${outputsHtml}
      </div>`;
  nodeEl.innerHTML = `
    <div class="node-header" onmousedown="window.startNodeDrag(event, '${node.id}')">
      <span class="node-type-icon">${typeLabel}</span>
      <div contenteditable="true" class="node-title-input" 
           onblur="window.updateNodeTitle('${node.id}', this.textContent)"
           onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
           onpaste="window.handlePaste(event)"
           onclick="event.stopPropagation()">${node.title}</div>
      <button class="node-flip-btn${flipped ? ' active' : ''}" onclick="window.flipGuideNode('${node.id}')" title="翻转节点（调换进/出方向）">⇄</button>
      <button class="node-delete-btn" onclick="window.deleteGuideNode('${node.id}')" title="删除节点">&times;</button>
    </div>
    <div class="node-ports-container${flipped ? ' flipped' : ''}">
      ${flipped ? outputsBlock + inputsBlock : inputsBlock + outputsBlock}
    </div>
  `;
  container.appendChild(nodeEl);
  nodeEl.querySelectorAll('[contenteditable="true"]').forEach(el => el.setAttribute('spellcheck', 'false'));
  nodeEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = e.target;
    if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'BUTTON' ||
        target.classList?.contains('port-handle') || target.classList?.contains('port-add-btn') ||
        target.classList?.contains('port-remove-btn') || target.classList?.contains('node-delete-btn')) {
      return;
    }
    if (state.isDraggingForClickFlag) return;
    selectGuideNode(node.id);
  });
}

function getUpstreamNodesSet(nodeId) {
  const reverseAdj = new Map();
  for (const conn of state.guideData.connections) {
    if (!reverseAdj.has(conn.toNode)) reverseAdj.set(conn.toNode, []);
    reverseAdj.get(conn.toNode).push(conn.fromNode);
  }
  const visited = new Set();
  const queue = [nodeId];
  visited.add(nodeId);
  while (queue.length) {
    const current = queue.shift();
    const parents = reverseAdj.get(current) || [];
    for (const parent of parents) {
      if (!visited.has(parent)) {
        visited.add(parent);
        queue.push(parent);
      }
    }
  }
  return visited;
}

function updateAllHighlights() {
  document.querySelectorAll('.flow-node').forEach(nodeEl => {
    nodeEl.classList.remove('highlight-parent');
  });
  document.querySelectorAll('.connection-path').forEach(path => path.classList.remove('highlight'));
  if (!state.currentSelectedNodeId) return;
  const upstreamSet = getUpstreamNodesSet(state.currentSelectedNodeId);
  document.querySelectorAll('.flow-node').forEach(nodeEl => {
    const id = nodeEl.id;
    if (id === state.currentSelectedNodeId) nodeEl.classList.add('selected');
    else if (upstreamSet.has(id)) nodeEl.classList.add('highlight-parent');
  });
  const allPaths = document.querySelectorAll('.connection-path');
  state.guideData.connections.forEach((conn, idx) => {
    if (upstreamSet.has(conn.fromNode) && upstreamSet.has(conn.toNode)) {
      if (allPaths[idx]) allPaths[idx].classList.add('highlight');
    }
  });
}

function selectGuideNode(nodeId) {
  if (state.currentSelectedNodeId === nodeId) return;
  state.currentSelectedNodeId = nodeId;
  updateAllHighlights();
}

function clearGuideNodeSelection() {
  if (state.currentSelectedNodeId) {
    state.currentSelectedNodeId = null;
    updateAllHighlights();
  }
}

function updateTempConnection(e) {
  if (!state.connectionStart) return;
  const container = document.getElementById('guide-flow-container');
  const fromNode = document.getElementById(state.connectionStart.nodeId);
  if (!fromNode) return;
  const fromHandle = fromNode.querySelector(`.port-handle.output[data-port="${state.connectionStart.portIndex}"]`);
  if (!fromHandle) return;
  const fromRect = fromHandle.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const x1 = fromRect.left - containerRect.left + container.scrollLeft + fromRect.width / 2;
  const y1 = fromRect.top - containerRect.top + container.scrollTop + fromRect.height / 2;
  const x2 = e.clientX - containerRect.left + container.scrollLeft;
  const y2 = e.clientY - containerRect.top + container.scrollTop;
  // 起点节点翻转时，临时线从左侧出线，并以相同方向延伸到鼠标位置
  const fromNodeData = state.guideData.nodes.find(n => n.id === state.connectionStart.nodeId);
  const fromFlip = !!(fromNodeData && fromNodeData.flip);
  const tempPath = document.getElementById('temp-connection');
  if (tempPath) tempPath.setAttribute('d', createBezierPath(x1, y1, x2, y2, fromFlip, fromFlip));
}

async function saveGuide() {
  if (state.currentGuideGameId) {
    await api.invoke('save-guide', state.currentGuideGameId, state.guideData);
  }
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('guide-undo-btn');
  const redoBtn = document.getElementById('guide-redo-btn');
  if (undoBtn) undoBtn.disabled = !window.GMGuideHistory.canUndo();
  if (redoBtn) redoBtn.disabled = !window.GMGuideHistory.canRedo();
}

// 记录一次原子编辑的快照并刷新按钮状态
function commitGuideHistory() {
  window.GMGuideHistory.commit();
  updateUndoRedoButtons();
}

// 撤销/重做：数据层由 GMGuideHistory 覆写 state.guideData，这里负责重绘与持久化
// 订阅 guideData 域变更：外部(如撤销/重做历史)修改 guideData 后自动重绘并持久化
let guideDataSubscribed = false;
function ensureGuideDataSubscription() {
  if (guideDataSubscribed) return;
  store.on('guideData', () => {
    initGuideEditor();
    saveGuide();
  });
  guideDataSubscribed = true;
}

function undoGuide() {
  if (!window.GMGuideHistory.undo()) return;
  state.currentSelectedNodeId = null;
  updateUndoRedoButtons();
}

function redoGuide() {
  if (!window.GMGuideHistory.redo()) return;
  state.currentSelectedNodeId = null;
  updateUndoRedoButtons();
}

function initGuideEditor() {
  const container = document.getElementById('guide-flow-container');
  container.innerHTML = '';
  const nodesContainer = document.createElement('div');
  nodesContainer.id = 'nodes-container';
  nodesContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 3000px; height: 3000px; z-index: 1;';
  container.appendChild(nodesContainer);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'guide-svg';
  svg.className.baseVal = 'guide-svg';
  svg.setAttribute('width', '3000');
  svg.setAttribute('height', '3000');
  svg.style.cssText = 'position: absolute; top: 0; left: 0; z-index: 2; pointer-events: none;';
  svg.innerHTML = `
    <defs>
        <marker id="arrowhead" markerWidth="4" markerHeight="3" refX="3" refY="1.5" orient="auto">
          <polygon points="0 0, 4 1.5, 0 3" fill="#333" />
        </marker>
    </defs>
    <g id="connections-group"></g>
    <path id="temp-connection" class="temp-connection" style="display: none;"></path>
  `;
  container.appendChild(svg);
  const nodesEventLayer = document.createElement('div');
  nodesEventLayer.id = 'nodes-event-layer';
  nodesEventLayer.style.cssText = 'position: absolute; top: 0; left: 0; width: 3000px; height: 3000px; z-index: 3; pointer-events: none;';
  container.appendChild(nodesEventLayer);
  const labelsLayer = document.createElement('div');
  labelsLayer.id = 'guide-labels-layer';
  labelsLayer.style.cssText = 'position: absolute; top: 0; left: 0; width: 3000px; height: 3000px; z-index: 4; pointer-events: none;';
  container.appendChild(labelsLayer);
  connectionEls = new Map();
  state.guideData.nodes.forEach(node => renderGuideNode(node));
  requestAnimationFrame(() => renderGuideConnections());
  
  function handleContainerMouseMove(e) {
    if (state.isDraggingNode && state.selectedNode) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft - state.dragOffset.x;
      const y = e.clientY - rect.top + container.scrollTop - state.dragOffset.y;
      state.selectedNode.x = Math.max(0, x);
      state.selectedNode.y = Math.max(0, y);
      const nodeEl = document.getElementById(state.selectedNode.id);
      if (nodeEl) {
        nodeEl.style.left = state.selectedNode.x + 'px';
        nodeEl.style.top = state.selectedNode.y + 'px';
      }
      // 增量：只更新与移动节点相连的连线，避免每帧全量重建连线树
      updateConnectionsForNode(state.selectedNode.id);
    }
    if (state.isConnecting && state.connectionStart) updateTempConnection(e);
  }
  function handleContainerMouseUp(e) {
    if (state.isDraggingNode) {
      state.isDraggingNode = false;
      state.selectedNode = null;
      saveGuide();
      commitGuideHistory();
      updateAllHighlights();
    }
    setTimeout(() => { state.isDraggingForClickFlag = false; }, 10);
  }
  container.addEventListener('mousemove', handleContainerMouseMove);
  container.addEventListener('mouseup', handleContainerMouseUp);
  
  // 中键拖拽
  function onPanMouseDown(e) {
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartScrollLeft = container.scrollLeft;
      panStartScrollTop = container.scrollTop;
      container.style.cursor = 'grabbing';
    }
  }
  function onPanMouseMove(e) {
    if (!isPanning) return;
    e.preventDefault();
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    container.scrollLeft = panStartScrollLeft - dx;
    container.scrollTop = panStartScrollTop - dy;
  }
  function onPanMouseUp(e) {
    if (!isPanning) return;
    isPanning = false;
    container.style.cursor = '';
  }
  container.addEventListener('mousedown', onPanMouseDown);
  container.addEventListener('mousemove', onPanMouseMove);
  container.addEventListener('mouseup', onPanMouseUp);
  
  container.addEventListener('click', (e) => {
    if (e.target === container || e.target === svg || e.target.id === 'connections-group' || e.target.id === 'guide-svg') {
      document.querySelectorAll('.connection-path').forEach(p => p.classList.remove('selected'));
      document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('selected'));
      clearGuideNodeSelection();
    }
  });
  
  if (state.guideKeyHandler) document.removeEventListener('keydown', state.guideKeyHandler);
  const newHandler = (e) => {
    const active = document.activeElement;
    const inEditable = !!(active && (active.isContentEditable ||
      active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
    const mod = e.ctrlKey || e.metaKey;
    // 撤销/重做快捷键：当焦点在可编辑元素内时放行给浏览器原生文本撤销
    if (mod && !inEditable) {
      const key = (e.key || '').toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoGuide(); else undoGuide();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        redoGuide();
        return;
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (inEditable) return;
      const selectedPaths = document.querySelectorAll('.connection-path.selected');
      if (selectedPaths.length > 0) {
        e.preventDefault();
        const indicesToRemove = [];
        selectedPaths.forEach(path => {
          const allPaths = Array.from(document.querySelectorAll('.connection-path'));
          const index = allPaths.indexOf(path);
          if (index !== -1) indicesToRemove.push(index);
        });
        indicesToRemove.sort((a, b) => b - a);
        indicesToRemove.forEach(index => {
          state.guideData.connections.splice(index, 1);
        });
        renderGuideConnections();
        saveGuide();
        commitGuideHistory();
        updateAllHighlights();
      }
    }
  };
  document.addEventListener('keydown', newHandler);
  state.guideKeyHandler = newHandler;
}

function setupGlobalConnectionListener() {
  if (globalMouseupAdded) return;
  document.addEventListener('mouseup', (e) => {
    if (state.isConnecting && state.connectionStart) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && target.classList.contains('port-handle') && target.dataset.type === 'input') {
        const toNodeId = target.dataset.node;
        const toPortIndex = parseInt(target.dataset.port);
        if (toNodeId !== state.connectionStart.nodeId) {
          const connection = {
            fromNode: state.connectionStart.nodeId,
            fromPort: state.connectionStart.portIndex,
            toNode: toNodeId,
            toPort: toPortIndex
          };
          const exists = state.guideData.connections.some(c =>
            c.fromNode === connection.fromNode && c.fromPort === connection.fromPort &&
            c.toNode === connection.toNode && c.toPort === connection.toPort
          );
          if (!exists) {
            state.guideData.connections.push(connection);
            renderGuideConnections();
            saveGuide();
            commitGuideHistory();
            updateAllHighlights();
          }
        }
      }
      state.isConnecting = false;
      state.connectionStart = null;
      const tempPath = document.getElementById('temp-connection');
      if (tempPath) tempPath.style.display = 'none';
    }
  });
  globalMouseupAdded = true;
}

// 导出API
async function openGuide(gameId) {
  state.currentGuideGameId = gameId;
  const savedGuide = await api.invoke('get-guide', gameId);
  if (savedGuide) {
    state.guideData.nodes = savedGuide.nodes || [];
    state.guideData.connections = savedGuide.connections || [];
  } else {
    state.guideData.nodes = [];
    state.guideData.connections = [];
  }
  window.GMGuideHistory.init(state.guideData);
  updateUndoRedoButtons();
  setupGlobalConnectionListener();
  ensureConnectionMenuGlobalListener();
  ensureGuideDataSubscription();
  initGuideEditor();
  document.getElementById('guide-modal').classList.add('active');
}

function closeGuideModal() {
  if (state.guideKeyHandler) {
    document.removeEventListener('keydown', state.guideKeyHandler);
    state.guideKeyHandler = null;
  }
  closeConnectionMenu();
  saveGuide();
  document.getElementById('guide-modal').classList.remove('active');
  state.currentGuideGameId = null;
  state.guideData.nodes = [];
  state.guideData.connections = [];
}

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
    outputs: type === 'single' ? ['出口'] : (type === 'multi-in' ? ['出口'] : ['出口1', '出口2']),
    flip: false
  };
  state.guideData.nodes.push(node);
  renderGuideNode(node);
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

function clearGuide() {
  state.guideData.nodes = [];
  state.guideData.connections = [];
  const container = document.getElementById('nodes-container');
  if (container) container.innerHTML = '';
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

async function exportGuide() {
  if (!state.currentGuideGameId) {
    window.showToast('没有正在编辑的攻略', 'warning');
    return;
  }
  const game = state.games.find(g => g.id === state.currentGuideGameId) || null;
  const defaultName = game ? `${game.name}_攻略.gwalk` : 'guide.gwalk';
  const content = JSON.stringify(state.guideData, null, 2);
  const result = await api.invoke('save-file', { defaultPath: defaultName, content });
  if (result.success) window.showToast(`攻略已导出到：${result.filePath}`, 'success', { duration: 5000 });
  else if (!result.canceled) window.showToast('导出失败：' + result.error, 'error');
}

async function importGuide() {
  if (!state.currentGuideGameId) {
    window.showToast('没有正在编辑的攻略', 'warning');
    return;
  }
  const filePath = await api.invoke('select-file', [{ name: '攻略文件', extensions: ['gwalk', 'json'] }]);
  if (!filePath) return;
  try {
    const readResult = await api.invoke('read-text-file', filePath);
    if (!readResult.success) {
      window.showToast('读取攻略文件失败：' + (readResult.error || '未知错误'), 'error');
      return;
    }
    const importedData = JSON.parse(readResult.content);
    if (!importedData || typeof importedData !== 'object' ||
        !Array.isArray(importedData.nodes) || !Array.isArray(importedData.connections)) {
      window.showToast('无效的攻略文件：缺少 nodes 或 connections 数组', 'error');
      return;
    }
    state.guideData.nodes = importedData.nodes;
    state.guideData.connections = importedData.connections;
    initGuideEditor();
    await saveGuide();
    updateAllHighlights();
    window.showToast('攻略导入成功', 'success', { duration: 2500 });
  } catch (error) {
    window.showToast('导入失败：' + error.message, 'error');
  }
}

function deleteGuideNode(nodeId) {
  const nodeIndex = state.guideData.nodes.findIndex(n => n.id === nodeId);
  if (nodeIndex === -1) return;
  // 删除节点及其关联连线，记录到撤销历史
  state.guideData.nodes.splice(nodeIndex, 1);
  state.guideData.connections = state.guideData.connections.filter(c => c.fromNode !== nodeId && c.toNode !== nodeId);
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) nodeEl.remove();
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

// 翻转节点：切换 flip 状态，未翻转左进右出，翻转后右进左出（仅改变显示方向与连线走向）
function flipGuideNode(nodeId) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  node.flip = !node.flip;
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) nodeEl.remove();
  renderGuideNode(node);
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

function addPort(nodeId, portType) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  if (portType === 'input') node.inputs.push(`入口${node.inputs.length + 1}`);
  else node.outputs.push(`出口${node.outputs.length + 1}`);
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) nodeEl.remove();
  renderGuideNode(node);
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

function removePort(nodeId, portType, index) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  if (portType === 'input') {
    state.guideData.connections = state.guideData.connections.filter(c => !(c.toNode === nodeId && c.toPort === index));
    state.guideData.connections.forEach(c => { if (c.toNode === nodeId && c.toPort > index) c.toPort--; });
    node.inputs.splice(index, 1);
  } else {
    state.guideData.connections = state.guideData.connections.filter(c => !(c.fromNode === nodeId && c.fromPort === index));
    state.guideData.connections.forEach(c => { if (c.fromNode === nodeId && c.fromPort > index) c.fromPort--; });
    node.outputs.splice(index, 1);
  }
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) nodeEl.remove();
  renderGuideNode(node);
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
  commitGuideHistory();
}

function updatePortLabel(nodeId, portType, index, label) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    if (portType === 'input') node.inputs[index] = label.trim();
    else node.outputs[index] = label.trim();
    saveGuide();
    commitGuideHistory();
  }
}

function updateNodeTitle(nodeId, title) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    node.title = title.trim();
    saveGuide();
    commitGuideHistory();
  }
}

function startConnection(e, nodeId, portIndex, portType) {
  e.preventDefault();
  e.stopPropagation();
  if (portType === 'output') {
    state.isConnecting = true;
    state.connectionStart = { nodeId, portIndex };
    const tempPath = document.getElementById('temp-connection');
    if (tempPath) tempPath.style.display = 'block';
    updateTempConnection(e);
  }
}

function startNodeDrag(e, nodeId) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.isContentEditable) return;
  state.isDraggingForClickFlag = true;
  e.preventDefault();
  e.stopPropagation();
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  state.selectedNode = node;
  state.isDraggingNode = true;
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) {
    state.dragOffset.x = e.clientX - nodeEl.getBoundingClientRect().left;
    state.dragOffset.y = e.clientY - nodeEl.getBoundingClientRect().top;
  }
  document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('selected'));
  if (nodeEl) nodeEl.classList.add('selected');
}

// 全局粘贴处理
window.handlePaste = function(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
};

// 暴露到全局供 HTML 内联事件与引导脚本调用
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
window.flipGuideNode = flipGuideNode;
window.guideUndo = undoGuide;
window.guideRedo = redoGuide;

// 防误触：对“清空画布”按钮绑定长按蓄力确认（事件委托到攻略工具栏）
const guideToolbar = document.getElementById('guide-toolbar');
if (guideToolbar && typeof window.setupArmConfirm === 'function') window.setupArmConfirm(guideToolbar);
})();