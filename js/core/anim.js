// 汎用のアニメーション・数値ユーティリティ

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// 決定的な疑似乱数（文字ごとの「癖」に使う）
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

/**
 * フレーム時間ベースのトゥイーンとタイマー。
 * add({ duration, delay, ease, update(v,t), complete() })
 * after(delay, fn)
 */
export class Tweens {
  constructor() {
    this.list = [];
    this.time = 0;
  }
  add({ duration = 0.3, delay = 0, ease: e = ease.linear, update, complete, from = 0, to = 1 }) {
    const tw = { start: this.time + delay, duration: Math.max(1e-4, duration), e, update, complete, from, to, dead: false, began: false };
    this.list.push(tw);
    return tw;
  }
  after(delay, fn) {
    return this.add({ duration: 1e-4, delay, complete: fn });
  }
  kill(tw) { if (tw) tw.dead = true; }
  update(dt) {
    this.time += dt;
    const now = this.time;
    // 処理中に追加されたものは次のフレームで扱う
    const list = this.list;
    this.list = [];
    for (const tw of list) {
      if (tw.dead) continue;
      if (now < tw.start) { this.list.push(tw); continue; }
      const t = clamp((now - tw.start) / tw.duration, 0, 1);
      if (tw.update) tw.update(lerp(tw.from, tw.to, tw.e(t)), t);
      if (t >= 1) { tw.dead = true; tw.complete && tw.complete(); }
      else this.list.push(tw);
    }
  }
}

/** バネ（キャリッジや紙送りの動きに使う） */
export class Spring {
  constructor(value = 0, stiffness = 600, damping = 0.75) {
    this.value = value; this.target = value; this.v = 0;
    this.k = stiffness; this.zeta = damping;
  }
  set(v) { this.value = this.target = v; this.v = 0; }
  update(dt) {
    const c = 2 * Math.sqrt(this.k) * this.zeta;
    // 小さなステップで積分して安定させる
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -this.k * (this.value - this.target) - c * this.v;
      this.v += a * h;
      this.value += this.v * h;
    }
    return this.value;
  }
  get settled() { return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.v) < 1e-3; }
}
