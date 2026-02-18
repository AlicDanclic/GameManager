const { ipcRenderer } = require('electron');

// 全局状态
let games = [];
let settings = {};
let currentGuideGameId = null;
let guideData = { nodes: [], connections: [] };

// 节点编辑器状态
let selectedNode = null;
let isDraggingNode = false;
let isConnecting = false;
let connectionStart = null;
let dragOffset = { x: 0, y: 0 };
let tempLine = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadGames();
  setupNavigation();
  setupDropZone();
  setupModals();
});

// ==================== 导航 ====================
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

// ==================== 设置 ====================
async function loadSettings() {
  settings = await ipcRenderer.invoke('get-settings');
  document.getElementById('translator-tool-path').value = settings.translatorTool || '';
  document.getElementById('mtool-path').value = settings.mtoolPath || '';
  document.getElementById('locale-emulator-path').value = settings.localeEmulator || '';
  document.getElementById('default-gal-mode').value = settings.defaultGalMode || 'noLocale';
  
  // 更新 MTOOL 按钮显示状态
  updateMtoolButton();
}

function updateMtoolButton() {
  const mtoolBtn = document.getElementById('mtool-btn');
  if (settings.mtoolPath) {
    mtoolBtn.style.display = 'inline-flex';
  } else {
    mtoolBtn.style.display = 'none';
  }
}

async function launchMtool() {
  const result = await ipcRenderer.invoke('launch-mtool');
  if (!result.success) {
    alert('启动 MTool 失败: ' + result.error);
  }
}

async function selectTranslatorTool() {
  const path = await ipcRenderer.invoke('select-file', [
    { name: 'Executable', extensions: ['exe'] }
  ]);
  if (path) {
    document.getElementById('translator-tool-path').value = path;
  }
}

async function selectMtoolPath() {
  const path = await ipcRenderer.invoke('select-file', [
    { name: 'Executable/Batch', extensions: ['exe', 'bat'] }
  ]);
  if (path) {
    document.getElementById('mtool-path').value = path;
  }
}

async function selectLocaleEmulator() {
  const path = await ipcRenderer.invoke('select-file', [
    { name: 'Executable', extensions: ['exe'] }
  ]);
  if (path) {
    document.getElementById('locale-emulator-path').value = path;
  }
}

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
    updateMtoolButton();
  } else {
    alert('保存失败: ' + result.error);
  }
}

// ==================== 游戏管理 ====================
async function loadGames() {
  games = await ipcRenderer.invoke('get-games');
  renderGames();
}

function renderGames() {
  const grid = document.getElementById('games-grid');
  
  if (games.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🎮</div>
        <p class="empty-state-text">暂无游戏，点击"添加游戏"或拖拽 exe/bat 文件添加</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = games.map(game => `
    <div class="game-card ${game.type}" data-id="${game.id}">
      <div class="game-type-header">${getTypeLabel(game.type)}</div>
      <div class="game-image" onclick="selectGameImage('${game.id}')">
        ${game.image ? `<img src="file://${game.image}" alt="${game.name}">` : '点击添加图片'}
      </div>
      <div class="game-info">
        <div class="game-name">${game.name}</div>
        <div class="game-actions">
          <button class="btn btn-small btn-secondary" onclick="openGameFolder('${game.id}')">打开文件夹</button>
          <button class="btn btn-small btn-secondary" onclick="openSaveFolder('${game.id}')">存档</button>
        </div>
        <div class="game-actions-row">
          <button class="btn btn-small btn-primary" onclick="launchGame('${game.id}')">启动</button>
          ${game.type === 'galgame' && settings.translatorTool ? `
            <button class="btn btn-small btn-secondary" onclick="launchWithTranslator('${game.id}')">翻译</button>
          ` : ''}
          <button class="btn btn-small btn-secondary" onclick="openGuide('${game.id}')">攻略</button>
          <button class="btn btn-small btn-danger" onclick="deleteGame('${game.id}')">删除</button>
        </div>
      </div>
    </div>
  `).join('');
}

function getTypeLabel(type) {
  const labels = { galgame: 'Galgame', rpg: 'RPG', unity: 'Unity' };
  return labels[type] || type;
}

// ==================== 拖放添加游戏 ====================
function setupDropZone() {
  const dropZone = document.getElementById('drop-zone');
  
  // 阻止默认拖放行为
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
  
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
    
    // 获取拖放的文件
    let filePath = null;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      filePath = e.dataTransfer.files[0].path;
    } else {
      // 尝试从 dataTransfer.items 获取
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const entry = items[0].webkitGetAsEntry();
        if (entry) {
          filePath = e.dataTransfer.getData('text/plain') || items[0].getAsFile()?.path;
        }
      }
    }
    
    // 如果没有获取到路径，尝试其他方式
    if (!filePath && e.dataTransfer.getData('text/plain')) {
      filePath = e.dataTransfer.getData('text/plain');
    }
    
    if (filePath) {
      const ext = filePath.toLowerCase();
      if (ext.endsWith('.exe') || ext.endsWith('.bat')) {
        const result = await ipcRenderer.invoke('drop-game', filePath);
        if (result.success) {
          openAddGameModalWithData(result.data);
        } else {
          alert(result.error);
        }
      } else {
        alert('只支持 exe 或 bat 文件');
      }
    }
  });
}

