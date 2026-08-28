/**
 * @fileoverview 进程列表工具模块
 * @description 提供跨平台的"获取运行中进程完整路径"能力，用于游戏运行状态检测：
 *              - 普通 exe：主进程直接持有子进程引用，监听 exit 精确判断
 *              - 转区 / bat：subprocess 拿到的是 LEProc / cmd，不代表游戏本体，
 *                因此改用系统进程列表按 exePath 完整路径匹配做兜底扫描。
 *              平台实现：Windows 用 PowerShell (Get-CimInstance Win32_Process)，
 *              Linux 遍历 /proc/[pid]/exe，macOS 用 `ps -o comm`。
 * @module process-util
 * @author EternoPax
 */

const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * 归一化路径：Windows 忽略大小写（进程/文件系统均不敏感），其余平台保持原样。
 * 用于进程路径与游戏 exePath 的一致性比较。
 * @param {string} p - 待归一化路径
 * @returns {string} 归一化后的路径
 */
function normalizePath(p) {
  if (process.platform === 'win32') return path.resolve(p).toLowerCase();
  return path.resolve(p);
}

/**
 * 获取 Linux 下所有运行中进程的可执行文件完整路径。
 * 遍历 /proc/[pid]/exe（符号链接指向真实可执行文件），权限不足或内核线程自动忽略。
 * @returns {Promise<string[]>} 进程可执行路径数组
 */
async function getLinuxProcessPaths() {
  const paths = [];
  let pids;
  try {
    pids = await fs.readdir('/proc');
  } catch {
    return paths;
  }
  for (const pid of pids) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const exe = await fs.readlink(`/proc/${pid}/exe`);
      // 可能带 " (deleted)" 后缀（已删除但仍运行的进程），裁剪掉以便匹配
      paths.push(normalizePath(exe.replace(/ \(deleted\)$/, '')));
    } catch {
      // 无读取权限（EACCES）或该 pid 已退出，忽略
    }
  }
  return paths;
}

/**
 * 获取 Windows 下所有运行中进程的可执行文件完整路径。
 * 使用 PowerShell 的 Get-CimInstance Win32_Process（Win11/10 通用），
 * 仅为可读 ExecutablePath 的进程返回路径。
 * @returns {Promise<string[]>} 进程可执行路径数组
 */
async function getWindowsProcessPaths() {
  const script =
    'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ' +
    'ForEach-Object { $_.ExecutablePath }';
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => normalizePath(p));
  } catch (error) {
    console.error('[process-util] Windows 进程列表获取失败:', error.message);
    return [];
  }
}

/**
 * 获取 macOS 下所有运行中进程的可执行文件完整路径。
 * `ps ... -o comm` 对大多数程序返回完整路径。
 * @returns {Promise<string[]>} 进程可执行路径数组
 */
async function getMacProcessPaths() {
  try {
    const { stdout } = await execFileAsync('ps', ['-ax', '-o', 'comm='], { maxBuffer: 1024 * 1024 * 8 });
    return stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => normalizePath(p));
  } catch (error) {
    console.error('[process-util] macOS 进程列表获取失败:', error.message);
    return [];
  }
}

/**
 * 获取当前平台上所有运行中进程的可执行文件完整路径。
 * @returns {Promise<string[]>} 归一化后的进程路径数组
 */
async function getRunningProcessPaths() {
  if (process.platform === 'win32') return getWindowsProcessPaths();
  if (process.platform === 'linux') return getLinuxProcessPaths();
  if (process.platform === 'darwin') return getMacProcessPaths();
  return [];
}

/**
 * 判断指定游戏可执行文件是否正在运行。
 * 按完整路径匹配（忽略 Windows 大小写），避免同名 exe 误判。
 * @param {string} exePath - 游戏可执行文件路径
 * @returns {Promise<boolean>} 是否在运行
 */
async function isProcessRunning(exePath) {
  if (!exePath || typeof exePath !== 'string') return false;
  const target = normalizePath(exePath);
  const running = await getRunningProcessPaths();
  return running.includes(target);
}

module.exports = {
  getRunningProcessPaths,
  isProcessRunning,
  normalizePath
};
