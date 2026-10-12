import * as THREE from 'three';
import { PAPER } from '../config.js';

/**
 * プラテンに巻き付く紙のメッシュ。
 * feed（印字点にある紙の y 座標）を変えると、紙が道筋に沿って送られる。
 */
export class Paper {
  constructor(path, texture) {
    this.path = path;
    this.rows = 150;
    const W = PAPER.width;
    const rows = this.rows;
    const pos = new Float32Array((rows + 1) * 2 * 3);
    const uv = new Float32Array((rows + 1) * 2 * 2);
    const idx = [];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i < 2; i++) {
        const k = j * 2 + i;
        pos[k * 3] = (i === 0 ? -W / 2 : W / 2);
        uv[k * 2] = i; uv[k * 2 + 1] = v; // flipY=false のテクスチャなので v=0 が紙の上端
      }
      if (j < rows) {
        const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geometry = geo;
    this.material = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.88, metalness: 0, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'paper';
    this._feed = NaN;
    this._tmp = { y: 0, z: 0 };
  }

  /** 紙送りの位置（印字点に来る紙の y 座標）を反映 */
  setFeed(feed) {
    if (feed === this._feed) return;
    this._feed = feed;
    const pos = this.geometry.attributes.position.array;
    const H = PAPER.height;
    for (let j = 0; j <= this.rows; j++) {
      const py = (j / this.rows) * H;
      const p = this.path.at(feed - py, this._tmp);
      for (let i = 0; i < 2; i++) {
        const k = (j * 2 + i) * 3;
        pos[k + 1] = p.y; pos[k + 2] = p.z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  setTexture(tex) {
    this.material.map = tex;
    this.material.needsUpdate = true;
  }
}