// ==================== 添加游戏弹窗 ====================
let pendingGameData = null;

function setupModals() {
  document.getElementById('add-game-btn').addEventListener('click', () => {
    pendingGameData = null;
    openAddGameModal();
  });
}

function openAddGameModal() {
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('game-name').value = '';
  document.getElementById('game-type').value = 'galgame';
  document.getElementById('game-exe-path').value = '';
  document.getElementById('game-save-path').value = '';
}

function openAddGameModalWithData(data) {
  pendingGameData = data;
  document.getElementById('add-game-modal').classList.add('active');
  document.getElementById('game-name').value = data.name;
  document.getElementById('game-type').value = data.type;
  document.getElementById('game-exe-path').value = data.exePath;
}

function closeAddGameModal() {
  document.getElementById('add-game-modal').classList.remove('active');
  pendingGameData = null;
}

async function selectGameExe() {
  const path = await ipcRenderer.invoke('select-file', [
    { name: 'Executable/Batch', extensions: ['exe', 'bat'] }
  ]);
  if (path) {
    document.getElementById('game-exe-path').value = path;
  }
}

async function selectSaveFolder() {
  const path = await ipcRenderer.invoke('select-folder');
  if (path) {
    document.getElementById('game-save-path').value = path;
  }
}

async function confirmAddGame() {
  const name = document.getElementById('game-name').value.trim();
  const type = document.getElementById('game-type').value;
  const exePath = document.getElementById('game-exe-path').value;
  const savePath = document.getElementById('game-save-path').value;
  
  if (!name || !exePath) {
    alert('请填写游戏名称和程序文件');
    return;
  }
  
  const game = {
    name,
    type,
    exePath,
    savePath,
    folderPath: pendingGameData ? pendingGameData.folderPath : require('path').dirname(exePath),
    image: null
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

async function deleteGame(gameId) {
  if (!confirm('确定要删除这个游戏吗？')) return;
  
  const result = await ipcRenderer.invoke('delete-game', gameId);
  if (result.success) {
    games = games.filter(g => g.id !== gameId);
    renderGames();
  }
}

async function selectGameImage(gameId) {
  const path = await ipcRenderer.invoke('select-image');
  if (path) {
    const newPath = await ipcRenderer.invoke('copy-image', path, gameId);
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

async function openGameFolder(gameId) {
  const game = games.find(g => g.id === gameId);
  if (game) {
    await ipcRenderer.invoke('open-folder', game.folderPath);
  }
}

async function openSaveFolder(gameId) {
  const game = games.find(g => g.id === gameId);
  if (game && game.savePath) {
    await ipcRenderer.invoke('open-folder', game.savePath);
  } else {
    alert('未设置存档文件夹');
  }
}

async function launchGame(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) return;
  
  let useLocale = false;
  if (game.type === 'galgame') {
    useLocale = settings.defaultGalMode === 'locale';
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

async function launchWithTranslator(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) return;
  
  if (settings.translatorTool) {
    await ipcRenderer.invoke('launch-program', {
      exePath: settings.translatorTool,
      useLocale: false,
      localeEmulatorPath: ''
    });
  }
  
  setTimeout(async () => {
    let useLocale = settings.defaultGalMode === 'locale';
    await ipcRenderer.invoke('launch-program', {
      exePath: game.exePath,
      useLocale,
      localeEmulatorPath: settings.localeEmulator
    });
  }, 1000);
}

// ==================== 攻略编辑器 ====================
async function openGuide(gameId) {
  currentGuideGameId = gameId;
  const savedGuide = await ipcRenderer.invoke('get-guide', gameId);
  
  if (savedGuide) {
    guideData = savedGuide;
  } else {
    guideData = {
      nodes: [],
      connections: []
    };
  }
  
  initGuideEditor();
  document.getElementById('guide-modal').classList.add('active');
}

function closeGuideModal() {
  saveGuide();
  document.getElementById('guide-modal').classList.remove('active');
  currentGuideGameId = null;
  guideData = { nodes: [], connections: [] };
}

async function saveGuide() {
  if (currentGuideGameId) {
    await ipcRenderer.invoke('save-guide', currentGuideGameId, guideData);
  }
}

function initGuideEditor() {
  const container = document.getElementById('guide-flow-container');
  container.innerHTML = '';
  
  // 创建 SVG 层
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
  
  // 创建节点容器
  const nodesContainer = document.createElement('div');
  nodesContainer.id = 'nodes-container';
  nodesContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 3000px; height: 3000px; z-index: 2;';
  container.appendChild(nodesContainer);
  
  // 渲染所有节点
  guideData.nodes.forEach(node => renderGuideNode(node));
  
  // 渲染所有连接
  renderGuideConnections();
  
  // 绑定容器事件
  container.addEventListener('mousemove', handleContainerMouseMove);
  container.addEventListener('mouseup', handleContainerMouseUp);
  container.addEventListener('click', (e) => {
    if (e.target === container || e.target === svg) {
      deselectAllNodes();
    }
  });
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
    outputs: type === 'single' ? ['出口'] : (type === 'multi-in' ? ['出口'] : ['出口1', '出口2'])
  };
  
  guideData.nodes.push(node);
  renderGuideNode(node);
  saveGuide();
}

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
  
  nodeEl.innerHTML = `
    <div class="node-header" onmousedown="startNodeDrag(event, '${node.id}')">
      <span class="node-type-icon">${typeLabel}</span>
      <input type="text" class="node-title-input" value="${node.title}" 
             onchange="updateNodeTitle('${node.id}', this.value)"
             onclick="event.stopPropagation()">
      <button class="node-delete-btn" onclick="deleteGuideNode('${node.id}')">&times;</button>
    </div>
    <div class="node-ports">
      ${node.inputs.map((input, i) => `
        <div class="port-row">
          <div class="port-handle input" 
               data-node="${node.id}" data-port="${i}" data-type="input"
               onmousedown="startConnection(event, '${node.id}', ${i}, 'input')"></div>
          <input type="text" class="port-label-input" value="${input}"
                 onchange="updatePortLabel('${node.id}', 'input', ${i}, this.value)"
                 onclick="event.stopPropagation()">
          ${node.type !== 'single' && i === node.inputs.length - 1 ? `
            <button class="port-add-btn" onclick="addPort('${node.id}', 'input')">+</button>
          ` : ''}
          ${node.inputs.length > 1 ? `<button class="port-remove-btn" onclick="removePort('${node.id}', 'input', ${i})">-</button>` : ''}
        </div>
      `).join('')}
      ${node.outputs.map((output, i) => `
        <div class="port-row">
          <div class="port-handle output" 
               data-node="${node.id}" data-port="${i}" data-type="output"
               onmousedown="startConnection(event, '${node.id}', ${i}, 'output')"></div>
          <input type="text" class="port-label-input" value="${output}"
                 onchange="updatePortLabel('${node.id}', 'output', ${i}, this.value)"
                 onclick="event.stopPropagation()">
          ${node.type !== 'single' && i === node.outputs.length - 1 ? `
            <button class="port-add-btn" onclick="addPort('${node.id}', 'output')">+</button>
          ` : ''}
          ${node.outputs.length > 1 ? `<button class="port-remove-btn" onclick="removePort('${node.id}', 'output', ${i})">-</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
  
  container.appendChild(nodeEl);
}

function startNodeDrag(e, nodeId) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
  
  e.preventDefault();
  e.stopPropagation();
  
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  selectedNode = node;
  isDraggingNode = true;
  
  const nodeEl = document.getElementById(nodeId);
  dragOffset.x = e.clientX - nodeEl.getBoundingClientRect().left;
  dragOffset.y = e.clientY - nodeEl.getBoundingClientRect().top;
  
  // 高亮选中节点
  document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('selected'));
  nodeEl.classList.add('selected');
}

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
    
    // 实时更新连接线
    renderGuideConnections();
  }
  
  if (isConnecting && connectionStart) {
    updateTempConnection(e);
  }
}

function handleContainerMouseUp(e) {
  if (isDraggingNode) {
    isDraggingNode = false;
    selectedNode = null;
    saveGuide();
  }
}

function deselectAllNodes() {
  document.querySelectorAll('.flow-node').forEach(el => el.classList.remove('selected'));
}

function updateNodeTitle(nodeId, title) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    node.title = title;
    saveGuide();
  }
}

function updatePortLabel(nodeId, portType, index, label) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (node) {
    if (portType === 'input') {
      node.inputs[index] = label;
    } else {
      node.outputs[index] = label;
    }
    saveGuide();
  }
}

function addPort(nodeId, portType) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  if (portType === 'input') {
    node.inputs.push(`入口${node.inputs.length + 1}`);
  } else {
    node.outputs.push(`出口${node.outputs.length + 1}`);
  }
  
  // 重新渲染节点
  const nodeEl = document.getElementById(nodeId);
  nodeEl.remove();
  renderGuideNode(node);
  renderGuideConnections();
  saveGuide();
}

function removePort(nodeId, portType, index) {
  const node = guideData.nodes.find(n => n.id === nodeId);
  if (!node) return;
  
  // 删除相关连接
  if (portType === 'input') {
    guideData.connections = guideData.connections.filter(c => !(c.toNode === nodeId && c.toPort === index));
    // 调整其他连接的端口索引
    guideData.connections.forEach(c => {
      if (c.toNode === nodeId && c.toPort > index) {
        c.toPort--;
      }
    });
    node.inputs.splice(index, 1);
  } else {
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

function createBezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// 绑定端口mouseup事件来完成连接
document.addEventListener('mouseup', (e) => {
  if (isConnecting && connectionStart) {
    // 检查是否落在输入端口上
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.classList.contains('port-handle') && target.dataset.type === 'input') {
      const toNodeId = target.dataset.node;
      const toPortIndex = parseInt(target.dataset.port);
      
      if (toNodeId !== connectionStart.nodeId) {
        // 创建连接
        const connection = {
          fromNode: connectionStart.nodeId,
          fromPort: connectionStart.portIndex,
          toNode: toNodeId,
          toPort: toPortIndex
        };
        
        // 检查是否已存在
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
    
    // 清除临时连接
    isConnecting = false;
    connectionStart = null;
    const tempPath = document.getElementById('temp-connection');
    if (tempPath) tempPath.style.display = 'none';
  }
});

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

function deleteConnection(index) {
  if (!confirm('删除这条连接线？')) return;
  guideData.connections.splice(index, 1);
  renderGuideConnections();
  saveGuide();
}

function clearGuide() {
  if (!confirm('确定要清空所有节点吗？')) return;
  
  guideData.nodes = [];
  guideData.connections = [];
  
  const container = document.getElementById('nodes-container');
  if (container) container.innerHTML = '';
  
  renderGuideConnections();
  saveGuide();
}
