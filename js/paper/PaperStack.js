import * as THREE from 'three';
import { PAPER } from '../config.js';
import { ease, rand } from '../core/anim.js';

// 打ち終えた紙が宙を舞い、机の上の原稿の山に積もる

const STACK_POS = new THREE.Vector3(-3.05, 0, 0.55);
const KEEP_TEXTURED = 6;

export class PaperStack {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'paperStack';
    scene.add(this.group);
    this.sheets = [];     // 積まれた紙
    this.flying = [];
    this.height = 0;
    this.blankMat = new THREE.MeshStandardMaterial({ color: '#efeadd', roughness: 0.9, side: THREE.DoubleSide });
  }

  _sheetGeometry() {
    const g = new THREE.PlaneGeometry(PAPER.width, PAPER.height, 8, 12);
    g.userData.base = Float32Array.from(g.attributes.position.array);
    return g;
  }

  /**
   * 紙を飛ばす
   * @param {HTMLCanvasElement} canvas 原稿の画像
   * @param {THREE.Matrix4} startMatrix 飛び立つ瞬間の紙の姿勢（中心）
   */
  launch(canvas, startMatrix, { wild = false, onLand } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this._sheetGeometry(), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    startMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    this.group.add(mesh);

    const p0 = mesh.position.clone();
    const q0 = mesh.quaternion.clone();
    const target = STACK_POS.clone();
    target.x += rand(-0.08, 0.08);
    target.z += rand(-0.08, 0.08);
    target.y = this.height + 0.004;
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rand(-0.25, 0.25) + 0.12));
    const p1 = p0.clone().add(new THREE.Vector3(-0.3, 1.0, 0.35));
    const p2 = target.clone().add(new THREE.Vector3(0.5, wild ? 3.2 : 1.7, 0.4));
    this.flying.push({
      mesh, p0, p1, p2, p3: target, q0, q1, t: 0,
      duration: wild ? 2.2 : 1.45, spinX: wild ? rand(4, 9) : 0, flutter: rand(0.8, 1.3), onLand,
    });
    this.height += 0.0045;
    return mesh;
  }

  update(dt) {
    const tmpQ = new THREE.Quaternion();
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / f.duration;
      const t = Math.min(1, f.t);
      const e = ease.inOutCubic(t);
      // 3次ベジェで弧を描く
      const a = 1 - e;
      f.mesh.position.set(0, 0, 0)
        .addScaledVector(f.p0, a * a * a)
        .addScaledVector(f.p1, 3 * a * a * e)
        .addScaledVector(f.p2, 3 * a * e * e)
        .addScaledVector(f.p3, e * e * e);
      tmpQ.copy(f.q0).slerp(f.q1, ease.outCubic(t));
      f.mesh.quaternion.copy(tmpQ);
      // ひらひら
      const wob = Math.sin(t * Math.PI) * 0.35;
      f.mesh.rotateX(Math.sin(t * 14 * f.flutter) * wob * 0.5 + f.spinX * Math.sin(t * Math.PI) * 0.4);
      f.mesh.rotateY(Math.cos(t * 11 * f.flutter) * wob * 0.4);
      // 紙のたわみ
      const pos = f.mesh.geometry.attributes.position;
      const base = f.mesh.geometry.userData.base;
      const amp = Math.sin(t * Math.PI) * 0.18;
      for (let k = 0; k < pos.count; k++) {
        const x = base[k * 3], y = base[k * 3 + 1];
        pos.array[k * 3 + 2] = Math.sin(y * 1.8 + t * 18) * amp * 0.5 + (x * x) * amp * 0.25;
      }
      pos.needsUpdate = true;
      if (t >= 1) {
        pos.array.set(base);
        pos.needsUpdate = true;
        f.mesh.geometry.computeVertexNormals();
        f.mesh.position.copy(f.p3);
        f.mesh.quaternion.copy(f.q1);
        this.flying.splice(i, 1);
        this.sheets.push(f.mesh);
        this._trim();
        f.onLand && f.onLand();
      }
    }
  }

  _trim() {
    // 古い紙は文字テクスチャを外してメモリを節約
    const n = this.sheets.length;
    if (n > KEEP_TEXTURED) {
      const old = this.sheets[n - KEEP_TEXTURED - 1];
      if (old.material !== this.blankMat) {
        old.material.map?.dispose();
        old.material.dispose();
        old.material = this.blankMat;
      }
    }
  }

  get isBusy() { return this.flying.length > 0; }
  static get position() { return STACK_POS; }
}

