import * as THREE from 'three';
import { PAPER, PRINT_POINT, TIMING, FINISHES } from '../config.js';
import { Emitter } from '../core/Emitter.js';
import { Spring, ease, clamp, rand } from '../core/anim.js';
import { createMaterials } from './Materials.js';
import { buildLayout } from './layout.js';
import { Body } from './Body.js';
import { Keyboard } from './Keyboard.js';
import { TypeBasket } from './TypeBasket.js';
import { Carriage } from './Carriage.js';
import { Ribbon } from './Ribbon.js';
import { PaperPath } from '../paper/PaperPath.js';
import { Paper } from '../paper/Paper.js';
import { InkRenderer } from '../paper/InkRenderer.js';
import { PaperStack } from '../paper/PaperStack.js';

const PITCH = (PAPER.width - PAPER.marginLeft * 2) / PAPER.cols;
const colToX = (c) => -PAPER.width / 2 + PAPER.marginLeft + (c + 0.5) * PITCH;
const BOTTOM_LIMIT = PAPER.height - PAPER.marginBottom;

/**
 * タイプライター全体：部品の組み立てと、打鍵・改行・紙送りの機構。
 * イベント: 'strike' 'space' 'return' 'bell' 'backspace' 'locked'
 *          'pageEjected' 'pageInserted' 'stats' 'jam'
 */
export class Typewriter extends Emitter {
  constructor({ renderer, scene, settings, audio, quality, tweens }) {
    super();
    this.scene = scene;
    this.settings = settings;
    this.audio = audio;
    this.tweens = tweens;
    this.time = 0;

    this.root = new THREE.Group();
    this.root.name = 'typewriter';
    scene.add(this.root);

    const finish = FINISHES[settings.get('finish')] || FINISHES.black;
    this.mats = createMaterials(finish);
    this.layout = buildLayout();
    this.body = new Body(this.mats, finish);
    this.keyboard = new Keyboard(this.mats, this.layout);
    this.basket = new TypeBasket(this.mats, this.layout);
    this.path = new PaperPath();
    this.carriage = new Carriage(this.mats, this.path);
    this.ribbon = new Ribbon(this.mats);
    this.ink = new InkRenderer(renderer, quality.paperPx);
    this.ink.setTypeface(settings.get('typeface'));
    this.paper = new Paper(this.path, this.ink.texture);
    this.carriage.group.add(this.paper.mesh);
    this.stack = new PaperStack(scene);
    this.root.add(this.body.group, this.keyboard.group, this.basket.group, this.carriage.group, this.ribbon.group);

    // 状態
    this.col = 0;
    this.lineY = PAPER.marginTop;
    this.queue = [];
    this.nextFree = 0;
    this.hitsUntil = 0;
    this.enabled = false;
    this.busy = false;           // 改行・排紙中
    this.shiftHeld = false;
    this.shiftSticky = false;
    this.capsLock = false;
    this.shiftPulseUntil = 0;
    this.pages = 0;
    this.typedTimes = [];
    this.totalChars = 0;

    this.carriageSpring = new Spring(0, 900, 0.5);
    this.carriageTween = null;
    this.feedSpring = new Spring(-1.2, 260, 0.85);
    this.feedOverride = null;    // 排紙・給紙中はトゥイーンで直接動かす
    this.keyAnims = new Map();   // keyIndex -> { start, hold }
    this.spaceAnim = null;
    this.ribbonStart = -10;
    this.leverValue = 0;
    this.bellAnim = -10;

    // 外から差し込める振る舞い（へんてこモード）
    this.mods = {
      wild: () => 0,
      shouldJam: () => false,
      mapChar: (ch) => ch,
      strikeStrength: () => 0,
    };

    this._applyCarriage(0);
    this.paper.setFeed(this.feedSpring.value);
    this.carriage.setFeed(this.feedSpring.value);

    settings.on('change', ({ key, value }) => {
      if (key === 'finish') this.body.setFinish(FINISHES[value] || FINISHES.black);
      if (key === 'typeface') this.ink.setTypeface(value);
      if (key === 'ribbon') this.ribbon.color = value;
    });
    this.ribbon.color = settings.get('ribbon');
  }

