/**
 * @file arm-confirm.js
 * @module arm-confirm
 * @description 防误触通用组件：对带 data-arm 的元素实施“长按蓄力确认”交互，避免误点
 *              危险操作。通过事件委托在容器上监听指针事件，蓄力满后松开才触发
 *              window 上对应的动作函数（data-arm 指定动作名、data-id 传参）。
 * @author EternoPax
 * @since 2026/8/28
 */
// arm-confirm.js
// 防误触通用组件：长按蓄力确认（Idle -> Arming(1.5s) -> Ready -> 松开触发）。
// 事件委托：在容器上监听指针事件（pointerdown/pointerup/pointercancel/pointerleave，
// 无 PointerEvent 环境回退到 mouse 事件），识别带 data-arm 的元素，
// 通过 data-arm 对应 window 上的动作函数、data-id 传入参数。视觉上以进度条 +
// 变红 + 文字变化反馈；蓄力未满即松开则取消。松开时须仍指向原按钮才触发，
// 防止蓄满后滑开误删。Ready 文案可由 data-ready-label 覆盖，默认“松开以确认”。
// 保留调用方原有的业务逻辑与兜底。
(function () {
  const DURATION = 1500; // 蓄力时长（毫秒）
  let active = null; // { btn, ready, timer }

  // 进度条（注入到按钮内的子元素，绝对定位在底部）
  function ensureProgress(btn) {
    let bar = btn.querySelector(':scope > .arm-progress');
    if (!bar) {
      bar = document.createElement('span');
      bar.className = 'arm-progress';
      btn.appendChild(bar);
    }
    return bar;
  }

  function captureDefaultLabel(btn) {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  }

  function reset() {
    if (!active) return;
    if (active.timer) cancelAnimationFrame(active.timer);
    const btn = active.btn;
    active = null;
    restore(btn);
  }

  function restore(btn) {
    btn.classList.remove('arming', 'ready');
    btn.removeAttribute('data-arm-ready');
    const bar = btn.querySelector(':scope > .arm-progress');
    if (bar) bar.style.width = '0%';
    // 仅在记录过默认文字时恢复（含空字符串），避免 Ready 文案残留
    if (btn.dataset.label != null) btn.textContent = btn.dataset.label;
  }

  function fire(btn) {
    const action = btn.getAttribute('data-arm');
    const id = btn.getAttribute('data-id');
    if (action && typeof window[action] === 'function') {
      window[action](id);
    }
  }

  function setup(container) {
    if (!container || container.__armSetup) return;
    container.__armSetup = true;

    // 优先使用 Pointer Events（统一鼠标/触屏/笔），环境不支持时回退 mouse，保持行为等价。
    const usePointer = typeof window.PointerEvent !== 'undefined';
    const DOWN = usePointer ? 'pointerdown' : 'mousedown';
    const UP = usePointer ? 'pointerup' : 'mouseup';
    // 指针离开容器或系统打断（如触屏来电/手势被接管）时取消蓄力
    const CANCEL_EVENTS = usePointer ? ['pointerleave', 'pointercancel'] : ['mouseleave'];

    container.addEventListener(DOWN, (e) => {
      const btn = e.target.closest('[data-arm]');
      if (!btn || !container.contains(btn)) return;
      e.preventDefault();
      if (active && active.btn !== btn) reset();
      captureDefaultLabel(btn);
      const bar = ensureProgress(btn);
      bar.style.width = '0%';
      btn.classList.add('arming');
      const start = performance.now();
      const tick = (now) => {
        if (!active || active.btn !== btn) return;
        const p = Math.min(1, (now - start) / DURATION);
        bar.style.width = (p * 100).toFixed(1) + '%';
        if (p >= 1) {
          active.ready = true;
          btn.classList.remove('arming');
          btn.classList.add('ready');
          btn.setAttribute('data-arm-ready', '1');
          btn.textContent = btn.dataset.readyLabel || '松开以确认';
          return;
        }
        active.timer = requestAnimationFrame(tick);
      };
      active = { btn, ready: false };
      active.timer = requestAnimationFrame(tick);
    });

    // 松开：若已蓄力完成且仍指向原按钮才触发；滑开再松开视为取消
    container.addEventListener(UP, (e) => {
      if (!active) return;
      const btn = active.btn;
      const ready = active.ready;
      reset();
      const releasedOnBtn = e.target.closest('[data-arm]') === btn;
      if (ready && releasedOnBtn) fire(btn);
    });

    const cancel = () => {
      if (active) reset();
    };
    CANCEL_EVENTS.forEach((ev) => container.addEventListener(ev, cancel));

    // 触屏/触摸板长按时阻止唤起系统右键菜单，让“长按蓄力”不被系统行为打断
    container.addEventListener('contextmenu', (e) => {
      if (e.target.closest('[data-arm]')) e.preventDefault();
    });
  }

  window.setupArmConfirm = setup;
})();
