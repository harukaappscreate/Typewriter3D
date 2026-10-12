import * as THREE from 'three';
import { Emitter } from './Emitter.js';

/**
 * 入力のまとめ役。
 *  - PC：物理キーボード（keydown / keyup）
 *  - スマホ：隠しテキスト欄に OS のキーボードで入力（差分を読む）
 *  - 3D のキー・改行レバー・ベルのタップ（レイキャスト）
 * イベント: 'char' 'return' 'backspace' 'tab' 'shift' 'caps' 'pick' 'any' 'escape'
 */
export class Input extends Emitter {
  constructor({ canvas, camera, ime }) {
    super();
    this.canvas = canvas;
    this.camera = camera;
    this.ime = ime;
    this.enabled = false;
    this.pickables = [];
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._prev = '';
    this._composing = false;

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('blur', () => this.emit('shift', false));
    window.addEventListener('paste', (e) => this._onPaste(e));

    ime.addEventListener('compositionstart', () => { this._composing = true; });
    ime.addEventListener('compositionend', () => { this._composing = false; this._readIme(); });
    ime.addEventListener('input', () => this._readIme());
    ime.addEventListener('focus', () => { document.body.classList.add('typing'); this.emit('imeFocus', true); });
    ime.addEventListener('blur', () => { document.body.classList.remove('typing'); this.emit('imeFocus', false); });
    this._resetIme();

    // キャプチャ段階で拾い、3D 部品に当たったら視点操作を止める
    canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e), { capture: true });
  }

  setPickables(list) { this.pickables = list; }

  // 文字を入力する欄だけ除外（ラジオボタン等にフォーカスがあってもタイプできる）
  _isFormField(t) {
    if (!t || t === this.ime) return false;
    if (t.tagName === 'INPUT') return !['radio', 'checkbox', 'button'].includes(t.type);
    return t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') { this.emit('escape'); return; }
    if (this._isFormField(e.target)) return;
    if (e.key === 'Shift') { this.emit('shift', true); return; }
    if (e.key === 'CapsLock') { this.emit('caps', e.getModifierState('CapsLock')); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'v') { this._pasteFallback(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // ブラウザのショートカットはそのまま
    if (!this.enabled) {
      if (e.key.length === 1 || e.key === 'Enter') this.emit('any', e);
      return;
    }
    if (e.getModifierState) this.emit('caps', e.getModifierState('CapsLock'));
    // 隠し入力欄にフォーカスがあるときは input イベントで処理（Tab だけここで）
    if (e.target === this.ime && e.key !== 'Tab') return;
    if (e.isComposing || e.keyCode === 229) return;

    if (e.key === 'Enter') { e.preventDefault(); this.emit('return'); }
    else if (e.key === 'Backspace') { e.preventDefault(); this.emit('backspace'); }
    else if (e.key === 'Tab') { e.preventDefault(); this.emit('tab'); }
    else if (e.key.length === 1) {
      e.preventDefault();
      this.emit('char', e.key);
    }
  }

  // ---------- 貼り付け（流し込み） ----------
  // 入力欄の外での ⌘V / Ctrl+V。隠し入力欄（スマホ）への貼り付けもここで受ける
  _onPaste(e) {
    if (this._isFormField(e.target) || !this.enabled) return;
    this._pasteSeen = true;
    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (e.target === this.ime) this._resetIme();
    this.emit('paste', text);
  }

  // Safari などは入力欄の外で paste イベントを出さないため、届かなければ読みに行く
  _pasteFallback() {
    if (!this.enabled) return;
    this._pasteSeen = false;
    setTimeout(() => {
      if (this._pasteSeen || !navigator.clipboard?.readText) return;
      navigator.clipboard.readText()
        .then((text) => { if (text) this.emit('paste', text); })
        .catch(() => this.emit('pasteDenied'));
    }, 120);
  }

  _onKeyUp(e) {
    if (e.key === 'Shift') this.emit('shift', false);
  }

  // ---------- スマホの隠し入力欄 ----------
  // 先頭に番兵の文字を置き、バックスペースも検出できるようにする
  _resetIme() {
    const SENT = '>>';
    this.ime.value = SENT;
    this._prev = SENT;
    try { this.ime.setSelectionRange(SENT.length, SENT.length); } catch { /* 非対応でもよい */ }
  }

  _readIme() {
    if (!this.enabled) { this._resetIme(); return; }
    const cur = this.ime.value;
    const prev = this._prev;
    let i = 0;
    while (i < cur.length && i < prev.length && cur[i] === prev[i]) i++;
    const removed = prev.length - i;
    const added = cur.slice(i);
    for (let k = 0; k < removed; k++) this.emit('backspace');
    for (const ch of added) {
      if (ch === '\n' || ch === '\r') this.emit('return');
      else this.emit('char', ch);
    }
    this._prev = cur;
    if (!this._composing && (cur.length < 2 || cur.length > 120 || !cur.startsWith('>>'))) this._resetIme();
  }

  openSoftKeyboard() {
    this.ime.focus({ preventScroll: true });
    this._resetIme();
  }
  closeSoftKeyboard() { this.ime.blur(); }

  // ---------- 3D のタップ ----------
  _onPointerDown(e) {
    if (!this.enabled || e.button > 0) return;
    const r = this.canvas.getBoundingClientRect();
    this._ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    if (hits.length) {
      this.emit('pick', hits[0]);
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }
}
