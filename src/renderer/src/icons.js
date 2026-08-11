// icons.js
const path = require('path');
const fs = require('fs');

function loadSvg(iconName) {
  try {
    const iconPath = path.join(__dirname, '../../assets/icons', iconName);
    return fs.readFileSync(iconPath, 'utf8');
  } catch (err) {
    console.error(`加载图标失败 ${iconName}:`, err.message);
    return '';
  }
}

const svgs = {
  locale: loadSvg('status-locale.svg'),
  translate: loadSvg('tool-translator.svg'),
  empty: loadSvg('empty-game.svg'),
};

console.log('Icons loaded:', {
  locale: svgs.locale ? 'OK' : 'Failed',
  translate: svgs.translate ? 'OK' : 'Failed',
  empty: svgs.empty ? 'OK' : 'Failed',
});

module.exports = { loadSvg, svgs };