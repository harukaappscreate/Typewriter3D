import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas } from '../fx/textures.js';
import { clamp } from '../core/anim.js';

// 段ごとの奥行きと高さ（階段状のキーボード）
export const ROW_Z = [0.6, 0.81, 1.02, 1.23];
const deckY = (z) => 0.44 + (1.5 - z) * 0.4074;
export const rowTopY = (r) => deckY(ROW_Z[r]) + 0.15;

const CAP_R = 0.08;
const ATLAS_N = 8;
const PRESS_DEPTH = 0.055;

/** キートップの文字（ガラスの下の刻印）をまとめた1枚のテクスチャ */
function legendAtlas(keys) {
  const cell = 128;
  const c = makeCanvas(cell * ATLAS_N, cell * ATLAS_N);
  const g = c.getContext('2d');
  g.fillStyle = '#0e0e10'; g.fillRect(0, 0, c.width, c.height);
  keys.forEach((k, i) => {
    const cx = (i % ATLAS_N) * cell + cell / 2;
    const cy = Math.floor(i / ATLAS_N) * cell + cell / 2;
    // 地：黒い円盤＋内側の細いリング
    const gr = g.createRadialGradient(cx - 14, cy - 18, 4, cx, cy, cell / 2);
    gr.addColorStop(0, '#2a2a2e'); gr.addColorStop(1, '#0b0b0d');
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, cell / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(239,233,216,.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, cell / 2 - 10, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#efe9d8';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (k.special) {
      g.font = `700 ${k.label.length > 3 ? 24 : 30}px "Courier Prime", monospace`;
      g.fillText(k.label, cx, cy + 2);
    } else if (/[a-z]/.test(k.lower)) {
      g.font = '700 62px "Courier Prime", monospace';
      g.fillText(k.upper, cx, cy + 4);
    } else {
      g.font = '700 40px "Courier Prime", monospace';
      g.fillText(k.upper, cx, cy - 20);
      g.fillText(k.lower, cx, cy + 24);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Keyboard {
  constructor(mats, layout) {
    this.mats = mats;
    this.layout = layout;
    this.keys = layout.keys;
    this.group = new THREE.Group();
    this.group.name = 'keyboard';
    const n = this.keys.length;
    this.press = new Float32Array(n);     // 0..1 押し込み量
    this.wobble = new Float32Array(n);    // へんてこモードの揺れ（上下）
    this.tint = new Float32Array(n);      // 0..1 光り具合
    this.tintColor = Array.from({ length: n }, () => new THREE.Color(1, 1, 1));
    this.dirty = true;
    this._build();
  }

  _build() {
    const { mats, keys } = this;
    const n = keys.length;

    // キートップ：側面（黒）・上面（刻印）
    const capGeo = new THREE.CylinderGeometry(CAP_R, CAP_R * 0.96, 0.024, 36, 1);
    capGeo.rotateY(Math.PI / 2); // 刻印の向きを手前に合わせる
    const atlas = legendAtlas(keys);
    const legendMat = new THREE.MeshPhysicalMaterial({
      map: atlas, roughness: 0.6, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.08, envMapIntensity: 0.35,
    });
    legendMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          #ifdef USE_MAP
            vMapUv = vMapUv * ${(1 / ATLAS_N).toFixed(6)} + aCell;
          #endif`);
    };
    const sideMat = new THREE.MeshStandardMaterial({ color: '#0c0c0e', roughness: 0.4, metalness: 0.2 });
    const cells = new Float32Array(n * 2);
    keys.forEach((k, i) => {
      cells[i * 2] = (i % ATLAS_N) / ATLAS_N;
      cells[i * 2 + 1] = 1 - (Math.floor(i / ATLAS_N) + 1) / ATLAS_N;
    });
    capGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    // CylinderGeometry のグループ：0=側面, 1=上面, 2=底面
    this.caps = new THREE.InstancedMesh(capGeo, [sideMat, legendMat, sideMat], n);

    const ringGeo = new THREE.TorusGeometry(CAP_R + 0.004, 0.011, 10, 40);
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.translate(0, 0.008, 0);
    // 側面を覆うクロームの帯
    const skirt = new THREE.CylinderGeometry(CAP_R + 0.012, CAP_R + 0.008, 0.03, 36, 1, true);
    skirt.translate(0, -0.006, 0);
    this.rings = new THREE.InstancedMesh(ringGeo, mats.chrome, n);
    this.skirts = new THREE.InstancedMesh(skirt, mats.chrome, n);

    const stemGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 8);
    stemGeo.translate(0, -0.5, 0);
    this.stems = new THREE.InstancedMesh(stemGeo, mats.steel, n);

    for (const m of [this.caps, this.rings, this.skirts, this.stems]) {
      m.castShadow = true; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.caps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    this.caps.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // 各キーの基準位置
    this.base = keys.map((k) => new THREE.Vector3(k.x, rowTopY(k.row), ROW_Z[k.row]));
    this.stemLen = keys.map((k) => rowTopY(k.row) - deckY(ROW_Z[k.row]) + 0.05);

    // スペースバー
    const sb = new THREE.Group();
    const bar = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.055, 0.1, 3, 0.025), mats.chrome);
    sb.add(bar);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.32), mats.steel);
      arm.position.set(s * 0.9, -0.02, -0.17);
      arm.rotation.x = -0.35;
      sb.add(arm);
    }
    sb.position.set(0, 0.53, 1.43);
    sb.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.spaceBar = sb;
    this.spaceBarMesh = bar;
    this.spacePress = 0;
    this.group.add(sb);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this.update();
  }

  setPress(i, v) {
    v = clamp(v, 0, 1);
    if (this.press[i] !== v) { this.press[i] = v; this.dirty = true; }
  }
  setWobble(i, v) {
    if (this.wobble[i] !== v) { this.wobble[i] = v; this.dirty = true; }
  }
  setTint(i, amount, color) {
    this.tint[i] = amount;
    if (color) this.tintColor[i].set(color);
    this.dirty = true;
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const { _m: m, _q: q, _s: s, _p: p } = this;
    const col = new THREE.Color();
    for (let i = 0; i < this.keys.length; i++) {
      const b = this.base[i];
      const dy = -this.press[i] * PRESS_DEPTH + this.wobble[i];
      p.set(b.x, b.y + dy, b.z);
      s.set(1, 1, 1);
      m.compose(p, q, s);
      this.caps.setMatrixAt(i, m);
      this.rings.setMatrixAt(i, m);
      this.skirts.setMatrixAt(i, m);
      p.y -= 0.012;
      s.set(1, this.stemLen[i] + dy, 1);
      m.compose(p, q, s);
      this.stems.setMatrixAt(i, m);
      const t = this.tint[i];
      col.setRGB(1, 1, 1).lerp(this.tintColor[i], t);
      this.caps.setColorAt(i, col);
    }
    this.caps.instanceMatrix.needsUpdate = true;
    this.rings.instanceMatrix.needsUpdate = true;
    this.skirts.instanceMatrix.needsUpdate = true;
    this.stems.instanceMatrix.needsUpdate = true;
    this.caps.instanceColor.needsUpdate = true;
    this.spaceBar.position.y = 0.53 - this.spacePress * 0.045;
  }

  setSpacePress(v) { this.spacePress = v; this.dirty = true; }

  /** レイキャスト用の対象 */
  get pickables() { return [this.caps, this.rings, this.spaceBarMesh]; }
}
