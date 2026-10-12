import { FINISHES, TYPEFACES, QUALITY_PRESETS } from '../config.js';
import { Emitter } from '../core/Emitter.js';
import { VIEW_LABELS } from '../fx/CameraRig.js';

const $ = (id) => document.getElementById(id);

/**
 * 画面上の UI（HTML）。3D 側とはイベントでつながる。
 * イベント: 'action'（name）
 */
export class UI extends Emitter {
  constructor(settings) {
    super();
    this.settings = settings;
    this.pages = [];
    this._toastTimer = 0;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const name = btn.dataset.action;
      if (name === 'close') { btn.closest('.sheet').hidden = true; this.emit('panel', null); return; }
      if (name === 'settings') return this.togglePanel('settings');
      if (name === 'gallery') return this.togglePanel('gallery');
      this.emit('action', name, btn);
    });
    // UI 上の操作が 3D に伝わらないように
    for (const el of document.querySelectorAll('.toolbar, .mobilebar, .sheet, .viewer, .intro')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    $('viewerClose').addEventListener('click', () => { $('viewer').hidden = true; });
    this._buildSettings();
    this.syncToggles();
  }

  // ---------- 起動画面 ----------
  setIntroStatus(text, ready = false) {
    $('introStatus').textContent = text;
    $('introGo').disabled = !ready;
  }
  onIntroGo(fn) { $('introGo').addEventListener('click', fn); }
  hideIntro() {
    const el = $('intro');
    el.classList.add('leaving');
    setTimeout(() => { el.hidden = true; }, 900);
    $('hud').hidden = false;
    $('toolbar').hidden = false;
    if (matchMedia('(pointer: coarse)').matches || window.innerWidth <= 640) $('mobilebar').hidden = false;
  }

  // ---------- 表示の同期 ----------
  syncToggles() {
    const s = this.settings;
    const snd = document.querySelector('[data-action="sound"]');
    snd.setAttribute('aria-pressed', String(s.get('sound')));
    snd.textContent = s.get('sound') ? '音' : '消音';
    const hk = document.querySelector('[data-action="henteko"]');
    hk.setAttribute('aria-pressed', String(s.get('henteko')));
    $('heat').hidden = !s.get('henteko');
    $('ribbonLabel').textContent = s.get('ribbon') === 'red' ? '赤' : '黒';
  }

  setCameraLabel(mode) {
    document.querySelector('[data-action="camera"]').textContent = `視点：${VIEW_LABELS[mode] || mode}`;
  }

  setStats({ wpm, chars, page }) {
    $('statWpm').textContent = `${wpm} wpm`;
    $('statChars').textContent = `${chars} 字`;
    $('statPage').textContent = `${page} 枚目`;
  }

  setHeat(v) { $('heatFill').style.width = `${Math.round(Math.min(1, v) * 100)}%`; }

  showJam(on) { $('jam').hidden = !on; }

  toast(text, ms = 2200) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ---------- パネル ----------
  togglePanel(id) {
    const el = $(id);
    const open = el.hidden;
    for (const p of document.querySelectorAll('.sheet')) p.hidden = true;
    el.hidden = !open;
    if (open && id === 'gallery') this._renderGallery();
    this.emit('panel', open ? id : null);
  }
  closePanels() {
    for (const p of document.querySelectorAll('.sheet')) p.hidden = true;
    $('viewer').hidden = true;
    this.emit('panel', null);
  }
  get panelOpen() { return [...document.querySelectorAll('.sheet, .viewer')].some((p) => !p.hidden); }

  _buildSettings() {
    const s = this.settings;
    const body = $('settingsBody');
    const radio = (name, legend, options, note = '') => {
      const fs = document.createElement('fieldset');
      fs.className = 'opt';
      fs.innerHTML = `<legend>${legend}</legend><div class="opt-row"></div>${note ? `<p class="opt-note">${note}</p>` : ''}`;
      const row = fs.querySelector('.opt-row');
      for (const [value, label, swatch] of options) {
        const id = `opt-${name}-${value}`;
        const l = document.createElement('label');
        l.htmlFor = id;
        l.innerHTML = `<input type="radio" name="${name}" id="${id}" value="${value}">${swatch ? `<span class="swatch" style="background:${swatch}"></span>` : ''}<span>${label}</span>`;
        const input = l.querySelector('input');
        input.checked = String(s.get(name)) === String(value);
        input.addEventListener('change', () => {
          const v = typeof s.get(name) === 'number' ? Number(value) : value;
          s.set(name, v);
          if (name === 'quality') this.toast('画質の変更は再読み込み後に反映されます');
        });
        row.appendChild(l);
      }
      body.appendChild(fs);
    };
    const check = (name, label) => {
      const fs = document.createElement('fieldset');
      fs.className = 'opt';
      const id = `opt-${name}`;
      fs.innerHTML = `<label for="${id}"><input type="checkbox" id="${id}"><span>${label}</span></label>`;
      const input = fs.querySelector('input');
      input.checked = !!s.get(name);
      input.addEventListener('change', () => s.set(name, input.checked));
      body.appendChild(fs);
    };

    radio('typeface', '活字', Object.entries(TYPEFACES).map(([k, v]) => [k, v.name]));
    radio('ribbon', 'リボンの色', [['black', '黒'], ['red', '赤']], '2色リボン。赤にすると、リボンの下半分で打ちます。');
    radio('finish', '本体の塗装', Object.entries(FINISHES).map(([k, v]) => [k, v.name, v.body]));
    radio('spacing', '行間', [[1, '1'], [1.5, '1.5'], [2, '2']]);
    check('autoReturn', '行末で自動改行する（オフにすると実機どおり行末で止まる）');

    const vol = document.createElement('fieldset');
    vol.className = 'opt';
    vol.innerHTML = '<legend>音量</legend><input type="range" min="0" max="1" step="0.05" aria-label="音量">';
    const range = vol.querySelector('input');
    range.value = s.get('volume');
    range.addEventListener('input', () => s.set('volume', Number(range.value)));
    body.appendChild(vol);
    check('ambience', '雨音と柱時計を流す');

    radio('quality', '画質', [['auto', '自動'], ...Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.label])]);
  }

  // ---------- ギャラリー ----------
  addPage(page) {
    this.pages.push(page);
    $('pageCount').textContent = String(this.pages.length);
    if (!$('gallery').hidden) this._renderGallery();
  }

  _renderGallery() {
    const grid = $('galleryGrid');
    grid.innerHTML = '';
    $('galleryEmpty').hidden = this.pages.length > 0;
    [...this.pages].reverse().forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `${p.index} 枚目を開く`);
      const img = document.createElement('img');
      img.src = p.thumb;
      img.alt = `${p.index} 枚目`;
      b.appendChild(img);
      b.addEventListener('click', () => this.openViewer(p.full, `typewriter-page-${p.index}.png`));
      grid.appendChild(b);
    });
  }

  openViewer(src, filename) {
    $('viewerImg').src = src;
    $('viewer').hidden = false;
    $('viewerSave').onclick = () => download(src, filename);
  }
}

export function download(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
