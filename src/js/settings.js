/**
 * @file settings.js
 * @module settings
 * @description 设置管理模块：加载/保存设置、根据路径配置控制“MTool/翻译器”按钮显隐、
 *              启动 MTool 与翻译器、选择翻译工具/MTool/转区工具路径。
 * @author EternoPax
 * @since 2026/8/28
 */
// settings.js
// 设置管理：加载/保存设置、工具按钮显隐、工具启动、路径选择
(function () {
  const store = window.GMStore;
  const state = store.state;
  const api = window.gameAPI;

  /**
   * 从主进程加载设置并回填表单，同时刷新工具按钮显隐。
   * @returns {Promise<void>}
   */
  async function loadSettings() {
    const newSettings = await api.invoke('get-settings');
    store.setSettings(newSettings);
    document.getElementById('translator-tool-path').value = state.settings.translatorTool || '';
    document.getElementById('mtool-path').value = state.settings.mtoolPath || '';
    document.getElementById('locale-emulator-path').value = state.settings.localeEmulator || '';
    document.getElementById('default-gal-mode').value = state.settings.defaultGalMode || 'noLocale';
    updateToolButtons();
  }

  function updateToolButtons() {
    const mtoolBtn = document.getElementById('mtool-btn');
    mtoolBtn.style.display = state.settings.mtoolPath ? 'inline-flex' : 'none';
    const translatorBtn = document.getElementById('translator-btn');
    translatorBtn.style.display = state.settings.translatorTool ? 'inline-flex' : 'none';
  }

  async function launchMtool() {
    const result = await api.invoke('launch-mtool');
    if (!result.success) window.showToast('启动 MTool 失败：' + result.error, 'error');
  }

  async function launchTranslator() {
    if (!state.settings.translatorTool) {
      window.showToast('翻译工具路径未配置', 'warning', { duration: 3000 });
      return;
    }
    const result = await api.invoke('launch-program', {
      exePath: state.settings.translatorTool,
      useLocale: false,
      localeEmulatorPath: ''
    });
    if (!result.success) window.showToast('启动翻译器失败：' + result.error, 'error');
  }

  async function selectTranslatorTool() {
    const selectedPath = await api.invoke('select-file', [{ name: 'Executable', extensions: ['exe'] }]);
    if (selectedPath) document.getElementById('translator-tool-path').value = selectedPath;
  }

  async function selectMtoolPath() {
    const selectedPath = await api.invoke('select-file', [{ name: 'Executable/Batch', extensions: ['exe', 'bat'] }]);
    if (selectedPath) document.getElementById('mtool-path').value = selectedPath;
  }

  async function selectLocaleEmulator() {
    const selectedPath = await api.invoke('select-file', [{ name: 'Executable', extensions: ['exe'] }]);
    if (selectedPath) document.getElementById('locale-emulator-path').value = selectedPath;
  }

  /**
   * 收集设置表单值并保存到主进程。
   * @returns {Promise<void>}
   */
  async function saveSettings() {
    const newSettings = {
      translatorTool: document.getElementById('translator-tool-path').value,
      mtoolPath: document.getElementById('mtool-path').value,
      localeEmulator: document.getElementById('locale-emulator-path').value,
      defaultGalMode: document.getElementById('default-gal-mode').value
    };
    store.setSettings(newSettings);
    const result = await api.invoke('save-settings', state.settings);
    if (result.success) {
      window.showToast('设置已保存', 'success', { duration: 2000 });
      updateToolButtons();
    } else {
      window.showToast('保存失败：' + result.error, 'error');
    }
  }

  window.loadSettings = loadSettings;
  window.updateToolButtons = updateToolButtons;
  window.launchMtool = launchMtool;
  window.launchTranslator = launchTranslator;
  window.selectTranslatorTool = selectTranslatorTool;
  window.selectMtoolPath = selectMtoolPath;
  window.selectLocaleEmulator = selectLocaleEmulator;
  window.saveSettings = saveSettings;
})();
