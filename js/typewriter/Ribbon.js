import * as THREE from 'three';
import { PRINT_POINT } from '../config.js';
import { makeCanvas } from '../fx/textures.js';
import { smoothstep } from '../core/anim.js';

// インクリボン：左右のスプール、ガイド、印字の瞬間に持ち上がる「ビブレーター」

const RIBBON_Y = 1.062;    // 待機時のリボン中心の高さ
const RIBBON_Z = PRINT_POINT.z + 0.026;
const RIBBON_H = 0.05;
const SPOOL_X = 1.2;
const SPOOL_Z = -0.49;

function ribbonTexture() {
  const c = makeCanvas(8, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#121216'; g.fillRect(0, 0, 8, 32);   // 上半分：黒
  g.fillStyle = '#7a1612'; g.fillRect(0, 32, 8, 32);  // 下半分：赤
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.fillRect(0, 0, 8, 2); g.fillRect(0, 62, 8, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Ribbon {
  constructor(mats) {
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.name = 'ribbon';
    this.lift = 0;          // 0..1
    this.color = 'black';   // 'black' | 'red'
    this.spin = 0;
    this.used = 0.5;        // 0..1 巻き取りの進み具合
    this._build();
  }

  _build() {
    const { mats } = this;
    // リボンの帯
    const segs = 80;
    const geo = new THREE.PlaneGeometry(SPOOL_X * 2, RIBBON_H, segs, 1);
    this.ribbonGeo = geo;
    this.ribbonBase = Float32Array.from(geo.attributes.position.array);
    const mat = new THREE.MeshStandardMaterial({ map: ribbonTexture(), roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
    this.ribbon = new THREE.Mesh(geo, mat);
    this.ribbon.position.set(0, RIBBON_Y, RIBBON_Z);
    this.ribbon.castShadow = true;
    this.ribbon.receiveShadow = true;
    this.group.add(this.ribbon);

    // スプール
    this.spools = [];
    for (const s of [-1, 1]) {
      const sp = new THREE.Group();
      sp.position.set(s * SPOOL_X, 1.0, SPOOL_Z);
      const flangeGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.008, 40);
      const f1 = new THREE.Mesh(flangeGeo, mats.chrome); f1.position.y = 0.012;
      const f2 = new THREE.Mesh(flangeGeo, mats.chrome); f2.position.y = 0.112;
      // 穴あきの飾り
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 16), mats.darkSteel); hub.position.y = 0.062;
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.096, 40), mats.ribbonRoll); roll.position.y = 0.062;
      const spokeGeo = new THREE.BoxGeometry(0.24, 0.006, 0.02);
      for (let k = 0; k < 3; k++) {
        const spoke = new THREE.Mesh(spokeGeo, mats.chrome);
        spoke.position.y = 0.118; spoke.rotation.y = (k * Math.PI) / 3;
        sp.add(spoke);
      }
      sp.add(f1, f2, hub, roll);
      sp.userData.roll = roll;
      this.spools.push(sp);
      this.group.add(sp);
    }

    // リボンガイド
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 10), mats.chrome);
      post.position.set(s * 0.52, RIBBON_Y - 0.02, RIBBON_Z + 0.015);
      this.group.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.02), mats.chrome);
      arm.position.set(s * 0.8, RIBBON_Y - 0.085, RIBBON_Z + 0.02);
      this.group.add(arm);
    }

    // ビブレーター（リボンを持ち上げる二股の金具）
    const vib = new THREE.Group();
    const forkGeo = new THREE.BoxGeometry(0.008, 0.11, 0.012);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(forkGeo, mats.chrome);
      f.position.set(s * 0.05, -0.03, 0.012);
      vib.add(f);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.01, 0.012), mats.chrome);
    bridge.position.set(0, -0.085, 0.012);
    vib.add(bridge);
    vib.position.set(0, RIBBON_Y, RIBBON_Z);
    this.vibrator = vib;
    this.group.add(vib);

    this.group.traverse((o) => { if (o.isMesh && o !== this.ribbon) { o.castShadow = true; o.receiveShadow = true; } });
    this._applyRolls();
    this.update(0);
  }

  _applyRolls() {
    const [l, r] = this.spools;
    const rl = 0.05 + 0.085 * (1 - this.used);
    const rr = 0.05 + 0.085 * this.used;
    l.userData.roll.scale.set(rl, 1, rl);
    r.userData.roll.scale.set(rr, 1, rr);
  }

  /** 打鍵ごとにリボンが少し送られる */
  advance() {
    this.spin += 0.09;
    this.used = (this.used + 0.0006) % 1;
    this._applyRolls();
  }

  /** リボンの持ち上げ量（印字点の高さに色の帯を合わせる） */
  get liftHeight() {
    const toBand = this.color === 'red' ? -RIBBON_H / 4 : RIBBON_H / 4;
    return PRINT_POINT.y - (RIBBON_Y + toBand);
  }

  update(dt) {
    const lift = this.lift * this.liftHeight;
    const pos = this.ribbonGeo.attributes.position.array;
    const base = this.ribbonBase;
    for (let i = 0; i < pos.length; i += 3) {
      const x = base[i];
      const w = 1 - smoothstep(0.07, 0.5, Math.abs(x));
      pos[i + 1] = base[i + 1] + lift * w;
      pos[i + 2] = base[i + 2] - 0.012 * w * this.lift;
    }
    this.ribbonGeo.attributes.position.needsUpdate = true;
    this.vibrator.position.y = RIBBON_Y + lift;
    this.spools[0].rotation.y = this.spin;
    this.spools[1].rotation.y = this.spin;
  }
}
