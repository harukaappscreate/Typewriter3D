import { PAPER } from '../config.js';
import { Emitter } from './Emitter.js';
import { rand } from './anim.js';

// ============================================================
//  流し込み：貼り付けた文章を、機械に1字ずつ打たせる
// ============================================================

// 活字のある文字へ置き換える記号（NFKC 正規化のあとに適用）
const SUBSTITUTE = {
  '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'", '‹': "'", '›': "'",
  '“': '"', '”': '"', '„': '"', '‟': '"', '″': '"', '«': '"', '»': '"',
  '‐': '-', '‑': '-', '‒': '-', '–': '-', '−': '-',
  '—': '--', '―': '--',
  '•': '*', '·': '*', '×': 'x', '÷': '/',
  '©': '(c)', '®': '(R)',
};

const isTypable = (ch) => ch === '\n' || ch === '\t' || (ch >= ' ' && ch <= '~');

/**
 * 文章を、このタイプライターで打てる形に整える。
 *  - 全角英数字 → 半角、スマートクォート → " '、ダッシュ → -- など
 *  - アクセント付きの文字は素の文字に（é → e）
 *  - 活字のない文字（日本語など）は飛ばして数える
 */
export function normalizeForTypewriter(raw) {
  const src = String(raw ?? '').replace(/\r\n?/g, '\n').normalize('NFKC');
  let out = '';
  let skipped = 0;
  for (const c of src) {
    const ch = SUBSTITUTE[c] ?? c;
    if ([...ch].every(isTypable)) { out += ch; continue; }
    const bare = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (bare && [...bare].every(isTypable)) { out += bare; continue; }
    if (/\s/.test(c)) { out += ' '; continue; }
    skipped++;
  }
  const text = out
    .split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\s+$/g, '');
  const typable = text.replace(/\s/g, '').length;
  return { text, typable, skipped };
}

/**
 * 待ち行列が空くたびに1字ずつ渡す。単語の途中では改行しない。
 * イベント: 'state'（{ active, paused }）'progress'（{ done, total }）'done'
 */
export class Feeder extends Emitter {
  constructor(typewriter, settings) {
    super();
    this.tw = typewriter;
    this.settings = settings;
    this.text = '';
    this.i = 0;
    this.done = 0;
    this.total = 0;
    this.lastPush = 0;
    this.wait = 0;
    this.active = false;
    this.paused = false;
    this.softWrapped = false;

    // へんてこの JAM で打てなかった1字は、ほどいたあと打ち直す
    typewriter.on('jam', () => {
      if (!this.active) return;
      this.i = this.lastPush;
      this.done = Math.max(0, this.done - 1);
      this._emitProgress();
    });
  }

  analyze(raw) { return normalizeForTypewriter(raw); }

  start(raw) {
    const result = normalizeForTypewriter(raw);
    if (!result.typable) return result;
    this.text = result.text;
    this.total = result.typable;
    this.done = 0;
    this.i = 0;
    this.lastPush = 0;
    this.wait = 0.25;
    this.softWrapped = false;
    this.active = true;
    this.paused = false;
    this._emitState();
    this._emitProgress();
    return result;
  }

  pause() { if (this.active && !this.paused) { this.paused = true; this._emitState(); } }
  resume() { if (this.active && this.paused) { this.paused = false; this.wait = 0.15; this._emitState(); } }
  toggle() { if (this.paused) this.resume(); else this.pause(); }
  stop() {
    if (!this.active) return;
    this.active = false;
    this.paused = false;
    this._emitState();
  }

  get cps() { return Number(this.settings.get('feedSpeed')) || 9; }
  /** 進み具合（空白・改行を除いた字数） */
  get progress() { return { done: this.done, total: this.total }; }

  _emitState() { this.emit('state', { active: this.active, paused: this.paused }); }
  _emitProgress() { this.emit('progress', this.progress); }

  /** 次の1字までの間（人が打つような揺らぎ） */
  _delay(ch) {
    const base = 1 / this.cps;
    const calm = this.cps >= 20 ? 0.25 : 1; // 機関銃はほぼ等間隔
    let d = base * (1 + rand(-0.45, 0.45) * calm);
    if (ch === ' ') d += base * rand(0, 0.6) * calm;
    else if ('.!?'.includes(ch)) d += base * rand(2.5, 5) * calm;
    else if (',;:'.includes(ch)) d += base * rand(1.2, 2.5) * calm;
    else if (ch === '\n') d += 0.2 * calm;
    return d;
  }

  _advance(ch) {
    this.i++;
    this.wait = this._delay(ch);
    this._emitProgress();
  }

  update(dt) {
    if (!this.active || this.paused) return;
    const tw = this.tw;
    if (tw.jammed || !tw.enabled) return;
    this.wait = Math.max(this.wait - dt, -0.05); // 機械の動作中も間は進む（字/秒を正確に）
    if (this.wait > 0 || tw.busy || tw.queue.length || tw.time < tw.nextFree) return;

    if (this.i >= this.text.length) {
      this.active = false;
      this._emitState();
      this.emit('done');
      return;
    }

    const { text } = this;
    const ch = text[this.i];
    const cols = PAPER.cols;

    if (ch === '\n') {
      tw.carriageReturn();
      this.softWrapped = false;
      this._advance(ch);
      return;
    }
    if (ch === ' ') {
      if (tw.col >= cols) { tw.carriageReturn(); this.softWrapped = true; this._advance(ch); return; }
      if (tw.col === 0 && this.softWrapped) { this.i++; return; } // 折り返した直後の空白は打たない
      tw.typeChar(' ');
      this._advance(ch);
      return;
    }
    if (ch === '\t') {
      tw.tab();
      this._advance(ch);
      return;
    }

    // 行末：自動改行の設定に関係なく、流し込みは次の行へ
    if (tw.col >= cols) { tw.carriageReturn(); this.softWrapped = true; this.wait = 0; return; }

    // 単語の頭で、その単語が行に収まらなければ先に改行する
    const startsWord = this.i === 0 || /\s/.test(text[this.i - 1]);
    if (startsWord && tw.col > 0) {
      let len = 0;
      while (this.i + len < text.length && !/\s/.test(text[this.i + len])) len++;
      if (len <= cols && tw.col + len > cols) {
        tw.carriageReturn();
        this.softWrapped = true;
        this.wait = 0;
        return;
      }
    }

    this.softWrapped = false;
    this.lastPush = this.i;
    this.done++;
    tw.typeChar(ch);
    this._advance(ch);
  }
}
