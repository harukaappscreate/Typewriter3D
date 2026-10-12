import { MACHINE } from '../config.js';

/**
 * 紙が通る道筋（キャリッジ座標の y-z 平面）。
 * u = 0 が印字点。u > 0 は印字済みの側（プラテンの前から上へ立ち上がる）、
 * u < 0 は未印字の側（プラテンの下を回って後ろの紙受けへ）。
 */
export class PaperPath {
  constructor() {
    const { y: cy, z: cz } = MACHINE.platen;
    const r = MACHINE.paperRadius;
    this.r = r;
    this.min = -5; this.max = 5; this.step = 0.004;
    const n = Math.round((this.max - this.min) / this.step) + 1;
    this.Y = new Float32Array(n);
    this.Z = new Float32Array(n);
    this.n = n;

    const phiF = 0.45;              // 前側：この角度までプラテンに沿う
    const uA = r * phiF;
    const bendF = 0.14, bendLenF = 0.8; // その後ゆるく後ろへ反る
    const b0 = 0.25;                // 後ろ側：プラテンを離れる角度
    const uB = r * (-Math.PI + b0);
    const bendB = 0.42, bendLenB = 1.0;

    const i0 = Math.round((0 - this.min) / this.step);
    // 前側
    let y = cy, z = cz + r;
    for (let i = i0; i < n; i++) {
      const u = this.min + i * this.step;
      if (u <= uA) {
        const phi = u / r;
        y = cy + r * Math.sin(phi); z = cz + r * Math.cos(phi);
      } else {
        const k = Math.min(1, (u - uA) / bendLenF);
        const psi = phiF + bendF * k * k * (3 - 2 * k);
        y += Math.cos(psi) * this.step; z -= Math.sin(psi) * this.step;
      }
      this.Y[i] = y; this.Z[i] = z;
    }
    // 後ろ側
    y = cy; z = cz + r;
    for (let i = i0; i >= 0; i--) {
      const u = this.min + i * this.step;
      if (u >= uB) {
        const phi = u / r;
        y = cy + r * Math.sin(phi); z = cz + r * Math.cos(phi);
      } else {
        const k = Math.min(1, (uB - u) / bendLenB);
        const b = b0 + bendB * k * k * (3 - 2 * k);
        y += Math.cos(b) * this.step; z -= Math.sin(b) * this.step;
      }
      this.Y[i] = y; this.Z[i] = z;
    }
    this.uB = uB;
    this.uA = uA;
  }

  /** u の位置を out={y,z} に書き込む */
  at(u, out) {
    const f = (Math.min(this.max, Math.max(this.min, u)) - this.min) / this.step;
    const i = Math.min(this.n - 2, Math.floor(f));
    const t = f - i;
    out.y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * t;
    out.z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * t;
    return out;
  }

  /** u の位置での進行方向（u が増える向き） */
  tangent(u, out) {
    const a = this.at(u - 0.01, { y: 0, z: 0 });
    const b = this.at(u + 0.01, { y: 0, z: 0 });
    const l = Math.hypot(b.y - a.y, b.z - a.z) || 1;
    out.y = (b.y - a.y) / l; out.z = (b.z - a.z) / l;
    return out;
  }
}
