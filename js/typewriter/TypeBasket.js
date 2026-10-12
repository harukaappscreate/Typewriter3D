import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MACHINE, PRINT_POINT, TIMING } from '../config.js';
import { ease, lerp, clamp } from '../core/anim.js';

// 活字棒のバスケット：扇形に並んだ活字棒が跳ね上がって印字点を打つ

const R = MACHINE.segmentRadius;
const H = MACHINE.pivotDrop;
const L = Math.hypot(R, H);                 // 活字棒の長さ（支点→印字点）
const REST = MACHINE.restDroop;             // 待機角
const STRIKE = Math.atan2(-H, -R);          // 打つ瞬間の角度（約 -158°）

function sectorShape(r0, r1, span, seg = 48) {
  // 形状の (x, y) は回転後に (x, -z) になる
  const s = new THREE.Shape();
  for (let i = 0; i <= seg; i++) {
    const a = -span + (2 * span * i) / seg;
    const x = r1 * Math.sin(a), y = -r1 * Math.cos(a);
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  for (let i = seg; i >= 0; i--) {
    const a = -span + (2 * span * i) / seg;
    s.lineTo(r0 * Math.sin(a), -r0 * Math.cos(a));
  }
  s.closePath();
  return s;
}

export class TypeBasket {
  constructor(mats, layout) {
    this.mats = mats;
    this.layout = layout;
    this.group = new THREE.Group();
    this.group.name = 'typebasket';
    this.count = layout.typebarCount;
    this.angle = new Float32Array(this.count).fill(REST);
    this.extra = new Float32Array(this.count);     // へんてこモードの波
    this.anim = new Array(this.count).fill(null);  // { start }
    this.jammed = null;
    this.shift = 0;
    this.shiftTarget = 0;
    this.heat = 0;
    this._build();
  }

  _build() {
    const { mats } = this;
    const P = PRINT_POINT;
    const span = MACHINE.basketSpan;

    // 活字棒を左右の位置順にスロットへ（左のキー→左の活字棒）
    const barKeys = this.layout.keys.filter((k) => k.typebar >= 0);
    const sorted = [...barKeys].sort((a, b) => (a.x - b.x) || (a.row - b.row));
    this.slotOf = new Int32Array(this.count);
    sorted.forEach((k, slot) => { this.slotOf[k.typebar] = slot; });
    this.theta = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const slot = this.slotOf[i];
      this.theta[i] = -span + (2 * span * slot) / (this.count - 1);
    }

    // セグメント（支点が並ぶ半円のブロック）
    const segGeo = new THREE.ExtrudeGeometry(sectorShape(R - 0.07, R + 0.05, span + 0.08), {
      depth: 0.09, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 4,
    });
    segGeo.rotateX(-Math.PI / 2);
    const seg = new THREE.Mesh(segGeo, mats.darkSteel);
    seg.position.set(P.x, P.y - H - 0.05, P.z);
    this.group.add(seg);

    // 活字棒の受け（フェルトの円弧）
    const restR = R + L;
    const feltGeo = new THREE.ExtrudeGeometry(sectorShape(restR - 0.06, restR + 0.05, span + 0.06), {
      depth: 0.03, bevelEnabled: false, curveSegments: 4,
    });
    feltGeo.rotateX(-Math.PI / 2);
    const felt = new THREE.Mesh(feltGeo, mats.felt);
    const restY = P.y - H - Math.sin(REST) * L - 0.035;
    felt.position.set(P.x, restY - 0.03, P.z);
    this.group.add(felt);
    const feltBase = new THREE.ExtrudeGeometry(sectorShape(restR - 0.065, restR + 0.055, span + 0.065), {
      depth: restY - 0.03 - 0.62, bevelEnabled: false, curveSegments: 4,
    });
    feltBase.rotateX(-Math.PI / 2);
    const fb = new THREE.Mesh(feltBase, mats.interior);
    fb.position.set(P.x, 0.62, P.z);
    this.group.add(fb);

    // 活字ガイド（印字点の手前のU字金具）
    const guide = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 20, Math.PI), mats.chrome);
    guide.position.set(P.x, P.y - 0.055, P.z + 0.03);
    this.group.add(guide);

    // 活字棒（1本のジオメトリを InstancedMesh で並べる）
    const bar = new THREE.BoxGeometry(0.008, 0.02, L - 0.03);
    bar.translate(0, 0, (L - 0.03) / 2);
    const hub = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12);
    hub.rotateZ(Math.PI / 2);
    const slug = new THREE.BoxGeometry(0.03, 0.044, 0.034);
    slug.translate(0, 0.004, L - 0.015);
    const geo = mergeGeometries([bar.toNonIndexed(), hub.toNonIndexed(), slug.toNonIndexed()]);
    this.barMat = mats.steel.clone();
    this.barMat.emissive = new THREE.Color('#ff3a10');
    this.barMat.emissiveIntensity = 0;
    this.bars = new THREE.InstancedMesh(geo, this.barMat, this.count);
    this.bars.castShadow = true;
    this.bars.receiveShadow = true;
    this.bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bars.frustumCulled = false;

    // 支点の位置と向き
    this.pivotGroup = new THREE.Group();
    this.pivotGroup.position.set(P.x, P.y - H, P.z);
    this.pivotGroup.add(this.bars);
    this.group.add(this.pivotGroup);

    this._m = new THREE.Matrix4();
    this._my = new THREE.Matrix4();
    this._mx = new THREE.Matrix4();
    this._needs = true;
    this._writeAll();
  }

  /** i 番の活字棒を打つ */
  strike(i, now) {
    if (i < 0) return;
    this.anim[i] = { start: now };
  }

  /** 打ってから印字点に届くまでの時間 */
  get hitDelay() { return TIMING.barUp; }

  /** 2本の活字棒が絡まる（へんてこモード） */
  jam(a, b) {
    this.jammed = { a, b, shake: 0 };
    this.anim[a] = null; this.anim[b] = null;
  }
  unjam(now) {
    if (!this.jammed) return;
    const { a, b } = this.jammed;
    this.jammed = null;
    // ゆっくり元に戻す
    this.anim[a] = { start: now - TIMING.barUp, slow: true };
    this.anim[b] = { start: now - TIMING.barUp, slow: true };
  }

  _writeAll() {
    const { _m: m, _my: my, _mx: mx } = this;
    for (let i = 0; i < this.count; i++) {
      const th = this.theta[i];
      const ox = R * Math.sin(th), oz = R * Math.cos(th);
      my.makeRotationY(th);
      mx.makeRotationX(this.angle[i] + this.extra[i]);
      m.multiplyMatrices(my, mx);
      m.setPosition(ox, 0, oz);
      this.bars.setMatrixAt(i, m);
    }
    this.bars.instanceMatrix.needsUpdate = true;
  }

  update(now, dt) {
    let changed = false;
    for (let i = 0; i < this.count; i++) {
      const a = this.anim[i];
      if (!a) continue;
      const up = TIMING.barUp, down = a.slow ? 0.45 : TIMING.barDown;
      const t = now - a.start;
      let ang;
      if (t < up) ang = lerp(REST, STRIKE, ease.inQuad(t / up));
      else if (t < up + down) {
        const u = (t - up) / down;
        // 戻りの終わりにフェルトで小さく跳ねる
        ang = lerp(STRIKE, REST, ease.outCubic(u)) - Math.sin(u * Math.PI) * 0.0 + (u > 0.75 ? Math.sin((u - 0.75) * 4 * Math.PI) * 0.05 * (1 - u) * 4 : 0);
      } else { ang = REST; this.anim[i] = null; }
      this.angle[i] = ang;
      changed = true;
    }
    if (this.jammed) {
      const j = this.jammed;
      j.shake += dt;
      const s = Math.sin(j.shake * 40) * 0.02;
      this.angle[j.a] = STRIKE * 0.62 + s;
      this.angle[j.b] = STRIKE * 0.66 - s;
      changed = true;
    }
    // 段シフト（大文字は活字の下半分で打つので、バスケットが下がる）
    const ps = this.shift;
    this.shift += (this.shiftTarget - this.shift) * clamp(dt * 30, 0, 1);
    if (Math.abs(ps - this.shift) > 1e-5) {
      this.pivotGroup.position.y = PRINT_POINT.y - H - this.shift * 0.035;
    }
    this.barMat.emissiveIntensity = this.heat * 1.6;
    if (changed || this._needs) { this._needs = false; this._writeAll(); }
  }

  setExtra(i, v) { this.extra[i] = v; this._needs = true; }
  get isIdle() { return this.anim.every((a) => !a) && !this.jammed; }
  /** 活字棒の先端（印字点）のワールド座標 */
  static get strikeAngle() { return STRIKE; }
}
