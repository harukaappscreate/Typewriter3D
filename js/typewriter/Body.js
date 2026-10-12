import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas } from '../fx/textures.js';

// 本体（フレーム・台座・側板・デッキ・レール・ベル）

// 側板の輪郭（z, y）。前が低く、後ろでキャリッジを支える
const SIDE_PROFILE = [
  [1.5, 0.3], [1.5, 0.42], [0.42, 0.98], [-0.15, 1.0], [-0.62, 0.9],
  [-1.28, 0.9], [-1.28, 0.3],
];
const SIDE_X_INNER = 1.66;
const SIDE_THICK = 0.16;

/** 側板の金の飾り線（デカール）を描いたテクスチャ */
function sideDecalTexture(bodyColor, decalColor, mirror = false) {
  const minZ = -1.28, maxZ = 1.5, minY = 0.3, maxY = 1.0;
  const W = 1024, H = Math.round(W * (maxY - minY) / (maxZ - minZ));
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = bodyColor; g.fillRect(0, 0, W, H);
  const sx = (z) => ((z - minZ) / (maxZ - minZ)) * W;
  const sy = (y) => H - ((y - minY) / (maxY - minY)) * H;
  // 輪郭の内側に二重の飾り線
  const inset = (pts, d) => {
    // 簡易的な内側オフセット（重心方向へ寄せる）
    const cz = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return pts.map(([z, y]) => {
      const dz = cz - z, dy = cy - y, l = Math.hypot(dz, dy) || 1;
      return [z + (dz / l) * d * 1.6, y + (dy / l) * d];
    });
  };
  g.strokeStyle = decalColor; g.lineJoin = 'round';
  for (const [d, lw] of [[0.05, 5], [0.075, 1.6]]) {
    const pts = inset(SIDE_PROFILE, d);
    g.lineWidth = lw;
    g.beginPath();
    pts.forEach(([z, y], i) => (i ? g.lineTo(sx(z), sy(y)) : g.moveTo(sx(z), sy(y))));
    g.closePath(); g.stroke();
  }
  // 唐草風の飾り
  g.lineWidth = 2.2;
  const ox = sx(0.6), oy = sy(0.6);
  for (let s = -1; s <= 1; s += 2) {
    g.beginPath();
    g.moveTo(ox, oy);
    g.bezierCurveTo(ox + 40 * s, oy - 30, ox + 90 * s, oy + 20, ox + 130 * s, oy - 6);
    g.stroke();
    g.beginPath(); g.arc(ox + 130 * s, oy - 14, 8, 0, Math.PI * 1.6); g.stroke();
  }
  g.fillStyle = decalColor;
  g.font = 'italic 700 34px "Courier Prime", serif';
  g.textAlign = 'center';
  g.fillText('Atelier', sx(-0.3), sy(0.6) + 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // ExtrudeGeometry の面UVは形状座標そのままなので、範囲を合わせる
  const rz = maxZ - minZ;
  // 右側板は外から見ると左右が逆になるので反転
  if (mirror) { t.repeat.set(-1 / rz, 1 / (maxY - minY)); t.offset.set(maxZ / rz, -minY / (maxY - minY)); }
  else { t.repeat.set(1 / rz, 1 / (maxY - minY)); t.offset.set(-minZ / rz, -minY / (maxY - minY)); }
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 前面の銘板 */
function nameplateTexture(decalColor) {
  const c = makeCanvas(1024, 128);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 128);
  g.fillStyle = decalColor;
  g.font = '400 76px "Special Elite", "Courier Prime", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('A T E L I E R   No. 5', 512, 66);
  g.fillRect(150, 112, 724, 3);
  g.fillRect(150, 14, 724, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Body {
  constructor(mats, finish) {
    this.mats = mats;
    this.group = new THREE.Group();
    this.group.name = 'body';
    this.finish = finish;
    this._build();
  }

  _build() {
    const { mats } = this;
    const g = this.group;

    // 台座
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(3.66, 0.26, 2.86, 4, 0.07), mats.body);
    plinth.position.set(0, 0.19, 0.12);
    g.add(plinth);

    // ゴム足
    const footGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.07, 20);
    for (const [x, z] of [[-1.55, 1.3], [1.55, 1.3], [-1.55, -1.08], [1.55, -1.08]]) {
      const f = new THREE.Mesh(footGeo, mats.rubberFoot);
      f.position.set(x, 0.035, z);
      g.add(f);
    }

    // 側板（左右）
    const shape = new THREE.Shape();
    SIDE_PROFILE.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    shape.closePath();
    const sideGeo = new THREE.ExtrudeGeometry(shape, {
      depth: SIDE_THICK - 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 4, curveSegments: 8,
    });
    // 形状は (z, y) で作ったので、x 方向へ押し出すよう回す
    sideGeo.rotateY(-Math.PI / 2);
    const decalOpts = { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.07 };
    this.decalMats = [
      new THREE.MeshPhysicalMaterial({ ...decalOpts, map: sideDecalTexture(this.finish.body, this.finish.decal, false) }),
      new THREE.MeshPhysicalMaterial({ ...decalOpts, map: sideDecalTexture(this.finish.body, this.finish.decal, true) }),
    ];
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(sideGeo, [this.decalMats[s < 0 ? 0 : 1], mats.body]);
      // rotateY(-90°) で押し出し方向が -x になる（厚み 0.16 = 押し出し+面取り）
      side.position.x = s < 0 ? -SIDE_X_INNER - 0.03 : SIDE_X_INNER + SIDE_THICK - 0.03;
      g.add(side);
    }

    // キーボードの傾斜デッキ（キーの下の暗い板）
    const deckLen = Math.hypot(1.08, 0.44);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(SIDE_X_INNER * 2, 0.04, deckLen), mats.interior);
    deck.position.set(0, (0.42 + 0.86) / 2 - 0.02, (1.5 + 0.42) / 2);
    deck.rotation.x = Math.atan2(0.44, 1.08);
    g.add(deck);
    // 前縁のクローム帯
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, SIDE_X_INNER * 2, 12), mats.chrome);
    lip.rotation.z = Math.PI / 2;
    lip.position.set(0, 0.43, 1.5);
    g.add(lip);

    // 銘板（前面）
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.2),
      new THREE.MeshStandardMaterial({ map: nameplateTexture(this.finish.decal), transparent: true, metalness: 0.6, roughness: 0.35 }),
    );
    plate.position.set(0, 0.2, 1.552);
    this.nameplate = plate;
    g.add(plate);

    // 活字棒の入る「井戸」の床と奥壁
    const well = new THREE.Mesh(new THREE.BoxGeometry(SIDE_X_INNER * 2, 0.04, 1.3), mats.interior);
    well.position.set(0, 0.6, -0.15);
    g.add(well);

    // 左右のデッキ（リボンのスプールが載る）
    const sideDeckGeo = new RoundedBoxGeometry(SIDE_X_INNER - 1.06, 0.05, 0.86, 3, 0.02);
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(sideDeckGeo, mats.body);
      d.position.set(s * (1.06 + (SIDE_X_INNER - 1.06) / 2), 0.975, -0.27);
      g.add(d);
      // デッキを支える柱
      const post = new THREE.Mesh(new THREE.BoxGeometry(SIDE_X_INNER - 1.06, 0.38, 0.06), mats.interior);
      post.position.set(d.position.x, 0.78, 0.13);
      g.add(post);
    }

    // キャリッジのレール
    const railGeo = new THREE.CylinderGeometry(0.022, 0.022, 3.9, 14);
    for (const z of [-1.0, -1.2]) {
      const rail = new THREE.Mesh(railGeo, mats.chrome);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, 0.915, z);
      g.add(rail);
    }
    // レール受け
    for (const s of [-1, 1]) {
      const block = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.12, 0.36, 2, 0.02), mats.darkSteel);
      block.position.set(s * 1.95, 0.88, -1.1);
      g.add(block);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.1), mats.darkSteel);
      leg.position.set(s * 1.95, 0.56, -1.1);
      g.add(leg);
    }
    // 後ろの背板
    const back = new THREE.Mesh(new RoundedBoxGeometry(SIDE_X_INNER * 2, 0.6, 0.08, 2, 0.02), mats.body);
    back.position.set(0, 0.6, -1.26);
    g.add(back);

    // マージンベル（真鍮のドーム）
    const bell = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.075, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mats.brass);
    dome.scale.y = 0.75;
    bell.add(dome);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), mats.brass);
    nub.position.y = 0.058;
    bell.add(nub);
    const hammer = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.12, 6), mats.steel);
    hammer.position.set(0.09, 0.03, 0);
    hammer.rotation.z = 0.5;
    bell.add(hammer);
    bell.position.set(-1.32, 1.0, -0.02);
    this.bell = bell;
    this.bellHammer = hammer;
    g.add(bell);

    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.nameplate.castShadow = false;
  }

  setFinish(finish) {
    this.finish = finish;
    this.mats.body.color.set(finish.body);
    this.decalMats.forEach((m, i) => {
      m.map.dispose();
      m.map = sideDecalTexture(finish.body, finish.decal, i === 1);
      m.needsUpdate = true;
    });
    this.nameplate.material.map.dispose();
    this.nameplate.material.map = nameplateTexture(finish.decal);
    this.nameplate.material.needsUpdate = true;
  }
}
