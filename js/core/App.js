import { PAPER } from '../config.js';
import { Settings } from './Settings.js';
import { resolveQuality, FpsGovernor } from './Quality.js';
import { Stage } from './Stage.js';
import { Tweens, ease, clamp } from './anim.js';
import { Input } from './Input.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { Environment } from '../fx/Environment.js';
import { CameraRig } from '../fx/CameraRig.js';
import { Henteko } from '../fx/Henteko.js';
import { Typewriter } from '../typewriter/Typewriter.js';
import { Cover } from '../typewriter/Cover.js';
import { UI, download } from '../ui/UI.js';

/** 全体の組み立てとメインループ */
export class App {
  async init() {
    this.settings = new Settings();
    this.quality = resolveQuality(this.settings.get('quality'));
    this.ui = new UI(this.settings);
    this.ui.setIntroStatus('活字を鋳造しています…');

    await loadFonts();
    this.ui.setIntroStatus('機械を組み立てています…');
    await nextFrame();

    const canvas = document.getElementById('scene');
    this.stage = new Stage(canvas, this.quality);
    this.tweens = new Tweens();
    this.audio = new AudioEngine();
    this.audio.enabled = this.settings.get('sound');
    this.audio.volume = this.settings.get('volume');
    this.audio.ambienceOn = this.settings.get('ambience');

    this.env = new Environment(this.stage.scene, this.quality);
    this.typewriter = new Typewriter({
      renderer: this.stage.renderer, scene: this.stage.scene, settings: this.settings,
      audio: this.audio, quality: this.quality, tweens: this.tweens,
    });
    this.cover = new Cover(this.stage.scene);
    this.cameraRig = new CameraRig(this.stage.camera, canvas);
    this.henteko = new Henteko({
      typewriter: this.typewriter, scene: this.stage.scene, audio: this.audio,
      camera: this.cameraRig, env: this.env, post: this.stage.post, ui: this.ui,
    });
    this.henteko.setEnabled(this.settings.get('henteko'));
    this.input = new Input({ canvas, camera: this.stage.camera, ime: document.getElementById('ime') });
    const tw = this.typewriter;
    this.input.setPickables([
      tw.keyboard.caps, tw.keyboard.rings, tw.keyboard.spaceBarMesh, tw.carriage.leverPick,
      ...tw.body.bell.children,
    ]);
    this.governor = new FpsGovernor(this.stage);

    this._wire();
    this.stage.onResize = () => this._onResize();
    this._onResize();

    // 起動前：ランプは消え、紙はまだ入っていない
    this.env.setLamp(0.0);
    tw.paper.mesh.visible = false;
    this.cameraRig.curPos.set(-1.6, 0.9, 3.6);
    this.cameraRig.curTarget.set(-0.2, 0.6, 1.2);

    this._last = performance.now();
    this._statT = 0;
    // ?manual のときは自動で回さない（テスト用：step() で時間を進める）
    this.manual = new URLSearchParams(location.search).has('manual');
    if (!this.manual) requestAnimationFrame((t) => this._loop(t));

    this.started = false;
    this.ui.setIntroStatus('準備ができました。', true);
    this.ui.onIntroGo(() => this.start());
  }

  /** 起動演出：ランプが点き、蓋が外れ、紙が差し込まれる */
  start() {
    if (this.started) return;
    this.started = true;
    this.audio.unlock();
    this.audio.uiTick();
    this.ui.hideIntro();
    const { tweens, env, typewriter: tw } = this;
    // ランプのスイッチ（少し瞬いてから点く）
    const seq = [[0.0, 0.6], [0.07, 0.1], [0.14, 0.85], [0.2, 0.3], [0.3, 1]];
    seq.forEach(([t, v]) => tweens.after(t, () => env.setLamp(v)));
    this.cameraRig.playIntro(3.4);
    tweens.after(0.35, () => this.cover.lift(tweens, this.audio));
    tweens.after(1.7, () => {
      tw.insertPaper(() => {
        tw.enabled = true;
        this.input.enabled = true;
        this.ui.toast(matchMedia('(pointer: coarse)').matches ? 'キーをタップするか「キーボードを開く」で打てます' : 'どうぞ、打ってください。Enter で改行');
      });
    });
  }

