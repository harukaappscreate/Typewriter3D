import * as THREE from 'three';
import { ParticlePool } from './Particles.js';
import { softDot, smokePuff, makeCanvas } from './textures.js';
import { rand, pick, clamp } from '../core/anim.js';

/**
 * へんてこモード
 *  - 速く打つほど機械が熱を持ち、火花と煙。限界を超えると「ボン！」
 *  - 速打ちで活字棒が絡まる（JAM）。連打でほどく
 *  - 打った文字が紙から飛び出して舞う
 *  - ときどき「呪われた活字」が別の文字を打つ
 *  - 放っておくと活字棒がウェーブを踊る
 *  - インクが暴れる、ベルがメロディを奏でる、キャリッジがびよーんと跳ねる
 */
export class Henteko {
  constructor({ typewriter, scene, audio, camera, env, post, ui }) {
    this.tw = typewriter;
    this.scene = scene;
    this.audio = audio;
    this.cameraRig = camera;
    this.env = env;
    this.post = post;
    this.ui = ui;
    this.enabled = false;
    this.heat = 0;
    this.time = 0;
    this.lastJam = -99;
    this.mash = 0;
    this.idle = 0;
    this.cooling = 0;
    this.flash = 0;

    this.sparks = new ParticlePool({ max: 400, texture: softDot(32, 0.3), additive: true });
    this.smoke = new ParticlePool({ max: 160, texture: smokePuff(128) });
    this.inkDrops = new ParticlePool({ max: 200, texture: softDot(32, 0.6) });
    scene.add(this.sparks.points, this.smoke.points, this.inkDrops.points);

    // 飛び出す文字
    this.glyphCache = new Map();
    this.glyphs = [];
    for (let i = 0; i < 28; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 12;
      s.userData = { life: 0 };
      scene.add(s);
      this.glyphs.push(s);
    }
    this._gi = 0;

    this.mods = {
      wild: () => (this.enabled ? 0.12 + this.heat * 0.55 : 0),
      strikeStrength: () => (this.enabled ? this.heat * 0.2 : 0),
      shouldJam: (now) => this._shouldJam(now),
      mapChar: (ch) => this._mapChar(ch),
    };
    typewriter.mods = this.mods;

    typewriter.on('strike', (e) => this._onStrike(e));
    typewriter.on('space', () => this._onActivity());
    typewriter.on('bell', () => { if (this.enabled) this.audio.bellMelody(); });
    typewriter.on('carriageStop', () => {
      if (!this.enabled) return;
      this.tw.carriageSpring.v *= 4.5;
      this.audio.boing();
      this.cameraRig.kick(0.6);
    });
    typewriter.on('return', () => this._onActivity());
  }

