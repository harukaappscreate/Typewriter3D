import * as THREE from 'three';
import { PAPER, INK, TYPEFACES } from '../config.js';
import { makeCanvas, paperFiberTile, ribbonGrain } from '../fx/textures.js';
import { hash, rand, clamp } from '../core/anim.js';

/**
 * 紙のテクスチャに「インク」を打ち込む。
 * 2D キャンバスに描き、変わった部分だけを GPU に転送する（copyTextureToTexture）。
 */
export class InkRenderer {
  constructor(renderer, pxWidth) {
    this.renderer = renderer;
    this.W = pxWidth;
    this.H = Math.round(pxWidth * PAPER.height / PAPER.width);
    this.ppu = this.W / PAPER.width; // 1単位あたりのピクセル
    this.pitch = (PAPER.width - PAPER.marginLeft * 2) / PAPER.cols;
    this.cellW = this.pitch * this.ppu;
    this.fontPx = Math.round(this.cellW * 1.62);

    this.canvas = makeCanvas(this.W, this.H);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });

    // 部分転送用の小さなキャンバス
    this.patchSize = Math.ceil(this.cellW * 4 / 8) * 8;
    this.patch = makeCanvas(this.patchSize, this.patchSize);
    this.patchCtx = this.patch.getContext('2d');
    this.patchTex = new THREE.Texture(this.patch);

    // 1文字ぶんの作業用キャンバス
    this.glyphSize = Math.ceil(this.fontPx * 2);
    this.glyph = makeCanvas(this.glyphSize, this.glyphSize);
    this.glyphCtx = this.glyph.getContext('2d');

    this.grain = this.glyphCtx.createPattern(ribbonGrain(256), 'repeat');
    this.fiber = this.ctx.createPattern(paperFiberTile(256), 'repeat');

    const tex = new THREE.Texture(this.canvas);
    tex.flipY = false;                // 紙の上端 = v 0
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    this.texture = tex;

    this.typeface = TYPEFACES.elite;
    this.ribbonWear = 0;              // 0..1 リボンの消耗
    this.text = [];                   // 打った文字の記録（行ごとの配列）
    this.newPage();
  }

  setTypeface(key) {
    this.typeface = TYPEFACES[key] || TYPEFACES.elite;
  }

  /** 白紙にする */
  newPage() {
    const g = this.ctx;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = this.fiber;
    g.fillRect(0, 0, this.W, this.H);
    // 紙の縁のわずかな黄ばみ
    const edge = g.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.H * 0.75);
    edge.addColorStop(0, 'rgba(180,160,120,0)');
    edge.addColorStop(1, 'rgba(180,150,100,0.12)');
    g.fillStyle = edge; g.fillRect(0, 0, this.W, this.H);
    // 透かしのような薄い罫（左余白の赤線は無し、上部に小さな透かし）
    g.fillStyle = 'rgba(150,140,120,0.06)';
    g.font = `400 ${Math.round(this.fontPx * 0.8)}px "Special Elite", monospace`;
    g.textAlign = 'right';
    g.fillText('ATELIER BOND', this.W - this.cellW * 3, this.H - this.cellW * 2);
    this.text = [];
    this.texture.needsUpdate = true;
    this._initialized = false;
  }

  /** 列・行（紙の y 座標）→ キャンバスのピクセル */
  cellToPx(col, paperY) {
    return {
      x: (PAPER.marginLeft + (col + 0.5) * this.pitch) * this.ppu,
      y: paperY * this.ppu,
    };
  }

  _ensureUploaded() {
    if (!this._initialized) {
      this.renderer.initTexture(this.texture);
      this._initialized = true;
    }
  }

  /** 指定領域を GPU に送る */
  _commit(cx, cy) {
    // まだ全体を送っていなければ、次の描画で全体が転送される
    if (!this._initialized) return;
    const s = this.patchSize;
    const x = clamp(Math.round(cx - s / 2), 0, this.W - s);
    const y = clamp(Math.round(cy - s / 2), 0, this.H - s);
    this.patchCtx.clearRect(0, 0, s, s);
    this.patchCtx.drawImage(this.canvas, x, y, s, s, 0, 0, s, s);
    this.patchTex.needsUpdate = false;
    this.renderer.copyTextureToTexture(this.patchTex, this.texture, null, new THREE.Vector2(x, y));
  }

  /** フレームの最初に呼ぶ（全体転送の準備） */
  prepare() {
    if (!this._initialized) this._ensureUploaded();
  }

  /**
   * 1文字を打つ
   * opts: { strength 0..1, color 'black'|'red', wild 0..1（へんてこ）}
   */
  stamp(ch, col, paperY, opts = {}) {
    if (ch === ' ') return;
    const { strength = 0.9, color = 'black', wild = 0 } = opts;
    const { x, y } = this.cellToPx(col, paperY);
    const code = ch.charCodeAt(0);
    const gs = this.glyphSize;
    const gg = this.glyphCtx;

    // 活字ごとの「癖」（いつも少し上にずれる e、など）
    const habitY = (hash(code) - 0.5) * this.cellW * 0.12;
    const habitX = (hash(code + 17) - 0.5) * this.cellW * 0.06;
    const habitRot = (hash(code + 41) - 0.5) * 0.035;
    const punch = '.,:;\'"`'.includes(ch) ? 1.15 : 1;

    gg.setTransform(1, 0, 0, 1, 0, 0);
    gg.globalCompositeOperation = 'source-over';
    gg.globalAlpha = 1;
    gg.clearRect(0, 0, gs, gs);
    gg.translate(gs / 2 + habitX + rand(-0.6, 0.6) * (1 + wild * 6), gs / 2 + habitY + rand(-0.8, 0.8) * (1 + wild * 6));
    gg.rotate(habitRot + rand(-0.01, 0.01) + wild * rand(-0.5, 0.5));
    const sc = 1 + wild * rand(-0.25, 0.6);
    gg.scale(sc, sc);
    gg.fillStyle = INK[color] || INK.black;
    gg.font = `${this.typeface.weight} ${this.fontPx}px "${this.typeface.family}", "Courier Prime", monospace`;
    gg.textAlign = 'center';
    gg.textBaseline = 'alphabetic';
    gg.fillText(ch, 0, this.fontPx * 0.33);
    gg.setTransform(1, 0, 0, 1, 0, 0);

    // リボンの布目でかすれさせる
    gg.globalCompositeOperation = 'destination-in';
    gg.save();
    gg.translate(rand(0, 256), rand(0, 256));
    gg.fillStyle = this.grain;
    gg.fillRect(-256, -256, gs + 512, gs + 512);
    gg.restore();
    // 打ちムラ（片側が薄い）
    gg.globalCompositeOperation = 'destination-out';
    const side = rand(0, Math.PI * 2);
    const lg = gg.createLinearGradient(
      gs / 2 + Math.cos(side) * gs * 0.25, gs / 2 + Math.sin(side) * gs * 0.25,
      gs / 2 - Math.cos(side) * gs * 0.25, gs / 2 - Math.sin(side) * gs * 0.25,
    );
    const uneven = clamp(0.15 + (1 - strength) * 0.6 + this.ribbonWear * 0.3 + rand(0, 0.15), 0, 0.85);
    lg.addColorStop(0, `rgba(0,0,0,${uneven})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    gg.fillStyle = lg;
    gg.fillRect(0, 0, gs, gs);
    gg.globalCompositeOperation = 'source-over';

    // 紙に乗せる（乗算で重ね打ちが濃くなる）
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = 'multiply';
    // にじみ
    g.globalAlpha = clamp(strength * 0.35 * punch, 0, 1);
    g.filter = 'none';
    g.shadowColor = color === 'red' ? 'rgba(160,30,25,0.6)' : 'rgba(20,20,30,0.6)';
    g.shadowBlur = this.cellW * 0.12;
    g.drawImage(this.glyph, x - gs / 2, y - gs / 2);
    g.shadowBlur = 0;
    g.globalAlpha = clamp((0.78 + strength * 0.35) * punch * (1 - this.ribbonWear * 0.35), 0, 1);
    g.drawImage(this.glyph, x - gs / 2, y - gs / 2);
    g.restore();

    this.ribbonWear = Math.min(0.6, this.ribbonWear + 0.00004);
    this._record(ch, col, paperY);
    this._commit(x, y);
  }

  /** インクの飛び散り（へんてこモード） */
  splat(col, paperY, amount = 1, color = 'black') {
    const { x, y } = this.cellToPx(col, paperY);
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = INK[color] || INK.black;
    const n = Math.round(12 + amount * 50);
    const reach = this.cellW * (2 + amount * 9);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), d = Math.pow(Math.random(), 1.6) * reach;
      g.globalAlpha = rand(0.3, 0.9);
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, rand(0.6, 2.2 + amount * 3) * (1 - d / reach * 0.6), 0, Math.PI * 2);
      g.fill();
    }
    if (amount > 0.6) {
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(x, y, this.cellW * 0.6 * amount, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    this.texture.needsUpdate = true;
  }

  _record(ch, col, paperY) {
    const line = Math.round((paperY - PAPER.marginTop) / (PAPER.lineAdvance * 0.5));
    let row = this.text.find((r) => r.line === line);
    if (!row) { row = { line, chars: [] }; this.text.push(row); }
    row.chars[col] = ch;
  }

  /** 打った文字をプレーンテキストに */
  plainText() {
    const rows = [...this.text].sort((a, b) => a.line - b.line);
    const out = [];
    let prev = null;
    for (const r of rows) {
      if (prev !== null) for (let i = prev + 2; i < r.line; i += 2) out.push('');
      out.push(Array.from(r.chars, (c) => c || ' ').join('').replace(/\s+$/, ''));
      prev = r.line;
    }
    return out.join('\n');
  }

  /** 縮小コピー（積んだ原稿・ギャラリー用） */
  snapshot(width = 1024) {
    const h = Math.round(width * this.H / this.W);
    const c = makeCanvas(width, h);
    c.getContext('2d').drawImage(this.canvas, 0, 0, width, h);
    return c;
  }
}