  _wire() {
    const { input, typewriter: tw, henteko, ui, settings, audio, cameraRig } = this;
    const jam = () => tw.jammed && henteko.enabled;

    input.on('any', () => { if (!this.started) this.start(); });
    input.on('char', (ch) => (jam() ? henteko.mashKey() : tw.typeChar(ch)));
    input.on('return', () => (jam() ? henteko.mashKey() : tw.carriageReturn()));
    input.on('backspace', () => (jam() ? henteko.mashKey() : tw.backspace()));
    input.on('tab', () => (jam() ? henteko.mashKey() : tw.tab()));
    input.on('shift', (on) => tw.setShiftHeld(on));
    input.on('caps', (on) => tw.setCapsLock(on));
    input.on('escape', () => ui.closePanels());
    input.on('pick', (hit) => {
      if (jam()) { henteko.mashKey(); return; }
      const o = hit.object;
      if ((o === tw.keyboard.caps || o === tw.keyboard.rings) && hit.instanceId != null) {
        tw.pressKey(tw.layout.keys[hit.instanceId]);
      } else if (o === tw.keyboard.spaceBarMesh) tw.typeChar(' ');
      else if (o === tw.carriage.leverPick) tw.carriageReturn();
      else if (tw.body.bell.children.includes(o)) { audio.bell(henteko.enabled ? 0.7 + Math.random() * 0.8 : 1); tw.bellAnim = tw.time; }
    });
    // ソフトキーボードを開いたら紙に寄る
    let prevMode = null;
    input.on('imeFocus', (on) => {
      if (on) {
        if (cameraRig.mode !== 'paper') { prevMode = cameraRig.mode; cameraRig.setMode('paper'); ui.setCameraLabel('paper'); }
      } else if (prevMode) { cameraRig.setMode(prevMode); ui.setCameraLabel(prevMode); prevMode = null; }
    });

    ui.on('action', (name) => {
      audio.uiTick();
      switch (name) {
        case 'sound': settings.set('sound', !settings.get('sound')); break;
        case 'camera': ui.setCameraLabel(cameraRig.nextMode()); break;
        case 'henteko': settings.set('henteko', !settings.get('henteko')); break;
        case 'keyboard': audio.unlock(); input.openSoftKeyboard(); break;
        case 'ribbon': settings.set('ribbon', settings.get('ribbon') === 'red' ? 'black' : 'red'); break;
        case 'return': tw.carriageReturn(); break;
        case 'eject': tw.ejectPage(); break;
        case 'save-current': this._saveCurrent(); break;
        case 'copy-text': this._copyText(); break;
        default: break;
      }
    });

    settings.on('change', ({ key, value }) => {
      if (key === 'sound') audio.setEnabled(value);
      if (key === 'volume') audio.setVolume(value);
      if (key === 'ambience') audio.setAmbience(value);
      if (key === 'henteko') {
        henteko.setEnabled(value);
        ui.toast(value ? 'へんてこモード：速く打つと…？ 放っておくと…？' : 'いつもの機械に戻りました');
        if (value) audio.boing();
      }
      if (key === 'ribbon') ui.toast(value === 'red' ? 'リボンを赤に切り替えました' : 'リボンを黒に切り替えました', 1400);
      ui.syncToggles();
    });

    tw.on('strike', (e) => cameraRig.kick(0.06 + e.strength * 0.05));
    tw.on('return', () => cameraRig.kick(0.2));
    tw.on('carriageStop', () => cameraRig.kick(0.35));
    tw.on('locked', () => ui.toast('行末です。Enter で改行してください', 1600));
    tw.on('jam', () => cameraRig.kick(1));
    tw.on('pageEjected', ({ canvas, text, index }) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        ui.addPage({ index, thumb: url, full: url, text });
      }, 'image/png');
      ui.toast(`${index} 枚目を原稿の山に積みました`, 1800);
    });
  }

  _saveCurrent() {
    const tw = this.typewriter;
    tw.ink.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      download(url, `typewriter-page-${tw.pages + 1}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      this.ui.toast('いま打っている紙を保存しました');
    }, 'image/png');
  }

  async _copyText() {
    const tw = this.typewriter;
    const all = [...this.ui.pages.map((p) => p.text), tw.ink.plainText()].filter(Boolean).join('\n\n\f\n\n');
    try {
      await navigator.clipboard.writeText(all);
      this.ui.toast('打った文字をコピーしました');
    } catch {
      this.ui.toast('コピーできませんでした（ブラウザの許可が必要です）');
    }
  }

  _onResize() {
    const { stage } = this;
    this.cameraRig?.onResize();
    const hPx = stage.height * stage.pixelRatio;
    this.env?.setViewport(hPx, stage.camera.fov);
    this.henteko?.setViewport(hPx, stage.camera.fov);
  }

  _loop(t) {
    requestAnimationFrame((tt) => this._loop(tt));
    const dt = Math.min(0.05, Math.max(0, (t - this._last) / 1000));
    this._last = t;
    this._update(dt);
    if (this.started) this.governor.update(dt);
    this.stage.render(dt);
  }

  /** テスト用：描画せずに時間を進め、最後に1回描く */
  step(seconds, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) this._update(dt);
    this.stage.render(dt);
  }

  _update(dt) {
    this.tweens.update(dt);
    this.typewriter.update(dt);
    this.henteko.update(dt);
    this.env.update(dt);

    // 紙が上がるにつれて視線も少し上へ
    const tw = this.typewriter;
    const prog = clamp((tw.lineY - PAPER.marginTop) / (PAPER.height - PAPER.marginTop - PAPER.marginBottom), 0, 1);
    this.cameraRig.setFollow(ease.inOutCubic(prog), tw.carriage.group.position.x);
    this.cameraRig.update(dt);

    this._statT -= dt;
    if (this._statT <= 0) {
      this._statT = 0.25;
      this.ui.setStats({ wpm: tw.wpm, chars: tw.totalChars, page: tw.pages + 1 });
      if (this.henteko.enabled) this.ui.setHeat(this.henteko.heat);
    }
  }
}

async function loadFonts() {
  const want = ['400 48px "Special Elite"', '400 48px "Courier Prime"', '700 48px "Courier Prime"'];
  try {
    await Promise.race([
      Promise.all(want.map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch { /* フォントが読めなくても代替フォントで続行 */ }
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