  // ------------------------------------------------------------
  //  入力（外部から呼ぶ）
  // ------------------------------------------------------------
  typeChar(ch) {
    if (!this.enabled) return;
    if (ch === '\n') return this.carriageReturn();
    if (ch === '\t') return this.tab();
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) { this.audio.locked(); this.emit('rejected', ch); return; }
    if (this.queue.length > 40) return; // 詰め込みすぎ防止
    this.queue.push({ type: 'char', ch });
  }
  carriageReturn() { if (this.enabled) this.queue.push({ type: 'return' }); }
  backspace() { if (this.enabled) this.queue.push({ type: 'back' }); }
  tab() { if (this.enabled) this.queue.push({ type: 'tab' }); }
  ejectPage() {
    if (!this.enabled || this.queue.some((q) => q.type === 'eject')) return;
    this.queue.push({ type: 'eject' });
  }
  setShiftHeld(on) { this.shiftHeld = on; }
  setCapsLock(on) { this.capsLock = on; }

  /** 3Dのキーを直接押したとき */
  pressKey(key) {
    if (!this.enabled) return;
    if (key.special === 'shift') { this.shiftSticky = !this.shiftSticky; this.audio.keyDown(); this._pressAnim(key.index, 0.06); return; }
    if (key.special === 'lock') { this.capsLock = !this.capsLock; this.audio.keyDown(); return; }
    if (key.special === 'backspace') { this._pressAnim(key.index, 0.05); return this.backspace(); }
    if (key.special === 'tab') { this._pressAnim(key.index, 0.05); return this.tab(); }
    const isLetter = /[a-z]/.test(key.lower);
    const up = this.shiftSticky || (this.capsLock && isLetter);
    this.shiftSticky = false;
    this.typeChar(up ? key.upper : key.lower);
  }

  // ------------------------------------------------------------
  //  機構
  // ------------------------------------------------------------
  get spacing() { return Number(this.settings.get('spacing')) || 1; }
  get isIdle() { return this.queue.length === 0 && this.time >= this.nextFree && !this.busy; }

  _pressAnim(index, hold = TIMING.barUp) {
    this.keyAnims.set(index, { start: this.time, hold });
  }

  _process(item) {
    const now = this.time;
    switch (item.type) {
      case 'char': return this._strike(item.ch, now);
      case 'return': return this._return(now);
      case 'back': return this._back(now);
      case 'tab': return this._tab(now);
      case 'eject': return this._eject(now);
      default: return undefined;
    }
  }

  _strike(rawCh, now) {
    if (rawCh === ' ') return this._space(now);
    const ch = this.mods.mapChar(rawCh);
    const info = this.layout.charMap.get(ch);
    if (!info) return;
    if (this.col >= PAPER.cols) {
      if (this.settings.get('autoReturn')) {
        this.queue.unshift({ type: 'char', ch: rawCh });
        this.queue.unshift({ type: 'return' });
      } else {
        this.audio.locked();
        this._pressAnim(info.key.index, 0.02);
        this.nextFree = now + 0.12;
        this.emit('locked');
      }
      return;
    }

    const key = info.key;
    // へんてこ：活字棒が絡まる
    if (this.mods.shouldJam(now, key)) {
      const other = (key.typebar + 1 + ((Math.random() * 5) | 0)) % this.basket.count;
      this.basket.jam(key.typebar, other);
      this._pressAnim(key.index, 0.3);
      this.audio.jam();
      this.queue.length = 0;
      this.jammed = true;
      this.emit('jam');
      return;
    }

    const col = this.col;
    const lineY = this.lineY;
    this.col++;
    this._pressAnim(key.index);
    if (info.shifted) this.shiftPulseUntil = now + 0.14;
    this.basket.strike(key.typebar, now);
    this.ribbonStart = now;
    this.audio.keyDown();

    const strength = clamp(0.78 + rand(-0.12, 0.12) + this.mods.strikeStrength(), 0.35, 1);
    const hitAt = TIMING.barUp;
    this.hitsUntil = Math.max(this.hitsUntil, now + hitAt + 0.01);
    this.tweens.after(hitAt, () => {
      const wild = this.mods.wild();
      this.ink.stamp(ch, col, lineY, { strength, color: this.ribbon.color, wild });
      this.ribbon.advance();
      this.audio.strike(strength, 1 + wild * rand(-0.3, 0.3));
      this.carriageSpring.target = Math.min(this.col, col + 1);
      this._countStat();
      this.emit('strike', { ch, col, lineY, strength, wild, point: this.printPointWorld() });
      if (col + 1 === PAPER.cols - PAPER.bellBefore) this._ringBell();
    });
    this.nextFree = now + TIMING.minStrikeGap;
  }

  _space(now) {
    if (this.col >= PAPER.cols) {
      if (this.settings.get('autoReturn')) this.queue.unshift({ type: 'return' });
      else this.audio.locked();
      return;
    }
    this.col++;
    this.spaceAnim = now;
    this.audio.space();
    this.tweens.after(0.03, () => { this.carriageSpring.target = this.col; });
    if (this.col === PAPER.cols - PAPER.bellBefore) this._ringBell();
    this._countStat();
    this.emit('space');
    this.nextFree = now + TIMING.minStrikeGap;
  }

  _back(now) {
    if (this.col <= 0) { this.nextFree = now + 0.05; return; }
    this.col--;
    this.carriageSpring.target = this.col;
    this.audio.backspace();
    const bk = this.layout.keys.find((k) => k.special === 'backspace');
    if (bk) this._pressAnim(bk.index, 0.04);
    this.emit('backspace');
    this.nextFree = now + 0.06;
  }

  _tab(now) {
    const stop = PAPER.tabStop;
    const next = Math.min(PAPER.cols - 1, (Math.floor(this.col / stop) + 1) * stop);
    if (next <= this.col) { this.nextFree = now + 0.05; return; }
    this.col = next;
    this.carriageSpring.target = next;
    this.audio.backspace();
    const tk = this.layout.keys.find((k) => k.special === 'tab');
    if (tk) this._pressAnim(tk.index, 0.06);
    this.nextFree = now + 0.15;
  }

  _ringBell() {
    this.audio.bell();
    this.bellAnim = this.time;
    this.emit('bell');
  }

  _return(now) {
    const adv = PAPER.lineAdvance * this.spacing;
    if (this.lineY + adv > BOTTOM_LIMIT) {
      // 紙の最後まで来たら、次の紙へ
      this.queue.unshift({ type: 'eject' });
      return;
    }
    const from = this.carriageSpring.value;
    const dist = Math.max(0, from);
    const dur = TIMING.returnBase + TIMING.returnPerCol * dist;
    this.col = 0;
    this.lineY += adv;
    this.feedSpring.target = this.lineY;
    this.audio.carriageReturn(dur, this.spacing);
    // レバーを倒す
    this.tweens.add({ duration: 0.07, ease: ease.outQuad, update: (v) => { this.leverValue = v; } });
    this.tweens.add({ delay: 0.07 + dur, duration: 0.25, ease: ease.outBack, from: 1, to: 0, update: (v) => { this.leverValue = v; } });
    // キャリッジが右端（=0桁目）まで滑る
    this._slideCarriage(from, 0, dur, 0.06);
    this.emit('return', { dist, dur });
    this.nextFree = now + dur + 0.1;
  }

  _slideCarriage(from, to, dur, delay = 0) {
    if (this.carriageTween) this.tweens.kill(this.carriageTween);
    this.carriageTween = this.tweens.add({
      delay, duration: dur, ease: ease.inOutCubic, from, to,
      update: (v) => { this.carriageSpring.value = v; this.carriageSpring.v = 0; this.carriageSpring.target = v; },
      complete: () => {
        this.carriageTween = null;
        this.carriageSpring.set(to);
        // 端に当たって小さく揺れる
        this.carriageSpring.v = (to < from ? -1 : 1) * 6;
        this.emit('carriageStop', { from, to });
      },
    });
  }

  _eject(now) {
    if (this.busy) return;
    this.busy = true;
    const outDur = 0.95;
    const from = this.carriageSpring.value;
    this._slideCarriage(from, PAPER.cols / 2, 0.45);
    this.audio.ratchet(outDur, 26, true);
    const f0 = this.feedSpring.value;
    const f1 = PAPER.height + 1.05;
    this.feedOverride = f0;
    this.tweens.add({
      duration: outDur, ease: ease.inCubic, from: f0, to: f1,
      update: (v) => { this.feedOverride = v; },
      complete: () => {
        const canvas = this.ink.snapshot(1024);
        const text = this.ink.plainText();
        const m = this.paperWorldMatrix(f1);
        this.paper.mesh.visible = false;
        this.audio.paperWhoosh();
        this.stack.launch(canvas, m, {
          wild: this.mods.wild() > 0.3,
          onLand: () => { this.audio.paperLand(); this.emit('pageLanded'); },
        });
        this.pages++;
        this.emit('pageEjected', { canvas, text, index: this.pages });
        this.tweens.after(0.35, () => this.insertPaper());
      },
    });
    this.nextFree = now + 99; // 給紙が終わるまで待つ
  }

  /** 新しい紙を差し込む（起動時にも使う） */
  insertPaper(onDone) {
    this.busy = true;
    this.ink.newPage();
    this.feedOverride = -0.6;
    this.paper.mesh.visible = true;
    const dur = 1.25;
    this.audio.ratchet(dur, 18, true);
    this._slideCarriage(this.carriageSpring.value, 0, 0.7, 0.2);
    this.tweens.add({
      duration: dur, ease: ease.inOutCubic, from: -0.6, to: PAPER.marginTop,
      update: (v) => { this.feedOverride = v; },
      complete: () => {
        this.feedOverride = null;
        this.feedSpring.set(PAPER.marginTop);
        this.col = 0;
        this.lineY = PAPER.marginTop;
        this.busy = false;
        this.nextFree = this.time + 0.05;
        this.emit('pageInserted');
        onDone && onDone();
      },
    });
  }

  _countStat() {
    this.totalChars++;
    this.typedTimes.push(this.time);
    const cut = this.time - 30;
    while (this.typedTimes.length && this.typedTimes[0] < cut) this.typedTimes.shift();
  }

  /** 直近の打鍵速度（WPM：5打鍵 = 1語） */
  get wpm() {
    const n = this.typedTimes.length;
    if (n < 2) return 0;
    const span = Math.max(4, this.time - this.typedTimes[0]);
    return Math.round((n / 5) * (60 / span));
  }

  /** 1秒あたりの打鍵数（直近2秒） */
  get burstRate() {
    let n = 0;
    for (let i = this.typedTimes.length - 1; i >= 0 && this.time - this.typedTimes[i] < 2; i--) n++;
    return n / 2;
  }

  /** 印字点のワールド座標 */
  printPointWorld(out = new THREE.Vector3()) {
    out.set(PRINT_POINT.x, PRINT_POINT.y, PRINT_POINT.z);
    return this.root.localToWorld(out);
  }

  /** feed のときの紙の中心の姿勢（ワールド） */
  paperWorldMatrix(feed) {
    const u = feed - PAPER.height / 2;
    const p = this.path.at(u, { y: 0, z: 0 });
    const t = this.path.tangent(u, { y: 0, z: 0 });
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, t.y, t.z),
      new THREE.Vector3(0, -t.z, t.y),
    );
    m.setPosition(0, p.y, p.z);
    this.carriage.group.updateWorldMatrix(true, false);
    return new THREE.Matrix4().multiplyMatrices(this.carriage.group.matrixWorld, m);
  }

  /** 解除（へんてこモードの JAM をほどく） */
  unjam() {
    if (!this.jammed) return;
    this.jammed = false;
    this.basket.unjam(this.time);
    this.audio.rattle();
    this.nextFree = this.time + 0.5;
  }

  _applyCarriage(colFloat) {
    this.carriage.group.position.x = -colToX(colFloat);
  }

  // ------------------------------------------------------------
  //  毎フレーム
  // ------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const now = this.time;

    // 入力の待ち行列を処理
    let guard = 0;
    while (!this.jammed && !this.busy && this.queue.length && now >= this.nextFree && guard++ < 8) {
      const item = this.queue[0];
      if (item.type !== 'char' && now < this.hitsUntil) break; // 印字が終わってから
      this.queue.shift();
      this._process(item);
    }

    // キャリッジ
    if (!this.carriageTween) this.carriageSpring.update(dt);
    this._applyCarriage(this.carriageSpring.value);

    // 紙送り
    const feed = this.feedOverride ?? this.feedSpring.update(dt);
    this.paper.setFeed(feed);
    this.carriage.setFeed(feed);
    this.carriage.setLever(this.leverValue);

    // キー
    for (const [i, a] of this.keyAnims) {
      const t = now - a.start;
      let v;
      if (t < TIMING.keyDown) v = ease.outQuad(t / TIMING.keyDown);
      else if (t < TIMING.keyDown + a.hold) v = 1;
      else {
        const u = (t - TIMING.keyDown - a.hold) / TIMING.keyUp;
        v = u >= 1 ? 0 : 1 - ease.outBack(u);
        if (u >= 1) this.keyAnims.delete(i);
      }
      this.keyboard.setPress(i, v);
    }
    // シフト・ロックの見た目
    const shiftOn = this.shiftHeld || this.shiftSticky || now < this.shiftPulseUntil;
    this.basket.shiftTarget = shiftOn || this.capsLock ? 1 : 0;
    for (const k of this.layout.keys) {
      if (k.special === 'shift' && !this.keyAnims.has(k.index)) this.keyboard.setPress(k.index, shiftOn ? 0.8 : 0);
      if (k.special === 'lock' && !this.keyAnims.has(k.index)) this.keyboard.setPress(k.index, this.capsLock ? 0.7 : 0);
    }
    // スペースバー
    if (this.spaceAnim !== null) {
      const t = now - this.spaceAnim;
      let v = t < 0.03 ? t / 0.03 : 1 - (t - 0.03) / 0.12;
      if (t > 0.15) { v = 0; this.spaceAnim = null; }
      this.keyboard.setSpacePress(clamp(v, 0, 1));
    }
    this.keyboard.update();

    // リボン
    const rt = now - this.ribbonStart;
    let lift = 0;
    if (rt < TIMING.barUp) lift = ease.outQuad(rt / TIMING.barUp);
    else if (rt < TIMING.barUp + 0.1) lift = 1 - ease.inQuad((rt - TIMING.barUp) / 0.1);
    this.ribbon.lift = lift;
    this.ribbon.update(dt);

    // ベルのハンマー
    const bt = now - this.bellAnim;
    this.body.bellHammer.rotation.z = 0.5 + (bt < 0.25 ? Math.sin(bt * 40) * Math.exp(-bt * 12) * 0.6 : 0);

    this.basket.update(now, dt);
    this.stack.update(dt);
    this.ink.prepare();
  }
}
