/**
 * @file navigation.js
 * @module navigation
 * @description 侧边栏导航切换模块：为侧边栏导航项绑定点击事件，在“游戏管理”与
 *              “设置”等页面之间切换激活状态，并联动主内容区域对应页面的显示。
 * @author EternoPax
 * @since 2026/8/28
 */
// navigation.js
// 侧边栏导航切换
(function () {
  /**
   * 初始化侧边栏导航切换。
   * @description 为所有 .nav-item 绑定点击事件，点击时高亮当前项并切换到对应 .page 页面。
   */
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

  window.setupNavigation = setupNavigation;
})();
