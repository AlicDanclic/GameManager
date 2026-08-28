/**
 * 环境检查脚本
 * @description 验证 Node.js 版本与依赖完整性，运行方式：npm run check
 */
const REQUIRED_NODE_MAJOR = 16;

function main() {
  console.log('=== Game Manager 环境检查 ===');

  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < REQUIRED_NODE_MAJOR) {
    console.error(`[✗] Node.js 版本过低：当前 v${process.versions.node}，需要 >= ${REQUIRED_NODE_MAJOR}`);
    process.exit(1);
  }
  console.log(`[✓] Node.js v${process.versions.node}`);

  const deps = ['electron', 'electron-builder', 'fs-extra', 'archiver'];
  let ok = true;
  for (const dep of deps) {
    try {
      require.resolve(dep);
      console.log(`[✓] 依赖 ${dep} 已安装`);
    } catch {
      console.error(`[✗] 依赖 ${dep} 未安装，请先执行 npm install`);
      ok = false;
    }
  }

  if (!ok) process.exit(1);
  console.log('=== 检查通过，可执行 npm start 启动应用 ===');
}

main();
