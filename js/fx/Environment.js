import * as THREE from 'three';
import { woodTexture, woodRoughness, softDot, smokePuff } from './textures.js';
import { ParticlePool } from './Particles.js';
import { rand } from '../core/anim.js';

// 書斎：机・アームランプ・光・小物（マグカップの湯気、鉛筆、紙の束）・光の中の埃

const LAMP_HEAD = new THREE.Vector3(-1.95, 3.15, 0.75);
const LAMP_TARGET = new THREE.Vector3(0.05, 0.95, -0.45);

export class Environment {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'environment';
    scene.add(this.group);
    this.time = 0;
    this.lampLevel = 1;      // 0..1（起動時に点灯させる）
    this.flicker = 0;
    this._buildDesk();
    this._buildLights();
    this._buildLamp();
    this._buildProps();
    this._buildDust();
  }

  _buildDesk() {
    const map = woodTexture(1024);
    map.repeat.set(2.2, 1.6);
    const rough = woodRoughness(512);
    rough.repeat.set(2.2, 1.6);
    const desk = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 13),
      new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 0.62, metalness: 0 }),
    );
    desk.rotation.x = -Math.PI / 2;
    desk.receiveShadow = true;
    this.group.add(desk);
    // 机の手前の縁（低い視点のとき）
    const edge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 0.3), new THREE.MeshStandardMaterial({ map: map.clone(), roughness: 0.6 }));
    edge.position.set(0, -0.2, 6.4);
    this.group.add(edge);
  }

  _buildLights() {
    const q = this.quality;
    const spot = new THREE.SpotLight('#ffcf94', 15, 14, 0.52, 0.62, 1.6);
    spot.position.copy(LAMP_HEAD);
    spot.target.position.copy(LAMP_TARGET);
    spot.castShadow = true;
    spot.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    spot.shadow.camera.near = 0.6;
    spot.shadow.camera.far = 9;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.015;
    spot.shadow.radius = 4;
    this.spot = spot;
    this.spotBase = spot.intensity;
    this.scene.add(spot, spot.target);

    // 窓からの月明かり（冷たい補助光）
    const moon = new THREE.DirectionalLight('#8aa6ff', 0.55);
    moon.position.set(5, 6, -4);
    this.moon = moon;
    this.scene.add(moon);

    const hemi = new THREE.HemisphereLight('#5d6c8f', '#2a170c', 0.32);
    this.hemi = hemi;
    this.scene.add(hemi);

    // 手前からのごく弱い暖色（キーの刻印が沈まないように）
    const fill = new THREE.PointLight('#ffb978', 1.6, 7, 2);
    fill.position.set(0.4, 2.4, 3.4);
    this.fill = fill;
    this.scene.add(fill);
  }

  _buildLamp() {
    const metal = new THREE.MeshStandardMaterial({ color: '#2b2f2a', metalness: 0.7, roughness: 0.35 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b48a48', metalness: 1, roughness: 0.3 });
    const lamp = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.09, 40), metal);
    const basePos = new THREE.Vector3(-3.2, 0.045, -1.7);
    base.position.copy(basePos);
    lamp.add(base);
    const elbow = new THREE.Vector3(-3.05, 2.35, -1.0);
    const joint0 = basePos.clone().add(new THREE.Vector3(0, 0.12, 0));
    const addRod = (a, b, r = 0.03) => {
      const d = b.clone().sub(a);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), metal);
      rod.position.copy(a).add(b).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      lamp.add(rod);
      // 平行リンクの2本目
      const rod2 = rod.clone();
      rod2.position.x += 0.07;
      lamp.add(rod2);
    };
    addRod(joint0, elbow);
    const neck = LAMP_HEAD.clone().add(new THREE.Vector3(-0.25, 0.25, -0.2));
    addRod(elbow, neck);
    for (const p of [joint0, elbow, neck]) {
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), brass);
      j.position.copy(p);
      lamp.add(j);
    }
    // バネ
    const springCurve = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => {
      const t = i / 59;
      const p = joint0.clone().lerp(elbow, 0.15 + t * 0.5);
      return p.add(new THREE.Vector3(Math.cos(t * 80) * 0.025 - 0.08, 0, Math.sin(t * 80) * 0.025));
    }));
    lamp.add(new THREE.Mesh(new THREE.TubeGeometry(springCurve, 240, 0.006, 6), brass));

    // シェード
    const dir = LAMP_TARGET.clone().sub(LAMP_HEAD).normalize();
    const shadeGeo = new THREE.CylinderGeometry(0.12, 0.42, 0.55, 40, 1, true);
    shadeGeo.translate(0, -0.2, 0);
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#2f4a39', metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.copy(LAMP_HEAD).addScaledVector(dir, -0.1);
    shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    lamp.add(shade);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shadeMat);
    cap.position.copy(shade.position);
    cap.quaternion.copy(shade.quaternion);
    lamp.add(cap);
    // 電球（光る）
    this.bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd79a', emissiveIntensity: 6 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), this.bulbMat);
    bulb.position.copy(LAMP_HEAD).addScaledVector(dir, 0.12);
    lamp.add(bulb);
    lamp.traverse((o) => { if (o.isMesh) { o.castShadow = o !== bulb; o.receiveShadow = true; } });
    shade.castShadow = false; cap.castShadow = false;
    this.group.add(lamp);

    // 光の円錐（うっすら見えるボリューム光）
    const len = LAMP_TARGET.distanceTo(LAMP_HEAD) * 1.25;
    const coneGeo = new THREE.ConeGeometry(Math.tan(0.5) * len, len, 48, 1, true);
    coneGeo.translate(0, -len / 2, 0);
    this.coneMat = new THREE.ShaderMaterial({
      uniforms: { uLen: { value: len }, uLevel: { value: 1 } },
      vertexShader: /* glsl */`
        varying float vH; varying vec3 vN; varying vec3 vV;
        void main(){
          vH = -position.y;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uLen, uLevel;
        varying float vH; varying vec3 vN; varying vec3 vV;
        void main(){
          float along = clamp(vH / uLen, 0.0, 1.0);
          float edge = pow(abs(dot(vN, vV)), 1.6);
          float a = edge * (1.0 - along) * smoothstep(0.0, 0.08, along) * 0.075 * uLevel;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(coneGeo, this.coneMat);
    cone.position.copy(LAMP_HEAD).addScaledVector(dir, 0.12);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    cone.renderOrder = 5;
    this.cone = cone;
    this.group.add(cone);
  }

  _buildProps() {
    // マグカップ
    const mug = new THREE.Group();
    const pts = [];
    pts.push(new THREE.Vector2(0, 0));
    pts.push(new THREE.Vector2(0.36, 0));
    pts.push(new THREE.Vector2(0.4, 0.04));
    pts.push(new THREE.Vector2(0.41, 0.86));
    pts.push(new THREE.Vector2(0.395, 0.9));
    pts.push(new THREE.Vector2(0.37, 0.88));
    pts.push(new THREE.Vector2(0.36, 0.1));
    pts.push(new THREE.Vector2(0, 0.1));
    const ceramic = new THREE.MeshPhysicalMaterial({ color: '#7d2a22', roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), ceramic);
    mug.add(body);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 12, 30, Math.PI * 1.3), ceramic);
    handle.position.set(0.42, 0.46, 0);
    handle.rotation.z = -Math.PI * 0.65;
    mug.add(handle);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), new THREE.MeshPhysicalMaterial({ color: '#1c0d06', roughness: 0.08, clearcoat: 1 }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.y = 0.74;
    mug.add(coffee);
    mug.position.set(2.75, 0, 0.95);
    mug.rotation.y = -0.6;
    mug.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.mugTop = new THREE.Vector3(2.75, 0.76, 0.95);
    this.group.add(mug);

    // 鉛筆
    const pencil = new THREE.Group();
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), new THREE.MeshStandardMaterial({ color: '#d39b1f', roughness: 0.45 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), new THREE.MeshStandardMaterial({ color: '#e0c39a', roughness: 0.8 }));
    tip.position.y = 0.87;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 6), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.4, metalness: 0.3 }));
    lead.position.y = 0.955;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.1, 12), new THREE.MeshStandardMaterial({ color: '#c0b38a', metalness: 1, roughness: 0.3 }));
    ferrule.position.y = -0.85;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.08, 12), new THREE.MeshStandardMaterial({ color: '#d77a7a', roughness: 0.9 }));
    eraser.position.y = -0.94;
    pencil.add(wood, tip, lead, ferrule, eraser);
    pencil.rotation.z = Math.PI / 2;
    pencil.rotation.y = 0.5;
    pencil.position.set(2.1, 0.035, 2.05);
    pencil.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(pencil);

    // 未使用の紙の束
    const ream = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.22, 2.78),
      [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial({ color: i === 2 ? '#f3efe4' : '#e3ddcf', roughness: 0.9 })),
    );
    ream.position.set(3.35, 0.11, -1.35);
    ream.rotation.y = 0.32;
    ream.castShadow = true; ream.receiveShadow = true;
    this.group.add(ream);

    // 湯気
    this.steam = new ParticlePool({ max: 90, texture: smokePuff(128) });
    this.scene.add(this.steam.points);
    this._steamT = 0;
  }

  _buildDust() {
    const n = this.quality.dust;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const dir = LAMP_TARGET.clone().sub(LAMP_HEAD).normalize();
    for (let i = 0; i < n; i++) {
      const t = Math.random() * 1.1 + 0.1;
      const len = LAMP_TARGET.distanceTo(LAMP_HEAD) * t;
      const r = Math.tan(0.52) * len * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const side = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
      const up = dir.clone().cross(side).normalize();
      const p = LAMP_HEAD.clone().addScaledVector(dir, len).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
      pos.set([p.x, p.y, p.z], i * 3);
      seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uMap: { value: softDot(64, 0.15) },
        uApex: { value: LAMP_HEAD.clone() }, uDir: { value: dir }, uCos: { value: Math.cos(0.52) },
        uScale: { value: 800 }, uLevel: { value: 1 },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uCos, uScale;
        uniform vec3 uApex, uDir;
        varying float vA;
        void main(){
          vec3 p = position;
          float t = uTime * 0.06 + aSeed;
          p += vec3(sin(t*1.3)*0.25, sin(t*0.7+aSeed)*0.18 - mod(uTime*0.012 + aSeed*0.01, 0.6), cos(t*1.1)*0.25);
          vec3 d = normalize(p - uApex);
          float inCone = smoothstep(uCos, uCos + 0.06, dot(d, uDir));
          float tw = 0.55 + 0.45 * sin(uTime * (1.5 + fract(aSeed) * 3.0) + aSeed);
          vA = inCone * tw;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (0.006 + fract(aSeed*7.3)*0.008) * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uLevel;
        varying float vA;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).a * vA * 0.75 * uLevel;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, this.dustMat);
    pts.frustumCulled = false;
    this.dust = pts;
    this.group.add(pts);
  }

  setViewport(hPx, fov) {
    const s = hPx / (2 * Math.tan((fov * Math.PI) / 360));
    this.dustMat.uniforms.uScale.value = s;
    this.steam.setViewport(hPx, fov);
  }

  /** ランプの明るさ（0..1）。起動演出やへんてこモードの明滅に使う */
  setLamp(level) { this.lampLevel = level; }

  update(dt) {
    this.time += dt;
    this.dustMat.uniforms.uTime.value = this.time;
    // ごくわずかなフィラメントのゆらぎ
    const flick = 1 + Math.sin(this.time * 13.1) * 0.006 + Math.sin(this.time * 7.7) * 0.005 - this.flicker * (Math.random() * 0.6);
    const lv = this.lampLevel * flick;
    this.spot.intensity = this.spotBase * lv;
    this.bulbMat.emissiveIntensity = 6 * lv;
    this.coneMat.uniforms.uLevel.value = lv;
    this.dustMat.uniforms.uLevel.value = lv;
    this.fill.intensity = 1.6 * Math.min(1, lv + 0.2);
    this.flicker = Math.max(0, this.flicker - dt * 1.5);

    // 湯気
    this._steamT -= dt;
    if (this._steamT <= 0) {
      this._steamT = 0.12;
      const m = this.mugTop;
      this.steam.emit({
        x: m.x + rand(-0.15, 0.15), y: m.y, z: m.z + rand(-0.15, 0.15),
        vx: rand(-0.03, 0.03), vy: rand(0.12, 0.22), vz: rand(-0.03, 0.03),
        color: [1, 0.95, 0.88], size: 0.18, alpha: 0.13, life: rand(2.6, 3.6), grow: 0.16, drag: 0.15,
      });
    }
    // ゆらゆら
    const st = this.steam;
    for (let i = 0; i < st.max; i++) {
      if (st.life[i] > 0) st.vel[i * 3] += Math.sin(this.time * 1.7 + i) * 0.02 * dt;
    }
    st.update(dt);
  }

  static get lampHead() { return LAMP_HEAD; }
}
