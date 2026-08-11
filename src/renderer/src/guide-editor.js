// guide-editor.js
const { ipcRenderer } = require('electron');
const fs = require('fs');
const state = require('./state.js');

// 本地变量
let tempLine = null;
let isPanning = false;
let panStartX = 0, panStartY = 0;
let panStartScrollLeft = 0, panStartScrollTop = 0;
let globalMouseupAdded = false;

function createBezierPath(x1, y1, x2, y2, fromFlip = false, toFlip = false) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 30);
  // 起点为输出端口：未翻转朝右出线（控制点在 x1 右侧），翻转后朝左出线（控制点在 x1 左侧）
  const c1x = fromFlip ? x1 - dx : x1 + dx;
  // 终点为输入端口：未翻转从左侧进线（控制点在 x2 左侧），翻转后从右侧进线（控制点在 x2 右侧）
  const c2x = toFlip ? x2 + dx : x2 - dx;
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}

function renderGuideConnections() {
  const group = document.getElementById('connections-group');
  if (!group) return;
  group.innerHTML = '';
  const container = document.getElementById('guide-flow-container');
  const containerRect = container.getBoundingClientRect();
  state.guideData.connections.forEach((conn, index) => {
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
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'connection-path');
    path.setAttribute('d', createBezierPath(x1, y1, x2, y2, fromFlip, toFlip));
    path.setAttribute('marker-end', 'url(#arrowhead)');
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('class', 'connection-hit-area');
    hitPath.setAttribute('d', createBezierPath(x1, y1, x2, y2, fromFlip, toFlip));
    hitPath.style.fill = 'none';
    hitPath.style.stroke = 'transparent';
    hitPath.style.strokeWidth = '15';
    hitPath.style.cursor = 'pointer';
    hitPath.style.pointerEvents = 'stroke';
    hitPath.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (confirm('删除这条连接线？')) {
        state.guideData.connections.splice(index, 1);
        renderGuideConnections();
        saveGuide();
        updateAllHighlights();
      }
    });
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
    group.appendChild(path);
    group.appendChild(hitPath);
  });
  updateAllHighlights();
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
    await ipcRenderer.invoke('save-guide', state.currentGuideGameId, state.guideData);
  }
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
      renderGuideConnections();
    }
    if (state.isConnecting && state.connectionStart) updateTempConnection(e);
  }
  function handleContainerMouseUp(e) {
    if (state.isDraggingNode) {
      state.isDraggingNode = false;
      state.selectedNode = null;
      saveGuide();
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
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement && (document.activeElement.isContentEditable ||
          document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA')) return;
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
  const savedGuide = await ipcRenderer.invoke('get-guide', gameId);
  if (savedGuide) {
    state.guideData.nodes = savedGuide.nodes || [];
    state.guideData.connections = savedGuide.connections || [];
  } else {
    state.guideData.nodes = [];
    state.guideData.connections = [];
  }
  setupGlobalConnectionListener();
  initGuideEditor();
  document.getElementById('guide-modal').classList.add('active');
}

function closeGuideModal() {
  if (state.guideKeyHandler) {
    document.removeEventListener('keydown', state.guideKeyHandler);
    state.guideKeyHandler = null;
  }
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
}

function clearGuide() {
  if (!confirm('确定要清空所有节点吗？')) return;
  state.guideData.nodes = [];
  state.guideData.connections = [];
  const container = document.getElementById('nodes-container');
  if (container) container.innerHTML = '';
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
}

async function exportGuide() {
  if (!state.currentGuideGameId) {
    alert('没有正在编辑的攻略');
    return;
  }
  const game = window.games ? window.games.find(g => g.id === state.currentGuideGameId) : null;
  const defaultName = game ? `${game.name}_攻略.gwalk` : 'guide.gwalk';
  const content = JSON.stringify(state.guideData, null, 2);
  const result = await ipcRenderer.invoke('save-file', { defaultPath: defaultName, content });
  if (result.success) alert(`攻略已导出到：${result.filePath}`);
  else if (!result.canceled) alert('导出失败：' + result.error);
}

async function importGuide() {
  if (!state.currentGuideGameId) {
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
    state.guideData.nodes = importedData.nodes;
    state.guideData.connections = importedData.connections;
    initGuideEditor();
    await saveGuide();
    updateAllHighlights();
    alert('攻略导入成功');
  } catch (error) {
    alert('导入失败：' + error.message);
  }
}

function deleteGuideNode(nodeId) {
  if (!confirm('确定要删除这个节点吗？')) return;
  state.guideData.nodes = state.guideData.nodes.filter(n => n.id !== nodeId);
  state.guideData.connections = state.guideData.connections.filter(c => c.fromNode !== nodeId && c.toNode !== nodeId);
  const nodeEl = document.getElementById(nodeId);
  if (nodeEl) nodeEl.remove();
  renderGuideConnections();
  saveGuide();
  updateAllHighlights();
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
}

function updatePortLabel(nodeId, portType, index, label) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    if (portType === 'input') node.inputs[index] = label.trim();
    else node.outputs[index] = label.trim();
    saveGuide();
  }
}

function updateNodeTitle(nodeId, title) {
  const node = state.guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    node.title = title.trim();
    saveGuide();
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

module.exports = {
  openGuide,
  closeGuideModal,
  addGuideNode,
  clearGuide,
  exportGuide,
  importGuide,
  deleteGuideNode,
  addPort,
  removePort,
  updatePortLabel,
  updateNodeTitle,
  startConnection,
  startNodeDrag,
  flipGuideNode,
};