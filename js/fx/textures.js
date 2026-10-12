import * as THREE from 'three';
import { rand } from '../core/anim.js';

// コードで描く質感テクスチャ（外部画像なし）

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** 机の木目 */
export function woodTexture(size = 1024) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, '#3b2416'); base.addColorStop(0.5, '#4a2d1a'); base.addColorStop(1, '#382114');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // 木目の筋
  for (let i = 0; i < 260; i++) {
    const y0 = Math.random() * size;
    const amp = rand(2, 16), freq = rand(0.002, 0.01), ph = rand(0, 6.28);
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,5' : '110,70,40'},${rand(0.04, 0.16)})`;
    g.lineWidth = rand(0.6, 3.2);
    g.beginPath();
    for (let x = -10; x <= size + 10; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph * 2) * amp * 0.25;
      x === -10 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  // 節
  for (let k = 0; k < 3; k++) {
    const cx = rand(0, size), cy = rand(0, size);
    for (let r = 4; r < 60; r += 3) {
      g.strokeStyle = `rgba(25,12,6,${0.12 - r * 0.0015})`;
      g.beginPath(); g.ellipse(cx, cy, r * 2.4, r * 0.7, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  // 細かいノイズ
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.6;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 木目の粗さ（光沢のムラ） */
export function woodRoughness(size = 512) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '230,230,230'},${rand(0.05, 0.2)})`;
    g.lineWidth = rand(1, 6);
    const y = rand(0, size);
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(size * 0.3, y + rand(-20, 20), size * 0.6, y + rand(-20, 20), size, y + rand(-10, 10)); g.stroke();
  }
  // 拭き跡
  for (let i = 0; i < 12; i++) {
    const r = rand(40, 160);
    g.fillStyle = `rgba(60,60,60,${rand(0.03, 0.08)})`;
    g.beginPath(); g.ellipse(rand(0, size), rand(0, size), r, r * 0.4, rand(0, 3), 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 丸い光の粒（パーティクル用） */
export function softDot(size = 64, hard = 0.0) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** 煙のもや */
export function smokePuff(size = 128) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = size / 2 + rand(-18, 18), y = size / 2 + rand(-18, 18), r = rand(18, 44);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

/** プラテン（ゴム）の微妙なムラ。回転が見えるように */
export function rubberTexture() {
  const c = makeCanvas(512, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#151515'; g.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.01, 0.05)})`;
    g.fillRect(rand(0, 512), rand(0, 64), rand(1, 3), rand(1, 2));
  }
  // 打たれ跡の帯（印字点が当たる場所が少しテカる）
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.015, 0.04)})`;
    g.fillRect(0, rand(0, 64), 512, rand(2, 6));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 紙の地（繊維・斑点）。タイル状に繰り返して使う */
export function paperFiberTile(size = 256) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#f2ede0'; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 7;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.1;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.6 ? '150,135,110' : '255,255,250'},${rand(0.05, 0.14)})`;
    g.lineWidth = rand(0.4, 1);
    const x = rand(0, size), y = rand(0, size), a = rand(0, Math.PI), l = rand(4, 16);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + rand(-3, 3), y + Math.sin(a) * l * 0.5 + rand(-3, 3), x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(120,100,70,${rand(0.05, 0.18)})`;
    g.beginPath(); g.arc(rand(0, size), rand(0, size), rand(0.3, 1.1), 0, Math.PI * 2); g.fill();
  }
  return c;
}

/** インクリボンの「かすれ」マスク */
export function ribbonGrain(size = 256) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  // 布目（縦横の織り）＋ランダムな粒
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const weave = 0.82 + 0.1 * Math.sin(x * 1.9) * Math.sin(y * 1.7);
      const grain = Math.random();
      let a = weave + 0.08 - (grain < 0.06 ? 0.5 : grain * 0.16);
      a = Math.max(0, Math.min(1, a));
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
