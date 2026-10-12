import { FINISHES, TYPEFACES, QUALITY_PRESETS } from '../config.js';
import { SOUND_PROFILES, BELL_TYPES, ROOMS } from '../audio/soundProfiles.js';
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
      if (name === 'feed') return this.togglePanel('feed');
      this.emit('action', name, btn);
    });
    // UI 上の操作が 3D に伝わらないように
    for (const el of document.querySelectorAll('.toolbar, .mobilebar, .sheet, .viewer, .intro, .feedbar')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    $('viewerClose').addEventListener('click', () => { $('viewer').hidden = true; });
    this._buildSettings();
    this._buildFeed();
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
    if (open && id === 'feed' && !matchMedia('(pointer: coarse)').matches) $('feedText').focus({ preventScroll: true });
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

    radio('soundProfile', '打鍵音', Object.entries(SOUND_PROFILES).map(([k, v]) => [k, v.name]), '選ぶとその場で試し打ちします。');
    radio('bellType', 'ベルの音', Object.entries(BELL_TYPES).map(([k, v]) => [k, v.name]));
    radio('room', '部屋の響き', Object.entries(ROOMS).map(([k, v]) => [k, v.name]));
    const pv = document.createElement('fieldset');
    pv.className = 'opt';
    pv.innerHTML = '<button type="button" class="tape tape-black opt-preview">試し打ち</button>';
    pv.querySelector('button').addEventListener('click', () => this.emit('preview'));
    body.appendChild(pv);

    radio('quality', '画質', [['auto', '自動'], ...Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.label])]);
  }

  // ---------- 流し込み ----------
  _buildFeed() {
    const s = this.settings;
    const text = $('feedText');
    text.addEventListener('input', () => this.emit('feedInput', text.value));
    const range = $('feedSpeed');
    range.value = s.get('feedSpeed');
    const label = () => {
      const cps = Number(range.value);
      const name = cps <= 4 ? 'ゆっくり' : cps <= 11 ? 'タイピスト' : cps <= 19 ? '速い' : '機関銃';
      $('feedSpeedLabel').textContent = `${name}・${cps} 字/秒（約 ${Math.round(cps * 12)} wpm）`;
    };
    range.addEventListener('input', () => { s.set('feedSpeed', Number(range.value)); label(); });
    label();
  }

  get feedText() { return $('feedText').value; }
  set feedText(v) { $('feedText').value = v; this.emit('feedInput', v); }

  /** 貼り付けた文章の見積もり（打てる字・飛ばす字） */
  setFeedInfo({ typable, skipped }, empty = false) {
    const el = $('feedInfo');
    $('feedStart').disabled = !typable;
    if (empty) { el.textContent = '英数字と記号を打てます。日本語は活字がないため飛ばします。'; el.classList.remove('warn'); return; }
    el.textContent = typable
      ? `${typable} 字を打ちます${skipped ? `（活字のない ${skipped} 字は飛ばします）` : ''}`
      : `打てる文字がありません${skipped ? `（活字のない ${skipped} 字）` : ''}`;
    el.classList.toggle('warn', !typable);
  }

  setFeedState({ active, paused }) {
    $('feedbar').hidden = !active;
    document.body.classList.toggle('feeding', active);
    $('feedStatus').textContent = paused ? '一時停止中' : '流し込み中';
    $('feedToggle').textContent = paused ? '再開' : '一時停止';
    $('feedbar').classList.toggle('paused', paused);
  }

  setFeedProgress({ done, total }) {
    $('feedProgress').textContent = `${done} / ${total}`;
    $('feedFill').style.width = `${total ? (done / total) * 100 : 0}%`;
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
