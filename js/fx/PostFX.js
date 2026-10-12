import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// フィルム調の仕上げ：粒子・色収差・暖色グレーディング・熱のゆらぎ（へんてこモード）
const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uAberration: { value: 0.0012 },
    uHeat: { value: 0 },
    uFlash: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uAberration, uHeat, uFlash;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
    void main(){
      vec2 uv = vUv;
      // 熱で空気がゆらぐ
      if (uHeat > 0.001) {
        float w = sin(uv.y*38.0 + uTime*9.0) * cos(uv.x*21.0 - uTime*6.0);
        uv += vec2(w*0.0025, w*0.0018) * uHeat;
      }
      vec2 dir = uv - 0.5;
      float d = length(dir);
      float ab = uAberration * (1.0 + uHeat*3.0) * d;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir*ab).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir*ab).b;
      // 暖色寄りのグレーディング
      col = mix(col, col*vec3(1.05,0.99,0.92), 0.6);
      col = mix(col, col*vec3(1.35,0.75,0.55), uHeat*0.45);
      // 粒子
      float g = hash(uv*uResolution + fract(uTime*7.13)*100.0) - 0.5;
      col += g * uGrain;
      col += uFlash * vec3(1.0,0.85,0.6);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples: quality.msaa || 0,
    });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.86);
      composer.addPass(this.bloom);
    }
    composer.addPass(new OutputPass());
    this.film = new ShaderPass(FilmShader);
    composer.addPass(this.film);
    this.composer = composer;
    this.time = 0;
  }
  set heat(v) { this.film.uniforms.uHeat.value = v; }
  set flash(v) { this.film.uniforms.uFlash.value = v; }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.film.uniforms.uResolution.value.set(w * pr, h * pr);
  }
  render(dt) {
    this.time += dt;
    this.film.uniforms.uTime.value = this.time;
    this.composer.render(dt);
  }
}
