import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, lerp, ease } from '../core/anim.js';

// カメラ：視点プリセット、画面比に合わせた構図、打鍵の揺れ、マウスの視差、自由視点

const VIEWS = {
  // 机全体と機械（基本）
  overview: { pos: [0, 3.95, 5.7], target: [0, 1.3, -0.4], width: 5.6, fov: 34 },
  // 紙に寄る（スマホのキーボード表示中など）
  paper: { pos: [0, 2.55, 2.45], target: [0, 1.75, -0.95], width: 2.7, fov: 34 },
  // 活字棒のアップ
  close: { pos: [1.35, 1.9, 1.0], target: [-0.05, 1.12, -0.55], width: 1.7, fov: 40 },
};
export const VIEW_ORDER = ['overview', 'paper', 'close', 'free'];
export const VIEW_LABELS = { overview: '全体', paper: '紙', close: '活字', free: '自由' };

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.mode = 'overview';
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.curPos = new THREE.Vector3(0, 1.6, 2.2);
    this.curTarget = new THREE.Vector3(0, 1.0, 0.6);
    this.curFov = 34;
    this.shake = 0;
    this.shakeV = new THREE.Vector3();
    this.parallax = new THREE.Vector2();
    this.parallaxTarget = new THREE.Vector2();
    this.drift = 0;
    this.followY = 0;
    this.followX = 0;
    this.smoothX = 0;
    this.intro = null;

    this.controls = new OrbitControls(camera, dom);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 11;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.target.set(0, 1.1, -0.3);

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.parallaxTarget.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    });
    this.setMode('overview', true);
  }

  /** 視点を切り替え */
  setMode(mode, instant = false) {
    this.mode = mode;
    if (mode === 'free') {
      this.controls.enabled = true;
      this.controls.target.copy(this.curTarget);
      this.camera.position.copy(this.curPos);
      return;
    }
    this.controls.enabled = false;
    this._computeView();
    if (instant) { this.curPos.copy(this.pos); this.curTarget.copy(this.target); }
  }

  nextMode() {
    const i = VIEW_ORDER.indexOf(this.mode);
    this.setMode(VIEW_ORDER[(i + 1) % VIEW_ORDER.length]);
    return this.mode;
  }

  /** 画面の縦横比に合わせて、必要な幅が収まる距離まで引く */
  _computeView() {
    const v = VIEWS[this.mode] || VIEWS.overview;
    const aspect = this.camera.aspect || 1;
    // 縦長画面：画角を広げ、必要な幅も少し詰めて、機械を大きく見せる
    const portrait = aspect < 0.85;
    const fov = portrait ? Math.min(62, v.fov * (1 + (0.85 - aspect) * 1.6)) : v.fov;
    const width = portrait ? (this.mode === 'paper' ? 1.45 : v.width * 0.74) : v.width;
    const vfov = THREE.MathUtils.degToRad(fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const t = new THREE.Vector3(...v.target);
    const p = new THREE.Vector3(...v.pos);
    const dir = p.clone().sub(t);
    const baseDist = dir.length();
    const need = (width / 2) / Math.tan(hfov / 2);
    const dist = Math.max(baseDist * (portrait ? 0.8 : 1), need);
    dir.normalize();
    // 縦長画面では少し上から見下ろす
    if (portrait) { dir.y += (0.85 - aspect) * 0.6; dir.normalize(); }
    this.pos.copy(t).addScaledVector(dir, dist);
    this.target.copy(t);
    if (portrait && this.mode !== 'close') { this.target.y += 0.2; this.pos.y += 0.2; }
    this.fov = fov;
  }

  onResize() { if (this.mode !== 'free') this._computeView(); }

  /** 打鍵の衝撃 */
  kick(amount = 1) { this.shake = Math.min(1.5, this.shake + amount); }

  /** 紙が上がるのに合わせて少し視線を上げる（0..1）／キャリッジの位置 x */
  setFollow(v, carriageX = 0) { this.followY = v; this.followX = carriageX; }

  /** 起動演出：銘板のアップから全体へ */
  playIntro(duration = 3.2) {
    this.intro = { t: 0, duration, from: new THREE.Vector3(-1.6, 0.55, 2.6), fromT: new THREE.Vector3(-0.2, 0.45, 1.4) };
  }

  update(dt) {
    this.drift += dt;
    if (this.mode === 'free') {
      this.controls.update();
      this.curPos.copy(this.camera.position);
      this.curTarget.copy(this.controls.target);
      return;
    }
    this.parallax.lerp(this.parallaxTarget, clamp(dt * 3, 0, 1));
    let goalPos = this.pos.clone();
    const goalTarget = this.target.clone();
    // キャリッジ（紙）をゆっくり追う。紙の視点では強めに
    this.smoothX += (this.followX - this.smoothX) * (1 - Math.exp(-dt * 1.6));
    // 縦長の紙視点は印字点の少し左（打ったばかりの文字）を固定で映す
    const portrait = this.camera.aspect < 0.85;
    const fx = this.mode === 'paper' && portrait ? -0.3
      : this.smoothX * (this.mode === 'paper' ? 0.8 : this.mode === 'close' ? 0.0 : 0.15);
    goalTarget.x += fx; goalPos.x += fx;
    goalTarget.y += this.followY * (this.mode === 'paper' ? 0.5 : 0.25);
    goalPos.y += this.followY * (this.mode === 'paper' ? 0.5 : 0.2);
    // ゆっくり呼吸するような漂い
    goalPos.x += Math.sin(this.drift * 0.21) * 0.06 + this.parallax.x * 0.22;
    goalPos.y += Math.sin(this.drift * 0.17) * 0.035 - this.parallax.y * 0.12;

    if (this.intro) {
      const it = this.intro;
      it.t += dt;
      const k = ease.inOutCubic(clamp(it.t / it.duration, 0, 1));
      goalPos = it.from.clone().lerp(goalPos, k);
      // 弧を描くように
      goalPos.x += Math.sin(k * Math.PI) * -0.9;
      goalPos.y += Math.sin(k * Math.PI) * 0.4;
      goalTarget.lerpVectors(it.fromT, goalTarget, k);
      this.curPos.copy(goalPos); this.curTarget.copy(goalTarget);
      if (it.t >= it.duration) this.intro = null;
    } else {
      const k = 1 - Math.exp(-dt * 3.2);
      this.curPos.lerp(goalPos, k);
      this.curTarget.lerp(goalTarget, k);
    }
    this.curFov = lerp(this.curFov, this.fov || 34, 1 - Math.exp(-dt * 4));

    // 揺れ
    this.shake = Math.max(0, this.shake - dt * 5);
    const s = this.shake * this.shake * 0.012;
    this.shakeV.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);

    this.camera.position.copy(this.curPos).add(this.shakeV);
    this.camera.lookAt(this.curTarget.x + this.shakeV.x * 0.5, this.curTarget.y + this.shakeV.y * 0.5, this.curTarget.z);
    if (Math.abs(this.camera.fov - this.curFov) > 0.01) {
      this.camera.fov = this.curFov;
      this.camera.updateProjectionMatrix();
    }
  }
}
