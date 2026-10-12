import { QUALITY_PRESETS } from '../config.js';

/** 端末に合わせて画質の段階を決める */
export function detectTier() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const minSide = Math.min(screen.width, screen.height);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (coarse && (cores <= 4 || mem <= 3)) return 'low';
  if (coarse || minSide < 720) return 'medium';
  return 'high';
}

export function resolveQuality(setting) {
  const tier = setting && setting !== 'auto' && QUALITY_PRESETS[setting] ? setting : detectTier();
  return { tier, ...QUALITY_PRESETS[tier] };
}

/** 実際のフレームレートを見て解像度を下げる */
export class FpsGovernor {
  constructor(stage) {
    this.stage = stage;
    this.samples = [];
    this.cooldown = 3;
    this.enabled = true;
  }
  update(dt) {
    if (!this.enabled) return;
    this.cooldown -= dt;
    this.samples.push(dt);
    if (this.samples.length > 90) this.samples.shift();
    if (this.cooldown > 0 || this.samples.length < 90) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    const fps = 1 / avg;
    if (fps < 38) {
      const pr = this.stage.pixelRatio;
      if (pr > 1.0) {
        this.stage.setPixelRatio(Math.max(1, pr - 0.25));
        this.cooldown = 2.5;
        this.samples.length = 0;
      } else {
        this.enabled = false;
      }
    }
  }
}
