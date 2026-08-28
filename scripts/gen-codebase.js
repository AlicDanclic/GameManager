/**
 * 代码文档生成器
 * @description 扫描项目源码，生成 docs/CODEBASE.md（含目录架构与全部源码）。
 *              代码变更后可重新运行：node scripts/gen-codebase.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'CODEBASE.md');

const EXCLUDE_DIRS = new Set(['node_modules', 'archive', 'Change', '.git', 'dist']);
const EXCLUDE_FILES = new Set(['package-lock.json']);

/**
 * 生成标准树形目录（排除 node_modules / archive 等）
 * @param {string} dir
 * @param {string} prefix
 * @returns {string[]}
 */
function buildTree(dir, prefix = '') {
  const lines = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !EXCLUDE_DIRS.has(e.name) && !EXCLUDE_FILES.has(e.name) && e.name !== 'CODEBASE.md')
    .sort((a, b) => {
      // 目录在前，文件在后，按名称排序
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

  entries.forEach((entry, i) => {
    const full = path.join(dir, entry.name);
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    lines.push(prefix + connector + entry.name);
    if (entry.isDirectory()) {
      lines.push(...buildTree(full, prefix + (isLast ? '    ' : '│   ')));
    }
  });
  return lines;
}

/**
 * 各文件用途说明（生成文档的锚点顺序）
 * @type {Array<{path: string, desc: string}>}
 */
const FILE_ORDER = [
  // 主进程
  { path: 'main/main.js', desc: '主进程入口：窗口创建（安全 webPreferences）、应用生命周期、系统托盘' },
  { path: 'main/ipc.js', desc: '全部 IPC 处理器：数据持久化、程序启动、打包删除、安全读取接口' },
  { path: 'main/menu.js', desc: '原生应用菜单配置（macOS 快捷键支持）' },
  // 预加载
  { path: 'preload/preload.js', desc: '安全 API 桥：contextBridge 暴露白名单化 gameAPI（invoke/send/on）' },
  // 渲染层脚本
  { path: 'src/js/state.js', desc: '共享状态（window.GMState），各模块在 IIFE 内局部引用' },
  { path: 'src/js/icons.js', desc: '内联 SVG 图标加载（read-icon IPC），保持 CSS currentColor 控制' },
  { path: 'src/js/window-control.js', desc: '窗口控制：最小化 / 最大化 / 关闭' },
  { path: 'src/js/navigation.js', desc: '侧边栏导航切换' },
  { path: 'src/js/settings.js', desc: '设置管理：加载/保存设置、工具按钮显隐、工具启动、路径选择' },
  { path: 'src/js/arm-confirm.js', desc: '防误触通用组件：长按蓄力确认（Idle→Arming(1.5s)→Ready→松开触发），事件委托监听 data-arm/data-id/data-ready-label' },
  { path: 'src/js/game-core.js', desc: '游戏管理核心：卡片渲染、启动、删除、封面、打开文件夹、编辑' },
  { path: 'src/js/game-modal.js', desc: '添加/编辑游戏弹窗逻辑（folderPath 由主进程自动推导）' },
  { path: 'src/js/game-drop.js', desc: '拖放添加游戏（exe/bat）' },
  { path: 'src/js/guide-editor.js', desc: '节点式攻略编辑器：节点/连线渲染、导入导出、上游高亮' },
  { path: 'src/js/pack-delete.js', desc: '游戏打包与源文件删除' },
  { path: 'src/js/main.js', desc: '渲染进程引导入口：初始化编排 + 打包进度监听' },
  // 页面
  { path: 'public/index.html', desc: '渲染入口页面（CSP、样式/脚本按依赖顺序引入）' },
  // 样式
  { path: 'src/styles/variables.css', desc: 'CSS 设计变量（颜色、间距、字体）' },
  { path: 'src/styles/base.css', desc: '基础样式（reset、全局元素）' },
  { path: 'src/styles/layout.css', desc: '布局：侧边栏、主内容区、页面结构' },
  { path: 'src/styles/components.css', desc: '组件样式：按钮、卡片、弹窗、状态图标、空状态、长按蓄力(arm)状态/进度条样式' },
  { path: 'src/styles/pages.css', desc: '页面级样式：游戏库页、设置页' },
  { path: 'src/styles/guide-editor.css', desc: '攻略编辑器样式：节点、端口、连线、SVG 画布' },
  { path: 'src/styles/utilities.css', desc: '工具类样式' },
  { path: 'src/styles/main.css', desc: '样式入口：按顺序 @import 全部模块' },
  // 构建与脚本
  { path: 'build/electron-builder.yml', desc: 'electron-builder 打包配置（路径相对项目根解析）' },
  { path: 'build/installer.nsh', desc: 'NSIS 安装脚本扩展（可选）' },
  { path: 'scripts/check-env.js', desc: '环境检查脚本（npm run check）' },
  { path: 'scripts/smoke.js', desc: '无头冒烟测试：加载真实页面 + preload 验证初始化' },
  { path: 'scripts/gen-codebase.js', desc: '本文档生成器（node scripts/gen-codebase.js）' },
  // 配置文件
  { path: 'package.json', desc: '依赖定义与 npm 脚本（入口 main/main.js）' },
  { path: 'start.bat', desc: 'Windows 快速启动脚本' },
];

function detectLang(file) {
  if (file.endsWith('.js')) return 'js';
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.html')) return 'html';
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return 'yaml';
  if (file.endsWith('.json')) return 'json';
  if (file.endsWith('.nsh')) return 'nsis';
  if (file.endsWith('.bat')) return 'bat';
  return '';
}

function buildDoc() {
  const lines = [];
  lines.push('# Game Manager 代码文档');
  lines.push('');
  lines.push('> 本文档由 `scripts/gen-codebase.js` 自动生成，涵盖项目目录架构与全部源码，便于离线阅读与修改。');
  lines.push('> 代码变更后请重新运行 `node scripts/gen-codebase.js` 以保持同步。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 目录架构');
  lines.push('');
  lines.push('```text');
  lines.push('GameManager/');
  lines.push(...buildTree(ROOT));
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 文件清单与完整源码');
  lines.push('');
  lines.push('> 按加载/依赖顺序排列：主进程 → preload → 渲染层脚本 → 页面/样式 → 构建/脚本。');
  lines.push('');

  for (const item of FILE_ORDER) {
    const full = path.join(ROOT, item.path);
    if (!fs.existsSync(full)) {
      lines.push(`### ⚠️ ${item.path}`);
      lines.push('');
      lines.push('*文件不存在*');
      lines.push('');
      continue;
    }
    lines.push(`### 📄 \`${item.path}\``);
    lines.push('');
    lines.push(`**用途**：${item.desc}`);
    lines.push('');
    const lang = detectLang(item.path);
    const content = fs.readFileSync(full, 'utf8').replace(/\n$/, '');
    lines.push('```' + lang);
    lines.push(content);
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## 修改指南');
  lines.push('');
  lines.push('| 想改什么 | 改哪个文件 |');
  lines.push('| --- | --- |');
  lines.push('| 窗口大小 / 无边框 / 安全选项 | `main/main.js`（createWindow 的 BrowserWindow 配置） |');
  lines.push('| 新增 IPC 接口 | `main/ipc.js` 注册 handler + `preload/preload.js` 加入白名单 + 渲染层调用 `window.gameAPI` |');
  lines.push('| 界面布局与配色 | `src/styles/`（颜色变量在 `variables.css`） |');
  lines.push('| 页面结构 / 按钮 | `public/index.html` |');
  lines.push('| 游戏卡片操作逻辑 | `src/js/game-core.js` |');
  lines.push('| 长按蓄力防误触按钮 | 组件见 `src/js/arm-confirm.js`；按钮加 `data-arm="动作函数"` + `data-id` + 可选 `data-ready-label`，容器调用 `window.setupArmConfirm(容器)` |');
  lines.push('| 添加/编辑游戏表单 | `src/js/game-modal.js` + `public/index.html` 中弹窗结构 |');
  lines.push('| 攻略编辑器（节点/连线） | `src/js/guide-editor.js` + `src/styles/guide-editor.css` |');
  lines.push('| 打包/删源逻辑 | `main/ipc.js`（pack-game / delete-source-files） |');
  lines.push('| 打包安装包配置 | `build/electron-builder.yml` |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*文档生成时间：' + new Date().toLocaleString('zh-CN') + '*');

  return lines.join('\n');
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, buildDoc(), 'utf8');
console.log(`已生成 ${path.relative(ROOT, OUTPUT)}（${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB）`);
