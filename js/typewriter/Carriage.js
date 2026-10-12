import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MACHINE, PAPER } from '../config.js';
import { makeCanvas } from '../fx/textures.js';

// キャリッジ：プラテン・ノブ・紙受け・紙押さえ・改行レバー・目盛り。左右に動く。

const PL = MACHINE.platen;

function knobGeometry() {
  // 溝付きのベークライトのノブ（旋盤で削った形）
  const pts = [];
  pts.push(new THREE.Vector2(0.0, 0));
  pts.push(new THREE.Vector2(0.06, 0));
  pts.push(new THREE.Vector2(0.06, 0.03));
  const R = 0.16;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const groove = (i % 2 === 0) ? 0 : -0.012;
    pts.push(new THREE.Vector2(R + groove, 0.04 + t * 0.12));
  }
  pts.push(new THREE.Vector2(R - 0.02, 0.175));
  pts.push(new THREE.Vector2(0.09, 0.19));
  pts.push(new THREE.Vector2(0.0, 0.195));
  const g = new THREE.LatheGeometry(pts, 40);
  return g;
}

function scaleTexture(cols, pitch, length) {
  const W = 2048, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, W, H);
  const pxPerUnit = W / length;
  const x0 = (length / 2 - PAPER.width / 2 + PAPER.marginLeft) * pxPerUnit;
  g.fillStyle = '#1b1a22';
  g.font = '700 22px "Courier Prime", monospace';
  g.textAlign = 'center';
  for (let i = 0; i <= cols; i++) {
    const x = x0 + i * pitch * pxPerUnit;
    const big = i % 10 === 0, mid = i % 5 === 0;
    g.fillRect(x - 1, 0, 2, big ? 26 : mid ? 18 : 11);
    if (big) g.fillText(String(i), x, 50);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Carriage {
  constructor(mats, path) {
    this.mats = mats;
    this.path = path;
    this.group = new THREE.Group();
    this.group.name = 'carriage';
    this._build();
  }

  _build() {
    const { mats } = this;
    const g = this.group;
    const half = PL.length / 2;

    // プラテン（回転するグループ）
    const platen = new THREE.Group();
    platen.position.set(0, PL.y, PL.z);
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(PL.radius, PL.radius, PL.length, 64, 1), mats.rubber);
    roller.rotation.z = Math.PI / 2;
    platen.add(roller);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, PL.length + 0.5, 12), mats.chrome);
    shaft.rotation.z = Math.PI / 2;
    platen.add(shaft);
    const knobGeo = knobGeometry();
    for (const s of [-1, 1]) {
      const knob = new THREE.Mesh(knobGeo, mats.bakelite);
      knob.rotation.z = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      knob.position.x = s * (half + 0.12);
      platen.add(knob);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 24), mats.chrome);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = s * (half + 0.12 + 0.196);
      platen.add(cap);
    }
    this.platen = platen;
    g.add(platen);

    // 端板
    const plateGeo = new RoundedBoxGeometry(0.05, 0.5, 0.58, 3, 0.02);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(plateGeo, mats.body);
      p.position.set(s * (half + 0.04), PL.y + 0.02, PL.z - 0.08);
      g.add(p);
    }
    // 下の連結バー
    const tie = new THREE.Mesh(new THREE.BoxGeometry(PL.length + 0.12, 0.05, 0.08), mats.darkSteel);
    tie.position.set(0, 0.97, -1.12);
    g.add(tie);
    const tie2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, PL.length + 0.12, 10), mats.chrome);
    tie2.rotation.z = Math.PI / 2;
    tie2.position.set(0, 1.42, -1.03);
    g.add(tie2);

    // 紙受け（紙の後ろ側を支える曲面の板）
    this._buildPaperTable();

    // 紙押さえ（ベイル）とローラー
    const bailY = 1.29, bailZ = -0.652;
    const bail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, PL.length + 0.04, 12), mats.chrome);
    bail.rotation.z = Math.PI / 2;
    bail.position.set(0, bailY, bailZ);
    g.add(bail);
    for (const x of [-0.6, 0.6]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 16), mats.rubber);
      r.rotation.z = Math.PI / 2;
      r.position.set(x, bailY - 0.004, bailZ - 0.012);
      g.add(r);
    }
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.26), mats.chrome);
      arm.position.set(s * (half + 0.02), bailY - 0.03, bailZ - 0.12);
      arm.rotation.x = 0.5;
      g.add(arm);
    }

    // 目盛り（キャリッジの位置＝桁数がわかる）
    const pitch = (PAPER.width - PAPER.marginLeft * 2) / PAPER.cols;
    const scale = new THREE.Mesh(
      new THREE.PlaneGeometry(PL.length, 0.03),
      new THREE.MeshStandardMaterial({ map: scaleTexture(PAPER.cols, pitch, PL.length), metalness: 0.5, roughness: 0.4 }),
    );
    // 紙押さえの棒のすぐ上に沿わせる（印字行を隠さない）
    scale.position.set(0, bailY + 0.022, bailZ + 0.004);
    scale.rotation.x = -0.55;
    g.add(scale);

    // 改行レバー（左端）
    const lever = new THREE.Group();
    lever.position.set(-half - 0.07, PL.y + 0.26, PL.z + 0.08);
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.08, 0.05, 0.12),
      new THREE.Vector3(-0.22, 0.09, 0.3),
      new THREE.Vector3(-0.3, 0.1, 0.48),
    ];
    const curve = new THREE.CatmullRomCurve3(pts);
    const rod = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.016, 10, false), mats.chrome);
    lever.add(rod);
    const paddle = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.03, 0.16, 2, 0.012), mats.chrome);
    paddle.position.set(-0.31, 0.1, 0.54);
    paddle.rotation.y = 0.35;
    lever.add(paddle);
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), mats.chrome);
    lever.add(pivot);
    this.lever = lever;
    this.leverPick = paddle;
    g.add(lever);

    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scale.castShadow = false;
  }

  _buildPaperTable() {
    const path = this.path;
    const u0 = path.uB - 0.2, u1 = path.uB - 2.2;
    const rows = 40;
    const W = PAPER.width + 0.25;
    const pos = [], idx = [], uv = [];
    const tmp = { y: 0, z: 0 }, tan = { y: 0, z: 0 };
    for (let j = 0; j <= rows; j++) {
      const u = u0 + (u1 - u0) * (j / rows);
      path.at(u, tmp);
      path.tangent(u, tan);
      // 紙の裏側（後ろ）へ少しずらす
      const ny = tan.z, nz = -tan.y;
      const off = 0.016;
      const s = nz < 0 ? 1 : -1;
      for (const x of [-W / 2, W / 2]) {
        pos.push(x, tmp.y + ny * off * s, tmp.z + nz * off * s);
        uv.push(x > 0 ? 1 : 0, j / rows);
      }
      if (j < rows) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const table = new THREE.Mesh(geo, this.mats.body);
    table.material = this.mats.body;
    table.material.side = THREE.DoubleSide;
    this.group.add(table);
    // 紙ガイドの縁
    for (const s of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), this.mats.chrome);
      path.at(u0 - 0.05, tmp);
      edge.position.set(s * (PAPER.width / 2 + 0.03), tmp.y + 0.02, tmp.z - 0.02);
      this.group.add(edge);
    }
  }

  /** 紙の送り量に合わせてプラテンを回す */
  setFeed(feed) {
    this.platen.rotation.x = -feed / MACHINE.paperRadius;
  }

  /** 改行レバーの振れ（0..1） */
  setLever(v) {
    this.lever.rotation.y = v * 0.55;
  }
}
