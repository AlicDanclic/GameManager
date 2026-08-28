# Game Manager

<p align="center">
  <img src="assets/icon.png" alt="Game Manager Logo" width="120" height="120">
</p>

<h3 align="center">🎮 一款优雅、强大的单机游戏管理工具</h3>

<p align="center">
  专为 Galgame、RPG 和 Unity 游戏设计，让游戏库井井有条
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/build-passing-brightgreen?style=flat-square" alt="Build Status"></a>
  <a href="#"><img src="https://img.shields.io/badge/version-0.2.3-blue?style=flat-square" alt="Version"></a>
  <a href="#"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform"></a>
  <a href="#"><img src="https://img.shields.io/badge/Electron-28.0.0-47848f?style=flat-square&logo=electron" alt="Electron"></a>
  <a href="#"><img src="https://img.shields.io/badge/downloads-1k%2Fmonth-orange?style=flat-square" alt="Downloads"></a>
</p>

---

## 📖 目录

- [✨ 功能特性](#-功能特性)
- [🚀 快速开始](#-快速开始)
- [📚 使用指南](#-使用指南)
- [⚙️ 配置说明](#️-配置说明)
- [🔧 运行环境](#-运行环境)
- [🤝 贡献指南](#-贡献指南)
- [📄 许可证](#-许可证)
- [🙏 致谢](#-致谢)

---

## ✨ 功能特性

### 🎯 核心功能

- 🎮 **游戏库管理** — 统一管理所有单机游戏，支持 Galgame、RPG、Unity 三种类型分类
- 📦 **拖放添加游戏** — 直接拖拽 `.exe` 或 `.bat` 文件到界面，快速添加游戏条目
- 🌏 **转区与翻译** — 集成 Locale Emulator 转区启动，支持自动启动翻译工具（如 Luna Translator）
- 🧩 **节点式攻略编辑器** — 可视化编辑游戏攻略流程图，支持节点/连线/标签，导出为 `.gwalk` 格式
- 📦 **游戏打包与备份** — 一键打包游戏文件 + 存档文件 + 攻略数据为 ZIP 压缩包
- 🔍 **搜索与筛选** — 实时搜索游戏名称，按类型筛选，搜索历史自动记录

### 💡 高级功能

- 🔄 **游戏运行状态监控** — 实时检测游戏进程运行状态，防止重复启动
- 📋 **最近游玩记录** — 自动记录启动历史，侧边栏快速重新启动
- 🖼️ **游戏封面管理** — 为每款游戏添加自定义封面图片
- 🗑️ **防误触删除** — 长按蓄力确认删除/删源，避免误操作
- 📂 **快捷访问** — 一键打开游戏文件夹或存档文件夹
- 🎛️ **系统托盘** — 后台运行，点击托盘图标快速显示/隐藏主窗口

### 🔮 未来计划

- [x] 节点式攻略编辑器
- [x] 游戏打包与源文件删除
- [x] 搜索历史与类型筛选持久化
- [ ] 游戏时长统计
- [ ] 云同步与多端数据备份
- [ ] 游戏启动参数自定义
- [ ] 深色/浅色主题切换

---

## 🚀 快速开始

### 📦 前置要求

- **Node.js** >= 16.0.0
- **npm** 或 **yarn** 包管理器
- 支持 **Windows 7+** / **macOS 10.13+** / **Linux**

### 📥 安装步骤

#### 方式一：下载预编译安装包（推荐）

前往 [Releases](https://github.com/AlicDanclic/GameManager/releases) 页面下载对应平台的安装包：

| 平台    | 格式                             |
| ------- | -------------------------------- |
| Windows | `.exe` 安装包 (NSIS)             |
| macOS   | `.dmg` 镜像文件                  |
| Linux   | `.AppImage` / `.deb` / `.tar.gz` |

#### 方式二：从源码运行

```bash
# 克隆仓库
git clone https://github.com/AlicDanclic/GameManager.git
cd GameManager

# 安装依赖
npm install

# 启动应用
npm start
```

#### 方式三：Windows 快速启动

```bash
# 直接双击运行 start.bat
start.bat
```

### 📦 构建安装包

```bash
# 构建当前平台安装包
npm run build

# 构建指定平台
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux
```

---

## 📚 使用指南

### 🎮 添加游戏

1. 点击主界面右上角的 **「+ 添加游戏」** 按钮
2. 填写游戏名称、选择类型（Galgame / RPG / Unity）
3. 浏览选择游戏主程序（`.exe` 或 `.bat`）
4. （可选）设置存档文件夹路径
5. Galgame 可额外勾选「转区启动」和「自动启动翻译工具」
6. 点击「添加」保存

> 💡 **快捷方式**：直接将 `.exe` 或 `.bat` 文件拖拽到应用窗口，自动弹出添加表单并填充信息。

### 🚀 启动游戏

- 点击游戏卡片上的 **「启动」** 按钮
- 若游戏已配置自动翻译，翻译工具将先启动，1 秒后自动启动游戏
- 运行中的游戏卡片会显示绿色边框和 **「● 运行中」** 徽标

### 🗺️ 攻略编辑器

1. 在游戏卡片上点击 **「攻略」** 按钮
2. 使用工具栏添加节点：
   - **一入一出** — 单输入单输出
   - **多入一出** — 多输入单输出
   - **一入多出** — 单输入多输出
3. 从节点右侧 **红色输出端口** 拖拽连线到左侧 **绿色输入端口**
4. 右键点击连线可 **添加/修改/删除标签**
5. 节点标题和端口名称均可 **双击编辑**
6. 支持 **撤销/重做**（Ctrl+Z / Ctrl+Shift+Z）
7. 导出为 `.gwalk` 文件或导入已有攻略

### 📦 打包与备份

点击游戏卡片的 **「打包」** 按钮：

- 自动打包 **游戏文件夹** + **存档文件夹** + **攻略数据** 为 ZIP 压缩包
- 打包进度实时显示
- 适合游戏通关后备份归档

### 🗑️ 删除操作

> ⚠️ **防误触机制**：删除操作采用长按蓄力确认，需持续按住按钮 1.5 秒，进度条走满后方可松开确认。

- **「删除」** — 仅从游戏库移除条目，不删除源文件
- **「删源」** — 永久删除游戏源文件和存档文件夹（需长按确认）

---

## ⚙️ 配置说明

### 设置页面

在侧边栏点击 **「设置」** 进入配置界面：

| 配置项               | 说明                                       | 默认值     |
| -------------------- | ------------------------------------------ | ---------- |
| 翻译工具路径         | 翻译工具 `.exe` 路径（如 Luna Translator） | 空         |
| MTool 路径           | MTool 翻译工具 `.exe` 或 `.bat` 路径       | 空         |
| Locale Emulator 路径 | 转区工具路径（LEProc.exe）                 | 空         |
| 默认启动方式         | Galgame 默认启动方式                       | 不转区启动 |

配置完成后点击 **「保存设置」** 生效。

### 数据存储位置

| 数据     | 路径                            |
| -------- | ------------------------------- |
| 游戏列表 | `~/.game-manager/games.json`    |
| 应用设置 | `~/.game-manager/settings.json` |
| 攻略数据 | `~/.game-manager/guides.json`   |
| 游戏封面 | `~/.game-manager/images/`       |

---

## 🔧 运行环境

| 项目     | 版本要求  |
| -------- | --------- |
| Node.js  | >= 16.0.0 |
| Electron | 28.0.0    |
| 内存     | >= 512MB  |
| 磁盘空间 | >= 100MB  |

### 依赖库

- `electron` — 跨平台桌面应用框架
- `fs-extra` — 增强的文件系统操作
- `archiver` — ZIP 打包压缩

---

## 🤝 贡献指南

欢迎任何形式的贡献！无论是报告 Bug、提交功能建议还是代码贡献。

### 提交流程

1. **Fork** 本仓库到你的 GitHub 账户
2. 在本地创建你的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 **Pull Request**

### 报告问题

请在 [Issues](https://github.com/AlicDanclic/GameManager/issues) 页面提交问题，并尽可能包含：

- 操作系统版本
- 应用版本
- 复现步骤
- 日志截图

### 代码风格

- JavaScript 使用 ES6+ 语法
- CSS 使用语义化类名，遵循 BEM 风格
- 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)

---

## 📄 许可证

本项目采用 **MIT 许可证**，详情请查看 [LICENSE](LICENSE.txt) 文件。

```
MIT License

Copyright (c) 2026 AlicDanclic

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
...
```

---

## 🙏 致谢

- **AlicDanclic** — 项目原作者与核心维护者
- 感谢 [Electron](https://www.electronjs.org/) 团队提供的跨平台桌面框架
- 感谢 [Archiver](https://github.com/archiverjs/node-archiver) 提供的 ZIP 打包支持
- 灵感来自各类游戏管理工具与 Galgame 社区

---

<p align="center">
  <sub>Built with ❤️ for the gaming community</sub>
</p>

<p align="center">
  <a href="https://github.com/AlicDanclic/GameManager">
    <img src="https://img.shields.io/github/stars/AlicDanclic/GameManager?style=social" alt="GitHub stars">
  </a>
  <a href="https://github.com/AlicDanclic/GameManager/network/members">
    <img src="https://img.shields.io/github/forks/AlicDanclic/GameManager?style=social" alt="GitHub forks">
  </a>
  <a href="https://github.com/AlicDanclic/GameManager/watchers">
    <img src="https://img.shields.io/github/watchers/AlicDanclic/GameManager?style=social" alt="GitHub watchers">
  </a>
</p>

<p align="center">
  <b>如果这个项目对你有帮助，请给一个 ⭐️ 支持一下！</b>
</p>
