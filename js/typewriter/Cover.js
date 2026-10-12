import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeCanvas } from '../fx/textures.js';
import { ease } from '../core/anim.js';

// 持ち運び用のケースの蓋。起動時に持ち上がって、机の奥へ置かれる

function leatherTexture() {
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#2a1a12'; g.fillRect(0, 0, 512, 512);
  const img = g.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n; d[i + 1] += n * 0.8; d[i + 2] += n * 0.6;
  }
  g.putImageData(img, 0, 0);
  // しぼ（革の細かいしわ）
  g.strokeStyle = 'rgba(0,0,0,.18)';
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    g.lineWidth = Math.random() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

export class Cover {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ map: leatherTexture(), roughness: 0.7, metalness: 0 });
    const brass = new THREE.MeshStandardMaterial({ color: '#c49a52', metalness: 1, roughness: 0.28 });
    const shell = new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.75, 3.35, 5, 0.22), leather);
    shell.position.y = 0.875 + 0.32;
    g.add(shell);
    // ステッチ風の縁取り
    const band = new THREE.Mesh(new RoundedBoxGeometry(4.56, 0.08, 3.41, 3, 0.04), new THREE.MeshStandardMaterial({ color: '#1a0f0a', roughness: 0.6 }));
    band.position.y = 0.36;
    g.add(band);
    // 取っ手
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 12, 30, Math.PI), leather);
    handle.position.set(0, 2.07, 0);
    g.add(handle);
    for (const s of [-1, 1]) {
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.16), brass);
      mount.position.set(s * 0.42, 2.08, 0);
      g.add(mount);
      // 留め金
      const latch = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.26, 0.05, 2, 0.02), brass);
      latch.position.set(s * 1.3, 0.46, 1.7);
      g.add(latch);
    }
    g.position.set(0, 0, 0.12);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group = g;
    scene.add(g);
  }

  /** 蓋を持ち上げて奥へ */
  lift(tweens, audio, onDone) {
    const g = this.group;
    const p0 = g.position.clone();
    audio?.ratchet(0.15, 30, false); // 留め金を外す音
    tweens.add({
      delay: 0.25, duration: 1.3, ease: ease.inOutCubic,
      update: (v) => {
        g.position.set(p0.x + v * 1.2, p0.y + Math.sin(v * Math.PI) * 2.6, p0.z - v * 5.5);
        g.rotation.set(-v * 0.35, v * 0.5, Math.sin(v * Math.PI) * 0.12);
      },
      complete: () => {
        audio?.paperLand();
        onDone && onDone();
      },
    });
  }
}
