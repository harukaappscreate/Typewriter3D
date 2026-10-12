// 音はすべて Web Audio で合成（音声ファイルなし）。
// 録音した音に差し替えたい場合は、各メソッドの中身を AudioBuffer の再生に置き換えればよい。
// 音色の違いは soundProfiles.js の倍率で作っている。

import { rand } from '../core/anim.js';
import { SOUND_PROFILES, BELL_TYPES, ROOMS } from './soundProfiles.js';

const CHIP_SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // ペンタトニック

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.ambienceOn = true;
    this._amb = null;
    this._hum = null;
    this._previewTimers = [];
    this.p = SOUND_PROFILES.classic;
    this.bellType = BELL_TYPES.brass;
    this.room = ROOMS.study;
  }

  /** ユーザー操作の中で呼ぶ（ブラウザの自動再生制限のため） */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this._setupGraph();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ambienceOn) this.startAmbience();
    this._syncHum();
  }

  _setupGraph() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
    this.master.connect(comp).connect(c.destination);

    // 音色ごとの高域カット（静音・電動など）
    this.tone = c.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.5;
    this.tone.frequency.value = this.p.lowpass;
    this.tone.connect(this.master);

    // 部屋の残響
    this.dry = c.createGain(); this.dry.gain.value = 1;
    this.wet = c.createGain(); this.wet.gain.value = this.room.wet;
    this.dry.connect(this.tone);
    this._buildRoom();

    // 共通のノイズ
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  _buildRoom() {
    const c = this.ctx;
    if (this.conv) { try { this.wet.disconnect(); this.conv.disconnect(); } catch { /* 未接続 */ } }
    this.conv = c.createConvolver();
    this.conv.buffer = this._impulse(this.room.seconds, this.room.decay);
    this.wet.connect(this.conv).connect(this.tone);
    this.wet.gain.setTargetAtTime(this.room.wet, c.currentTime, 0.05);
  }

  _impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 40 ? 0 : 1);
    }
    return buf;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.02);
  }
  setVolume(v) {
    this.volume = v;
    if (this.master && this.enabled) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---------- 音色の切り替え ----------
  setProfile(key) {
    this.p = SOUND_PROFILES[key] || SOUND_PROFILES.classic;
    if (this.tone) this.tone.frequency.setTargetAtTime(this.p.lowpass, this.ctx.currentTime, 0.05);
    this._syncHum();
  }
  setBellType(key) { this.bellType = BELL_TYPES[key] || BELL_TYPES.brass; }
  setRoom(key) {
    this.room = ROOMS[key] || ROOMS.study;
    if (this.ctx) this._buildRoom();
  }

  /** 設定画面の「試し打ち」：短い一節を打ってベルと改行まで */
  preview() {
    if (!this._ok()) return;
    this._previewTimers.forEach(clearTimeout);
    const seq = [
      [0, () => { this.keyDown(); this.strike(0.85); }], [120, () => { this.keyDown(); this.strike(0.75); }],
      [230, () => { this.keyDown(); this.strike(0.9); }], [330, () => this.space()],
      [440, () => { this.keyDown(); this.strike(0.8); }], [540, () => { this.keyDown(); this.strike(0.95); }],
      [660, () => { this.keyDown(); this.strike(0.7); }], [780, () => this.bell()],
      [1250, () => this.carriageReturn(0.38)],
    ];
    this._previewTimers = seq.map(([ms, fn]) => setTimeout(fn, ms));
  }

  // ---------- 部品 ----------
  _out(send = 1) {
    const g = this.ctx.createGain();
    g.connect(this.dry);
    if (send > 0) {
      const s = this.ctx.createGain(); s.gain.value = send;
      g.connect(s).connect(this.wet);
    }
    return g;
  }

  /** フィルタを通したノイズの破裂音 */
  _burst(t, { dur = 0.03, gain = 0.5, type = 'bandpass', freq = 2500, q = 1, attack = 0.001, send = 1, rate = 1 } = {}) {
    if (gain <= 0.0001) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = Math.min(freq, c.sampleRate * 0.45); f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g).connect(this._out(send));
    src.start(t, rand(0, 1.5));
    src.stop(t + attack + dur + 0.05);
    return { f, g };
  }

  /** 減衰する正弦波（金属の響き・打撃の胴鳴り） */
  _tone(t, { freq = 440, to = null, dur = 0.1, gain = 0.3, type = 'sine', send = 1, attack = 0.001 } = {}) {
    const c = this.ctx;
    if (freq > c.sampleRate * 0.45 || gain <= 0.0001) return; // 聞こえない音は鳴らさない
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(this._out(send));
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  _ok() { return this.ctx && this.enabled; }
  _jit(amount = 0.08) { return 1 + (Math.random() * 2 - 1) * amount * this.p.jitter; }

  // ---------- 効果音 ----------
  keyDown() {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    if (P.chip) { this._tone(t, { freq: 1900, dur: 0.012, gain: 0.03 * P.gain, type: 'square', send: 0.1 }); return; }
    this._burst(t, { dur: 0.012 * P.decay, gain: 0.12 * P.click * P.gain, freq: 3200 * P.pitch, q: 1.5, send: 0.3 });
  }

  /** 活字が紙を打つ音（strength 0..1） */
  strike(strength = 0.9, pitch = 1) {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    if (P.chip) {
      const n = CHIP_SCALE[(Math.random() * CHIP_SCALE.length) | 0];
      this._tone(t, { freq: 523 * pitch * 2 ** (n / 12), dur: 0.07, gain: 0.09 * P.gain, type: 'square', send: 0.3 });
      this._burst(t, { dur: 0.01, gain: 0.12 * P.gain, type: 'highpass', freq: 6000, q: 0.7, send: 0.1 });
      return;
    }
    const s = (P.jitter < 0.5 ? 0.9 : 0.5 + strength * 0.5) * P.gain;
    const pp = pitch * P.pitch;
    const d = P.decay;
    this._burst(t, { dur: 0.045 * d, gain: 0.85 * s, type: 'bandpass', freq: 2300 * pp * this._jit(), q: 0.8 });
    this._burst(t, { dur: 0.018 * d, gain: 0.5 * s * P.click, type: 'highpass', freq: 5200 * Math.min(1.25, pp), q: 0.7, send: 0.5 });
    this._tone(t, { freq: 150 * pp, to: 70 * pp, dur: 0.07 * d, gain: 0.55 * s * P.thud });
    this._tone(t, { freq: 3450 * pp * this._jit(0.03), dur: 0.05 * d, gain: 0.04 * s * P.ring, type: 'triangle' });
    // エスケープメント（キャリッジが一歩進む）
    if (P.escapement > 0) {
      this._burst(t + 0.028, { dur: 0.008, gain: 0.22 * P.escapement * P.gain, freq: 6200 * Math.min(1.2, P.pitch), q: 3, send: 0.4 });
      this._burst(t + 0.036, { dur: 0.02 * d, gain: 0.08 * P.escapement * P.gain, freq: 900 * P.pitch, q: 1, send: 0.4 });
    }
    // 電動機：ソレノイドが引き込む鈍い音
    if (P.hum > 0) this._tone(t + 0.004, { freq: 95, to: 55, dur: 0.05, gain: 0.22 * s * P.hum });
  }

  space() {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    if (P.chip) { this._tone(t, { freq: 262, dur: 0.05, gain: 0.07 * P.gain, type: 'triangle', send: 0.3 }); return; }
    this._burst(t, { dur: 0.03 * P.decay, gain: 0.35 * P.gain, freq: 1400 * P.pitch, q: 0.7 });
    this._tone(t, { freq: 110 * P.pitch, to: 60 * P.pitch, dur: 0.08 * P.decay, gain: 0.35 * P.thud * P.gain });
    if (P.escapement > 0) this._burst(t + 0.02, { dur: 0.008, gain: 0.2 * P.escapement * P.gain, freq: 6000, q: 3 });
  }

  backspace() {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    if (P.chip) { this._tone(t, { freq: 660, to: 330, dur: 0.07, gain: 0.07 * P.gain, type: 'square', send: 0.3 }); return; }
    this._burst(t, { dur: 0.02 * P.decay, gain: 0.3 * P.gain, freq: 2000 * P.pitch, q: 1 });
    this._burst(t + 0.03, { dur: 0.04 * P.decay, gain: 0.15 * P.gain, freq: 1200 * P.pitch, q: 0.8 });
  }

  bell(pitch = 1) {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    if (P.chip) {
      [0, 4, 7, 12].forEach((n, i) => this._tone(t + i * 0.06, { freq: 1047 * pitch * 2 ** (n / 12), dur: 0.12, gain: 0.07 * P.gain, type: 'square', send: 0.6 }));
      return;
    }
    const b = this.bellType;
    const f0 = b.f0 * pitch;
    b.partials.forEach(([m, g, d]) => this._tone(t, { freq: f0 * m, dur: d, gain: g * Math.min(1, P.gain * 1.2), send: 1.4 }));
    this._burst(t, { dur: 0.01, gain: 0.25 * P.gain, freq: 7000, q: 2 });
  }

  /** 改行（レバー → 行送りのラチェット → 滑走 → 端で止まる） */
  carriageReturn(duration = 0.4, lines = 1) {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    const te = t + 0.06 + duration;
    if (P.chip) {
      this._tone(t, { freq: 880, to: 220, dur: duration + 0.05, gain: 0.06 * P.gain, type: 'square', send: 0.4 });
      this._tone(te, { freq: 131, to: 65, dur: 0.12, gain: 0.12 * P.gain, type: 'triangle' });
      return;
    }
    const pp = P.pitch;
    this._burst(t, { dur: 0.03, gain: 0.35 * P.gain, freq: 1600 * pp, q: 1 });
    for (let i = 0; i < 2 * lines; i++) this._burst(t + 0.03 + i * 0.035, { dur: 0.01, gain: 0.32 * P.gain, freq: 4200 * pp, q: 4 });
    // 滑走音
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(800 * P.slide, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(2600 * P.slide, t + 0.06 + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t + 0.05);
    g.gain.linearRampToValueAtTime(0.22 * P.gain, t + 0.1);
    g.gain.linearRampToValueAtTime(0.1 * P.gain, t + 0.06 + duration);
    g.gain.linearRampToValueAtTime(0, t + 0.08 + duration);
    src.connect(f).connect(g).connect(this._out(0.6));
    src.start(t + 0.05, rand(0, 1)); src.stop(t + 0.2 + duration);
    // 電動機：モーターが台車を引き戻すうなり
    if (P.hum > 0) this._tone(t + 0.05, { freq: 70, to: 140, dur: duration, gain: 0.06 * P.hum, type: 'sawtooth', send: 0.3, attack: 0.03 });
    // 端に当たる
    this._burst(te, { dur: 0.06 * P.decay, gain: 0.7 * P.gain, freq: 1100 * pp, q: 0.8 });
    this._tone(te, { freq: 120 * pp, to: 55 * pp, dur: 0.12 * P.decay, gain: 0.6 * P.thud * P.gain });
    this._tone(te, { freq: 2100 * pp, dur: 0.12 * P.decay, gain: 0.03 * P.ring * P.gain, type: 'triangle' });
  }

  /** 紙送りのラチェット（排紙・給紙） */
  ratchet(duration = 1, rateHz = 22, rustle = true) {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    const n = Math.floor(duration * rateHz);
    for (let i = 0; i < n; i++) {
      const tt = t + (i / rateHz) * (1 + Math.sin(i * 0.3) * 0.08);
      if (P.chip) { if (i % 2 === 0) this._tone(tt, { freq: 1568, dur: 0.015, gain: 0.03 * P.gain, type: 'square', send: 0.1 }); continue; }
      this._burst(tt, { dur: 0.008, gain: 0.16 * P.gain * (0.7 + Math.random() * 0.3), freq: (4000 + rand(-400, 400)) * P.pitch, q: 4, send: 0.3 });
    }
    if (rustle && !P.chip) this._burst(t, { dur: duration, gain: 0.12 * P.gain, freq: 3500, q: 0.6, attack: 0.08, send: 0.4 });
  }

  paperLand() {
    if (!this._ok()) return;
    const t = this.now;
    this._burst(t, { dur: 0.22, gain: 0.25 * this.p.gain, type: 'lowpass', freq: 1400, q: 0.5, attack: 0.02 });
  }

  paperWhoosh() {
    if (!this._ok()) return;
    const t = this.now;
    this._burst(t, { dur: 0.5, gain: 0.18 * this.p.gain, type: 'bandpass', freq: 1800, q: 0.6, attack: 0.12 });
  }

  /** 行末でキーが止まる鈍い音 */
  locked() {
    if (!this._ok()) return;
    const t = this.now;
    const P = this.p;
    if (P.chip) { this._tone(t, { freq: 110, dur: 0.1, gain: 0.08 * P.gain, type: 'square' }); return; }
    this._tone(t, { freq: 90 * P.pitch, to: 60 * P.pitch, dur: 0.08, gain: 0.4 * P.gain });
    this._burst(t, { dur: 0.03, gain: 0.25 * P.gain, freq: 700 * P.pitch, q: 1 });
  }

  uiTick() {
    if (!this._ok()) return;
    this._burst(this.now, { dur: 0.012, gain: 0.12, freq: 5000, q: 2, send: 0.2 });
  }

  // ---------- 電動機のうなり（電動タイプライター） ----------
  _syncHum() {
    if (!this.ctx) return;
    if (this.p.hum > 0) this._startHum(); else this._stopHum();
  }
  _startHum() {
    if (this._hum) return;
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 116;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const fan = c.createBufferSource(); fan.buffer = this.noise; fan.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7;
    const fg = c.createGain(); fg.gain.value = 0.25;
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(0.022 * this.p.hum, c.currentTime, 0.4);
    o.connect(lp); o2.connect(lp); lp.connect(g);
    fan.connect(bp).connect(fg).connect(g);
    g.connect(this.dry);
    o.start(); o2.start(); fan.start();
    this._hum = { g, nodes: [o, o2, fan] };
  }
  _stopHum() {
    if (!this._hum) return;
    const { g, nodes } = this._hum;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* 停止済み */ } }), 900);
    this._hum = null;
  }

  // ---------- へんてこモード ----------
  jam() {
    if (!this._ok()) return;
    const t = this.now;
    this._burst(t, { dur: 0.12, gain: 0.8, freq: 1800, q: 0.6 });
    [790, 1337, 2131, 3011].forEach((f, i) => this._tone(t, { freq: f, dur: 0.5 - i * 0.08, gain: 0.08, type: 'triangle', send: 1.2 }));
    this._tone(t, { freq: 200, to: 80, dur: 0.15, gain: 0.5 });
  }
  rattle() {
    if (!this._ok()) return;
    const t = this.now;
    for (let i = 0; i < 5; i++) this._burst(t + i * 0.025, { dur: 0.015, gain: 0.3, freq: rand(1500, 4000), q: 2 });
  }
  sizzle(amount = 0.5) {
    if (!this._ok()) return;
    const t = this.now;
    const n = Math.round(3 + amount * 8);
    for (let i = 0; i < n; i++) this._burst(t + rand(0, 0.12), { dur: 0.004, gain: 0.12 + amount * 0.1, type: 'highpass', freq: 6000, q: 1, send: 0.2 });
  }
  boom() {
    if (!this._ok()) return;
    const t = this.now;
    this._burst(t, { dur: 0.9, gain: 1.0, type: 'lowpass', freq: 900, q: 0.5, attack: 0.004 });
    this._tone(t, { freq: 90, to: 28, dur: 0.8, gain: 0.9 });
    this._burst(t + 0.05, { dur: 0.6, gain: 0.25, type: 'highpass', freq: 3000, q: 0.5, send: 1.5 });
    for (let i = 0; i < 8; i++) this._burst(t + 0.2 + rand(0, 0.8), { dur: 0.02, gain: 0.25, freq: rand(2000, 6000), q: 3 });
  }
  /** ベルでメロディ */
  bellMelody() {
    if (!this._ok()) return;
    const notes = [1, 1.26, 1.5, 2, 1.5, 2.52];
    const save = this.now;
    notes.forEach((p, i) => setTimeout(() => this.bell(p * 0.8), i * 110));
    return save;
  }
  boing() {
    if (!this._ok()) return;
    const t = this.now;
    this._tone(t, { freq: 180, to: 520, dur: 0.25, gain: 0.25, type: 'triangle' });
  }

  // ---------- 環境音：窓の雨と、遠くの柱時計 ----------
  startAmbience() {
    if (!this.ctx || this._amb) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(0.045, c.currentTime, 1.5);
    src.connect(lp).connect(hp).connect(g).connect(this.dry);
    src.start();
    this._amb = { src, g, timer: 0, tick: 0 };
    const loop = () => {
      if (!this._amb) return;
      if (this.enabled) {
        const t = c.currentTime;
        // しずく
        for (let i = 0; i < 4; i++) this._burst(t + rand(0, 0.5), { dur: 0.006, gain: rand(0.01, 0.04), freq: rand(3000, 7000), q: 5, send: 0.6 });
        // 時計
        this._amb.tick ^= 1;
        this._burst(t, { dur: 0.01, gain: 0.025, freq: this._amb.tick ? 2400 : 2000, q: 6, send: 1.5 });
      }
      this._amb.timer = setTimeout(loop, 1000);
    };
    loop();
  }
  stopAmbience() {
    if (!this._amb) return;
    const { src, g, timer } = this._amb;
    clearTimeout(timer);
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    setTimeout(() => { try { src.stop(); } catch { /* 停止済み */ } }, 1500);
    this._amb = null;
  }
  setAmbience(on) {
    this.ambienceOn = on;
    if (on) this.startAmbience(); else this.stopAmbience();
  }
}
