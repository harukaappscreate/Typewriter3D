import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PostFX } from '../fx/PostFX.js';

/** レンダラー・シーン・カメラ・後処理・リサイズ */
export class Stage {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !quality.post,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    this.pixelRatio = Math.min(window.devicePixelRatio || 1, quality.pixelRatio);
    renderer.setPixelRatio(this.pixelRatio);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07080b');
    scene.fog = new THREE.FogExp2('#07080b', 0.036);
    this.scene = scene;

    // 映り込み用の環境マップ（クロームが映えるように）
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new RoomEnvironment();
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.32;
    env.dispose?.();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 80);
    this.camera.position.set(0, 3, 5);

    this.post = quality.post ? new PostFX(renderer, scene, this.camera, quality) : null;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    this.resize();
  }

  get width() { return this._w; }
  get height() { return this._h; }
  get aspect() { return this._w / this._h; }

  setPixelRatio(pr) {
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h, this.pixelRatio);
    this.onResize?.(w, h);
  }

  render(dt) {
    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