  setViewport(h, fov) {
    this.sparks.setViewport(h, fov);
    this.smoke.setViewport(h, fov);
    this.inkDrops.setViewport(h, fov);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.heat = 0;
      for (let i = 0; i < this.tw.basket.count; i++) this.tw.basket.setExtra(i, 0);
      this.tw.keyboard.wobble.fill(0);
      this.tw.keyboard.tint.fill(0);
      this.tw.keyboard.dirty = true;
      if (this.tw.jammed) this.tw.unjam();
      this.ui?.showJam(false);
    }
  }

  // ---------- JAM ----------
  _shouldJam(now) {
    if (!this.enabled || now - this.lastJam < 9) return false;
    const rate = this.tw.burstRate;
    if (rate < 5) return false;
    if (Math.random() < 0.025 + this.heat * 0.07) { this.lastJam = now; this.mash = 0; this.ui?.showJam(true); return true; }
    return false;
  }

  /** JAM 中に何か押されたら呼ぶ */
  mashKey() {
    this.mash++;
    this.audio.rattle();
    this.cameraRig.kick(0.5);
    this.tw.basket.jammed && (this.tw.basket.jammed.shake += 0.3);
    if (this.mash >= 4) {
      this.tw.unjam();
      this.ui?.showJam(false);
      this._burstSparks(this.tw.printPointWorld(), 30, 1.2);
    }
  }

  // ---------- 呪われた活字 ----------
  _mapChar(ch) {
    if (!this.enabled || Math.random() > 0.025 + this.heat * 0.05) return ch;
    const pool = 'abcdefghijklmnopqrstuvwxyz?!@#$%&*~';
    const out = pick(pool);
    const info = this.tw.layout.charMap.get(out);
    if (info) {
      const k = info.key.index;
      this.tw.keyboard.setTint(k, 1, '#b46bff');
      setTimeout(() => this.tw.keyboard.setTint(k, 0), 900);
    }
    return out;
  }

  // ---------- 打鍵のたびに ----------
  _onActivity() {
    this.idle = 0;
    if (this._dancing) this._stopDance();
  }

  _onStrike(e) {
    this._onActivity();
    if (!this.enabled) {
      // 通常時も紙粉をほんの少し
      this._paperDust(e.point, 2);
      return;
    }
    const rate = this.tw.burstRate;
    this.heat = clamp(this.heat + 0.012 + Math.max(0, rate - 3) * 0.006, 0, 1.2);
    this._burstSparks(e.point, Math.round(2 + this.heat * 16), 0.4 + this.heat);
    if (this.heat > 0.35) this.audio.sizzle(this.heat);
    this._launchGlyph(e.ch, e.point, e.wild);
    if (Math.random() < 0.06 + this.heat * 0.2) {
      this.tw.ink.splat(e.col, e.lineY, 0.15 + this.heat * 0.5, this.tw.ribbon.color);
      this._inkDroplets(e.point, 8);
    }
    this.cameraRig.kick(0.15 + this.heat * 0.5);
    if (this.heat >= 1 && this.cooling <= 0) this._overheat(e);
  }

  _overheat(e) {
    this.cooling = 4;
    this.audio.boom();
    this.flash = 1;
    this.env.flicker = 1.2;
    this.cameraRig.kick(1.5);
    this._burstSparks(e.point, 160, 2.6);
    for (let i = 0; i < 40; i++) {
      this.smoke.emit({
        x: e.point.x + rand(-0.4, 0.4), y: e.point.y + rand(-0.1, 0.3), z: e.point.z + rand(0, 0.6),
        vx: rand(-0.6, 0.6), vy: rand(0.3, 1.1), vz: rand(-0.2, 0.8),
        color: [0.25, 0.22, 0.2], size: rand(0.25, 0.5), alpha: 0.6, life: rand(2, 4), grow: 0.5, drag: 0.8,
      });
    }
    this.tw.ink.splat(e.col, e.lineY, 1.4, 'black');
    this.tw.ink.splat(Math.min(47, e.col + 6), e.lineY + 0.2, 0.9, 'red');
    this._inkDroplets(e.point, 60);
    this.ui?.toast('ボン！ 機械が熱くなりすぎた');
    this.heat = 0.35;
    // 焦げた紙は吹き飛ばして新しい紙へ
    setTimeout(() => { if (this.enabled) this.tw.ejectPage(); }, 700);
  }

  _burstSparks(p, n, power) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), up = rand(0.2, 1);
      const sp = rand(0.6, 2.2) * power;
      const hot = Math.random();
      this.sparks.emit({
        x: p.x, y: p.y, z: p.z + 0.03,
        vx: Math.cos(a) * sp * 0.7, vy: up * sp, vz: Math.abs(Math.sin(a)) * sp * 0.8,
        color: hot > 0.7 ? [1, 0.95, 0.7] : [1, 0.45 + hot * 0.3, 0.12],
        size: rand(0.008, 0.02), alpha: 1, life: rand(0.25, 0.8), drag: 1.2, gravity: 4.5,
      });
    }
  }

  _paperDust(p, n) {
    for (let i = 0; i < n; i++) {
      this.inkDrops.emit({
        x: p.x + rand(-0.02, 0.02), y: p.y + rand(-0.01, 0.02), z: p.z + 0.02,
        vx: rand(-0.15, 0.15), vy: rand(0.05, 0.25), vz: rand(0.05, 0.3),
        color: [0.95, 0.92, 0.85], size: rand(0.004, 0.008), alpha: 0.6, life: rand(0.5, 1.2), drag: 2, gravity: 0.3,
      });
    }
  }

  _inkDroplets(p, n) {
    const ink = this.tw.ribbon.color === 'red' ? [0.55, 0.08, 0.06] : [0.05, 0.05, 0.08];
    for (let i = 0; i < n; i++) {
      this.inkDrops.emit({
        x: p.x, y: p.y, z: p.z + 0.04,
        vx: rand(-1, 1), vy: rand(0.2, 1.6), vz: rand(0.2, 1.4),
        color: ink, size: rand(0.008, 0.022), alpha: 0.95, life: rand(0.5, 1.1), drag: 0.6, gravity: 5,
      });
    }
  }

  _glyphTexture(ch) {
    if (this.glyphCache.has(ch)) return this.glyphCache.get(ch);
    const c = makeCanvas(128, 128);
    const g = c.getContext('2d');
    g.font = '400 96px "Special Elite", "Courier Prime", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,190,90,0.9)'; g.shadowBlur = 14;
    g.fillStyle = '#1d1b26';
    g.fillText(ch, 64, 70);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,230,190,0.85)'; g.lineWidth = 2;
    g.strokeText(ch, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.glyphCache.set(ch, t);
    return t;
  }

  _launchGlyph(ch, p, wild) {
    const s = this.glyphs[this._gi];
    this._gi = (this._gi + 1) % this.glyphs.length;
    s.material.map = this._glyphTexture(ch);
    s.material.needsUpdate = true;
    s.material.opacity = 1;
    s.material.rotation = rand(-0.5, 0.5);
    s.position.copy(p).add(new THREE.Vector3(0, 0.02, 0.05));
    s.scale.setScalar(0.06);
    s.visible = true;
    s.userData = {
      life: 1.4, max: 1.4,
      v: new THREE.Vector3(rand(-0.5, 0.5), rand(1.0, 1.9) * (1 + wild), rand(0.3, 0.9)),
      spin: rand(-6, 6),
    };
  }

  // ---------- 放置するとウェーブ ----------
  _stopDance() {
    this._dancing = false;
    for (let i = 0; i < this.tw.basket.count; i++) this.tw.basket.setExtra(i, 0);
    this.tw.keyboard.wobble.fill(0);
    this.tw.keyboard.dirty = true;
  }

  update(dt) {
    this.time += dt;
    this.cooling = Math.max(0, this.cooling - dt);
    this.heat = Math.max(0, this.heat - dt * (this.enabled ? 0.07 : 1));
    const tw = this.tw;
    tw.basket.heat = this.enabled ? clamp((this.heat - 0.3) / 0.7, 0, 1) : 0;
    tw.mats.body.emissive?.setRGB(this.heat * 0.25 * (this.enabled ? 1 : 0), this.heat * 0.03, 0);
    if (this.post) {
      this.post.heat = this.enabled ? clamp((this.heat - 0.4) / 0.6, 0, 1) : 0;
      this.post.flash = this.flash;
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.enabled && this.heat > 0.75) this.env.flicker = Math.max(this.env.flicker, (this.heat - 0.75) * 1.2);

    // 熱いと煙が立つ
    if (this.enabled && this.heat > 0.45 && Math.random() < this.heat * dt * 14) {
      const p = tw.printPointWorld();
      this.smoke.emit({
        x: p.x + rand(-0.6, 0.6), y: 0.95, z: p.z + rand(0.2, 0.9),
        vx: rand(-0.05, 0.05), vy: rand(0.25, 0.5), vz: rand(-0.02, 0.05),
        color: [0.55, 0.52, 0.5], size: rand(0.12, 0.22), alpha: 0.28 * this.heat, life: rand(1.8, 3), grow: 0.25, drag: 0.4,
      });
    }

    // 放置ダンス
    if (this.enabled && !tw.jammed && tw.isIdle) {
      this.idle += dt;
      if (this.idle > 3.5) {
        this._dancing = true;
        const t = this.idle - 3.5;
        const amp = Math.min(1, t * 0.6);
        for (let i = 0; i < tw.basket.count; i++) {
          const slot = tw.basket.slotOf[i];
          const w = Math.max(0, Math.sin(t * 3.2 - slot * 0.32));
          tw.basket.setExtra(i, -w * w * 0.9 * amp);
        }
        tw.layout.keys.forEach((k, i) => {
          tw.keyboard.setWobble(i, Math.max(0, Math.sin(t * 3.2 - k.x * 4 - k.row * 0.6)) * 0.03 * amp);
        });
      }
    } else if (this._dancing && !tw.isIdle) {
      this._stopDance();
    }

    // 飛ぶ文字
    for (const s of this.glyphs) {
      const u = s.userData;
      if (!s.visible) continue;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      u.v.y -= dt * 1.2;
      s.position.addScaledVector(u.v, dt);
      s.material.rotation += u.spin * dt;
      const k = u.life / u.max;
      s.scale.setScalar(0.06 + (1 - k) * 0.14);
      s.material.opacity = Math.min(1, k * 2);
    }

    this.sparks.update(dt);
    this.smoke.update(dt);
    this.inkDrops.update(dt);
  }
}
