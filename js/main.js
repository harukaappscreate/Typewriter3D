// エントリーポイント
import { App } from './core/App.js';

// スマホでソフトキーボードが出たとき、見えている範囲に画面を合わせる
const appEl = document.getElementById('app');
const vv = window.visualViewport;
if (vv) {
  const fit = () => {
    appEl.style.height = `${vv.height}px`;
    appEl.style.transform = `translateY(${vv.offsetTop}px)`;
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}

const app = new App();
window.__typewriter = app; // デバッグ用
app.init().catch((err) => {
  console.error(err);
  const s = document.getElementById('introStatus');
  if (s) s.textContent = `起動できませんでした：${err.message}`;
});
