import { DEFAULT_SETTINGS } from '../config.js';
import { Emitter } from './Emitter.js';

const KEY = 'typewriter-atelier:settings:v1';

/** 設定値の保持と保存。変更は 'change' イベントで通知 */
export class Settings extends Emitter {
  constructor() {
    super();
    this.values = { ...DEFAULT_SETTINGS, ...this._load() };
  }
  _load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
  }
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* 保存できない環境でも動く */ }
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    this._save();
    this.emit('change', { key: k, value: v });
    this.emit(`change:${k}`, v);
  }
}
