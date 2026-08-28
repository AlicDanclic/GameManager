/**
 * @file toast.js
 * @module toast
 * @description Toast 弹窗反馈系统：完全自包含（IIFE），不依赖 GMState / gameAPI 等业务模块。
 *             对外暴露 window.showToast / window.dismissToast / window.dismissAllToasts。
 *             特性：可见上限 + FIFO 等待队列、同消息去重聚合、悬停暂停、模态框/全屏避让、
 *             操作按钮（如撤销）、纯 transform/opacity 合成器动画。
 * @author EternoPax
 * @since 2026/8/28
 */
// toast.js
// Toast 弹窗反馈系统：完全自包含（IIFE），不依赖 GMState / gameAPI 等业务模块
// 对外暴露：window.showToast / window.dismissToast / window.dismissAllToasts
// 特性：可见上限 + FIFO 等待队列、同消息去重聚合、悬停暂停、模态框/全屏避让、
//       操作按钮（如撤销）、纯 transform/opacity 合成器动画
(function () {
  'use strict';

  const MAX_VISIBLE = 3;
  const DEDUPE_WINDOW = 1500; // ms，同消息在此窗口内聚合
  const DEFAULT_DURATIONS = { success: 3000, error: Infinity, warning: 6000, info: 3000 };
  const TYPES = ['success', 'error', 'warning', 'info'];
  // 图标使用内联 SVG（stroke 继承 currentColor，随类型色条配色），不依赖系统 emoji 字体
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L2.5 20h19L12 3z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 11v5"/><path d="M12 8v.01"/></svg>'
  };

  let container = null;
  let visibleQueue = []; // 当前展示中的 Toast（最多 MAX_VISIBLE 个）
  let waitingQueue = []; // FIFO 等待队列
  let dedupeMap = new Map(); // key: message/dedupeKey -> { count, firstTime, originalMessage, toastInstance }
  let observer = null;

  /* ==================== 初始化 ==================== */

  function initToastContainer() {
    if (container || !document.body) return;
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);

    // 监听任何元素的 class 变化（模态框 .active 切换），动态切换避让态
    observer = new MutationObserver(updateDimmed);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('fullscreenchange', updateDimmed);
    updateDimmed();
  }

  function updateDimmed() {
    if (!container) return;
    const hasModal = !!document.querySelector('.modal.active');
    const isFullscreen = !!document.fullscreenElement;
    container.classList.toggle('dimmed', hasModal || isFullscreen);
  }

  /* ==================== 去重 ==================== */

  function getDedupeKey(message, dedupeKey) {
    return dedupeKey || message;
  }

  // 返回 { deduped, instance, key }；deduped=true 表示已并入现有 Toast，无需新渲染
  function handleDedupe(message, type, dedupeKey) {
    const key = getDedupeKey(message, dedupeKey);
    const now = Date.now();
    const entry = dedupeMap.get(key);

    if (entry && now - entry.firstTime < DEDUPE_WINDOW) {
      entry.count++;
      const inst = entry.toastInstance;
      if (inst && inst.element && entry.count >= 5) {
        inst.message = `${entry.originalMessage}（共 ${entry.count} 个）`;
        const msgEl = inst.element.querySelector('.toast-message');
        if (msgEl) msgEl.textContent = inst.message;
        // 重置定时器；error 为永久类型则不重置（保持常驻，需手动关闭）
        if (inst.duration !== Infinity) startTimer(inst);
      }
      return { deduped: true, instance: inst, key };
    }

    dedupeMap.set(key, { count: 1, firstTime: now, originalMessage: message, toastInstance: null });
    return { deduped: false, instance: null, key };
  }

  /* ==================== 渲染 ==================== */

  function renderToast(instance) {
    const el = document.createElement('div');
    el.className = `toast-item toast-${instance.type}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', instance.type === 'error' ? 'assertive' : 'polite');

    const iconEl = document.createElement('span');
    iconEl.className = 'toast-icon';
    // 静态内置 SVG（非用户输入），innerHTML 渲染无 XSS 风险
    iconEl.innerHTML = ICONS[instance.type] || ICONS.info;

    const contentEl = document.createElement('div');
    contentEl.className = 'toast-content';

    const msgEl = document.createElement('div');
    msgEl.className = 'toast-message';
    msgEl.textContent = instance.message; // 纯文本渲染，规避 XSS

    contentEl.appendChild(msgEl);

    if (instance.actions && instance.actions.length) {
      const actionsEl = document.createElement('div');
      actionsEl.className = 'toast-actions';
      instance.actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'toast-action-btn';
        btn.textContent = action.label;
        btn.addEventListener('click', () => {
          try {
            if (typeof action.callback === 'function') action.callback(instance);
          } catch (e) {
            console.error('toast action 回调执行失败:', e);
          }
          dismiss(instance.id, true);
        });
        actionsEl.appendChild(btn);
      });
      contentEl.appendChild(actionsEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close-btn';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => dismiss(instance.id, true));

    el.appendChild(iconEl);
    el.appendChild(contentEl);
    el.appendChild(closeBtn);

    // 悬停暂停 / 移出恢复
    el.addEventListener('mouseenter', () => pauseTimer(instance));
    el.addEventListener('mouseleave', () => resumeTimer(instance));

    // 点击本体：关闭按钮与操作按钮已单独绑定，其余区域触发 onClick
    el.addEventListener('click', (e) => {
      if (e.target === closeBtn || e.target.closest('.toast-action-btn')) return;
      if (typeof instance.onClick === 'function') {
        try {
          instance.onClick(instance);
        } catch (err) {
          console.error('toast onClick 回调执行失败:', err);
        }
      }
    });

    // 右键复制消息文本
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(instance.message).catch(() => {});
      }
    });

    instance.element = el;
    container.appendChild(el);
    // 下一帧添加 visible 触发入场动画
    requestAnimationFrame(() => {
      if (el.isConnected) el.classList.add('visible');
    });
  }

  /* ==================== 队列调度 ==================== */

  function shiftQueue() {
    while (visibleQueue.length < MAX_VISIBLE && waitingQueue.length > 0) {
      const instance = waitingQueue.shift();
      visibleQueue.push(instance);
      renderToast(instance);
      const entry = dedupeMap.get(getDedupeKey(instance.originalMessage, instance.dedupeKey));
      if (entry) entry.toastInstance = instance;
      startTimer(instance);
    }
  }

  /* ==================== 定时器控制 ==================== */

  function startTimer(instance) {
    if (instance.duration === Infinity) return;
    if (instance.timer) clearTimeout(instance.timer);
    instance.remainingTime = instance.duration;
    instance.startTime = Date.now();
    instance.timer = setTimeout(() => dismiss(instance.id, false), instance.remainingTime);
  }

  function pauseTimer(instance) {
    if (instance.duration === Infinity || !instance.timer) return;
    clearTimeout(instance.timer);
    instance.timer = null;
    instance.remainingTime -= Date.now() - instance.startTime;
  }

  function resumeTimer(instance) {
    if (instance.duration === Infinity || instance.timer) return;
    if (instance.remainingTime <= 0) {
      dismiss(instance.id, false);
      return;
    }
    instance.startTime = Date.now();
    instance.timer = setTimeout(() => dismiss(instance.id, false), instance.remainingTime);
  }

  /* ==================== 关闭 ==================== */

  function removeFromDedupe(instance) {
    for (const [key, entry] of dedupeMap) {
      if (entry.toastInstance === instance) {
        dedupeMap.delete(key);
        break;
      }
    }
  }

  function callOnDismiss(instance, isManual) {
    if (typeof instance.onDismiss === 'function') {
      try {
        instance.onDismiss(isManual);
      } catch (e) {
        console.error('toast onDismiss 回调执行失败:', e);
      }
    }
  }

  function dismiss(id, isManual) {
    const visIdx = visibleQueue.findIndex(t => t.id === id);
    const instance = visIdx !== -1 ? visibleQueue[visIdx] : waitingQueue.find(t => t.id === id);
    if (!instance || instance.dismissed) return;
    instance.dismissed = true;

    if (instance.timer) {
      clearTimeout(instance.timer);
      instance.timer = null;
    }
    removeFromDedupe(instance);

    // 尚未进入可见队列（等待中）：直接移除，无需动画
    if (visIdx === -1) {
      const wIdx = waitingQueue.indexOf(instance);
      if (wIdx !== -1) waitingQueue.splice(wIdx, 1);
      callOnDismiss(instance, isManual);
      shiftQueue();
      return;
    }

    const el = instance.element;
    const finish = () => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      const i = visibleQueue.indexOf(instance);
      if (i !== -1) visibleQueue.splice(i, 1);
      callOnDismiss(instance, isManual);
      shiftQueue();
    };

    if (!el || !el.isConnected) {
      finish();
      return;
    }

    let done = false;
    const cleanup = () => {
      el.removeEventListener('transitionend', onEnd);
      clearTimeout(fallbackTimer);
    };
    const onEnd = (e) => {
      // 只等 transform 过渡结束（0.3s 最晚），避免被子元素/opacity 过渡提前截断
      if (e.propertyName !== 'transform') return;
      if (done) return;
      done = true;
      cleanup();
      finish();
    };
    el.addEventListener('transitionend', onEnd);
    const fallbackTimer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      finish();
    }, 400);

    // 强制触发退场动画（重新排版过渡）
    void el.offsetWidth;
    el.classList.add('removing');
  }

  /* ==================== 对外 API ==================== */

  /**
   * 显示一条 Toast
   * @param {string} message 文本内容（纯文本渲染）
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {Object} [options]
   * @param {number} [options.duration] 覆盖默认时长（error 类型强制永久，忽略此值）
   * @param {{label: string, callback: Function}} [options.action] “撤销”等操作按钮
   * @param {Function} [options.onClick] 点击 Toast 本体触发
   * @param {Function} [options.onDismiss] 关闭时触发，参数为 isManual（是否手动关闭）
   * @param {string} [options.dedupeKey] 去重分组键，默认使用 message
   * @returns {string} Toast id
   */
  window.showToast = function showToast(message, type = 'info', options = {}) {
    initToastContainer();
    if (!TYPES.includes(type)) type = 'info';

    // error 类型强制永久显示（需手动关闭）
    const duration = type === 'error' ? Infinity : (typeof options.duration === 'number' && options.duration > 0
      ? options.duration
      : DEFAULT_DURATIONS[type]);

    const dedupeResult = handleDedupe(message, type, options.dedupeKey);
    if (dedupeResult.deduped) {
      // 已并入现有 Toast：返回其 id，方便调用方后续 dismiss
      return dedupeResult.instance ? dedupeResult.instance.id : '';
    }

    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const instance = {
      id,
      message,
      originalMessage: message,
      dedupeKey: options.dedupeKey || null,
      type,
      duration,
      element: null,
      timer: null,
      remainingTime: duration,
      startTime: 0,
      isPaused: false,
      dismissed: false,
      actions: options.action ? [options.action] : [],
      onClick: typeof options.onClick === 'function' ? options.onClick : null,
      onDismiss: typeof options.onDismiss === 'function' ? options.onDismiss : null
    };

    if (visibleQueue.length < MAX_VISIBLE) {
      visibleQueue.push(instance);
      renderToast(instance);
      const entry = dedupeMap.get(getDedupeKey(message, options.dedupeKey));
      if (entry) entry.toastInstance = instance;
      startTimer(instance);
    } else {
      waitingQueue.push(instance);
    }
    return id;
  };

  /**
   * 根据 id 手动关闭指定 Toast（视为手动关闭）
   * @param {string} id
   */
  window.dismissToast = function dismissToast(id) {
    dismiss(id, true);
  };

  /**
   * 紧急关闭全部 Toast（应用退出前清理），不触发 onDismiss
   */
  window.dismissAllToasts = function dismissAllToasts() {
    [...visibleQueue, ...waitingQueue].forEach(instance => {
      if (instance.timer) clearTimeout(instance.timer);
      if (instance.element && instance.element.parentNode) {
        instance.element.parentNode.removeChild(instance.element);
      }
    });
    visibleQueue = [];
    waitingQueue = [];
    dedupeMap.clear();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
  };

  // 页面卸载前清理，防止定时器与 DOM 泄漏
  window.addEventListener('beforeunload', window.dismissAllToasts);

  // 容器懒初始化：脚本位于 body 底部，直接初始化即可；早于 DOM 构建时等 DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initToastContainer);
  } else {
    initToastContainer();
  }
})();
