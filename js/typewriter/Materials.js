import * as THREE from 'three';
import { rubberTexture } from '../fx/textures.js';

/** タイプライターで使う質感をまとめて作る */
export function createMaterials(finish) {
  const m = {};
  m.body = new THREE.MeshPhysicalMaterial({
    color: finish.body, roughness: 0.32, metalness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.07,
  });
  m.chrome = new THREE.MeshStandardMaterial({ color: '#e2e2e2', metalness: 1, roughness: 0.14 });
  m.steel = new THREE.MeshStandardMaterial({ color: '#a4a9ae', metalness: 0.92, roughness: 0.32 });
  m.darkSteel = new THREE.MeshStandardMaterial({ color: '#2a2b2e', metalness: 0.75, roughness: 0.42 });
  m.blackMetal = new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.45, roughness: 0.5 });
  m.interior = new THREE.MeshStandardMaterial({ color: '#0b0b0c', metalness: 0.2, roughness: 0.85 });
  const rub = rubberTexture();
  rub.repeat.set(1, 1);
  m.rubber = new THREE.MeshStandardMaterial({ color: '#ffffff', map: rub, roughness: 0.72, metalness: 0 });
  m.bakelite = new THREE.MeshPhysicalMaterial({ color: '#17110d', roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  m.felt = new THREE.MeshStandardMaterial({ color: '#233523', roughness: 1, metalness: 0 });
  m.brass = new THREE.MeshStandardMaterial({ color: '#c9a15b', metalness: 1, roughness: 0.26 });
  m.rubberFoot = new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.9 });
  m.ribbonSpool = new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.6, metalness: 0.2 });
  m.ribbonRoll = new THREE.MeshStandardMaterial({ color: '#0e0e12', roughness: 0.55 });
  return m;
}
