# Typewriter Atelier ⌨️📜

<div align="center">

**夜の書斎に置かれた1台のクラシック・タイプライター。**  
An authentic 3D mechanical typewriter simulation running in your browser.

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-2ea44f?style=for-the-badge&logo=github)](https://harukaappscreate.github.io/Typewriter3D/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r186.1-black?style=for-the-badge&logo=threedotjs)](https://threejs.org/)
[![Web Audio API](https://img.shields.io/badge/Audio-Web%20Audio%20Synthesis-orange?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Zero Build](https://img.shields.io/badge/Build-Pure%20ES%20Modules%20%2F%20Zero%20Build-purple?style=for-the-badge)](#tech-stack)

<br />

### 🔗 [▶️ Live Demo をブラウザですぐに遊ぶ (Try It Online)](https://harukaappscreate.github.io/Typewriter3D/)

<br />

<img src="assets/ogp.jpg" alt="Typewriter Atelier Screenshot" width="850" style="max-width: 100%; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />

</div>

---

## 🌟 特徴 (Highlights)

- ⚙️ **精巧な機械仕掛けの3D再現 (Mechanical Precision)**  
  キーの押し込みに連動して活字棒（Typebar）が扇状に跳ね上がり、プラテン（円筒ゴム）を打鍵。打つごとにキャリッジ（台車）がカチッカチッと左へ進み、行末手前では真鍮のベルが鳴り響きます。
- 🖋️ **リアルなインク・用紙シミュレーション (Ink & Paper Physics)**  
  打鍵ごとの微妙なブレ、インクのかすれ、にじみ、活字ごとの個体差をプロシージャルに生成。紙がいっぱいになると自動で引き抜かれ、机の左の原稿の山へとひらひらと積もっていきます。
- 🔊 **完全プロシージャルな Web Audio 合成音 (100% Synthesized Audio)**  
  音声ファイル（WAV/MP3）は一切使っていません。金属の衝突音、キートップのカチャカチャ音、ベルの余韻、キャリッジリターンの滑走音まで、すべて Web Audio API のオシレーター・ノイズ・フィルターでリアルタイム合成しています。
- 📋 **クリップボードからの流し込み (Paste & Auto-Type)**  
  `⌘V` / `Ctrl+V`、またはツールバーの「流し込み」から貼り付けた文章を、機械が1字ずつ実際に打ちます。活字棒・音・キャリッジ・改行・紙替えまですべて連動。速さは「ゆっくり」から「機関銃」まで調整でき、句読点や単語の切れ目で人らしく間を置きます。行末では単語の途中で切らずに折り返し、全角英数字やスマートクォートは自動で打てる文字に変換（日本語は活字がないため飛ばします）。途中で自分のキーを打つと一時停止します。
- 🎚️ **打鍵音の選択 (Sound Profiles)**  
  打鍵音を「クラシック／重厚なデスクトップ機／軽快なポータブル／電動タイプライター／静音（夜の書斎）／ピコピコ」から選べます。ベルの音（3種）と部屋の響き（書斎／広間／響きなし）も個別に変更でき、選ぶとその場で試し打ちします。すべて合成音のままです。
- 🎨 **カスタマイズと視点変更 (Customization & Cameras)**  
  本体カラー（マットブラック、真鍮、モスグリーン、アイボリー）、活字フォント（Special Elite / Courier Prime）、リボン色（黒／赤）などを自由に変更可能。全体、紙の手元、活字アップ、360度自由視点を切り替えられます。
- 📄 **原稿のPNG保存＆テキストコピー (Export Manuscript)**  
  打ち終えた原稿はそのまま高解像度 PNG 画像としてダウンロード可能。打った文字はテキストとしてもワンクリックでコピーできます。
- 🤪 **へんてこモード (Whimsical / Playful Mode)**  
  右上の「へんてこ」スイッチをオンにすると、打鍵速度に応じて機械が熱を帯び、煙と火花が散り、熱が限界を迎えると爆発！活字棒が絡まる JAM、文字が宙に舞う演出、打たずに放置すると活字棒がウェーブを踊るお遊び要素満載です。
- 📱 **スマホ・タッチデバイス対応 (Mobile Friendly)**  
  PCキーボードでの本格タイピングはもちろん、スマホやタブレットでは3Dキーボードの直接タップやソフトウェアキーボードでの快適なタイピングに対応しています。
- ⚡ **ノービルド＆オフライン動作 (Zero-Build / Zero-Dependency)**  
  `npm install` や `vite build` などのビルド手順は不要。純粋な HTML/CSS/ES Modules で構築されており、ローカルや静的ホスティングに置くだけで爆速で起動します。Three.js も同梱されているためオフラインでも動作します。

---

## 🎮 操作方法 (Controls)

| 操作 (Action) | PC | スマホ / タブレット (Mobile) |
|---|---|---|
| **文字を打つ (Type)** | キーボード（英数字・記号） | 3Dのキーをタップ、または「キーボード」ボタン |
| **改行 (Line Return)** | `Enter`、または改行レバーをクリック | 「改行」ボタン／画面キーボードの改行／レバーをタップ |
| **1字戻る (Back)** | `Backspace`（実機同様、文字は消えず重ね打ち） | 同左 |
| **タブ (Tab)** | `Tab`（8桁ごと） | 3Dの `TAB` キー |
| **大文字 (Shift/Lock)** | `Shift` / `CapsLock` | 3Dの `SHIFT`（次の1字のみ）/ `LOCK` |
| **ベル (Bell)** | 行末の8桁手前で自動鳴動、または真鍮ベルをクリック | 同左 |
| **視点切り替え (View)** | ツールバーの「視点」 | 同左（全体 / 紙 / 活字 / 自由ドラッグ） |
| **原稿保存 (Export)** | ツールバーの「原稿」→ PNG保存 / テキストコピー | 同左 |
| **流し込み (Paste & Auto-Type)** | `⌘V` / `Ctrl+V`、またはツールバーの「流し込み」 | 「流し込み」→ 欄に貼り付け →「流し込む」 |
| **打鍵音 (Sound)** | 「設定」→ 打鍵音 / ベルの音 / 部屋の響き | 同左 |

---

## 🚀 ローカルでの動かし方 (Getting Started)

ES Modules を使用しているため、ローカル HTTP サーバー経由で開きます。

### 1. リポジトリをクローン
```bash
git clone https://github.com/harukaappscreate/Typewriter3D.git
cd Typewriter3D
```

### 2. ローカルサーバーを起動
- **macOS**：
  `start.command` をダブルクリック（またはターミナルで `python3 -m http.server 8765`）
- **Windows**：
  `start.bat` をダブルクリック
- **Node.jsをお使いの場合**：
  ```bash
  npx serve .
  ```

ブラウザで `http://localhost:8765/` (または表示されたURL) を開くだけで楽しめます。

---

## 📁 ディレクトリ構成 (Project Structure)

```
Typewriter3D/
├── index.html              # 画面構成・メタタグ・importmap
├── css/
│   └── style.css           # UIスタイリング（ダイモテープとオニオンスキン紙の質感）
├── js/
│   ├── main.js             # エントリーポイント
│   ├── config.js           # タイピング寸法・色・速度・画質などの設定定義
│   ├── core/
│   │   ├── App.js          # メインループ・ライフサイクル管理
│   │   ├── Stage.js        # Three.js レンダラー・シーン・カメラ・リサイズ
│   │   ├── Input.js        # キーボード入力・貼り付け・タッチ・レイキャスティング
│   │   ├── Feeder.js       # 流し込み（文字の正規化・単語折り返し・自動タイプ）
│   │   ├── Settings.js     # localStorage による設定の保存・復元
│   │   ├── Quality.js      # 動的FPS監視と画質プリセット制御
│   │   ├── anim.js         # スプリング物理・イージング
│   │   └── Emitter.js      # イベントバス
│   ├── typewriter/
│   │   ├── Typewriter.js   # 機構の統括（打鍵・改行・排紙）
│   │   ├── Body.js         # フレーム・台座・レール・真鍮ベル
│   │   ├── Keyboard.js     # ガラスキートップ（InstancedMesh）
│   │   ├── TypeBasket.js   # 扇状活字棒機構（InstancedMesh）
│   │   ├── Carriage.js     # プラテン・ノブ・改行レバー・目盛り
│   │   ├── Ribbon.js       # 2色インクリボン・スプール・ガイド
│   │   ├── Cover.js        # 起動時に外れるビンテージハードカバー
│   │   ├── Materials.js    # 金属・塗装・ガラスの質感シェーダー
│   │   └── layout.js       # USキー配列定義（94文字）
│   ├── paper/
│   │   ├── PaperPath.js    # プラテン巻き付けベジェ曲線パス
│   │   ├── Paper.js        # 動的カーブ変形用紙メッシュ
│   │   ├── InkRenderer.js  # インクの滲み・かすれ・打鍵個体差描画
│   │   └── PaperStack.js   # 排紙アニメーションと原稿の山
│   ├── audio/
│   │   ├── AudioEngine.js  # Web Audio API による完全動的物理音響合成
│   │   └── soundProfiles.js # 打鍵音・ベル・部屋の響きのプリセット
│   ├── fx/
│   │   ├── Environment.js  # 書斎の机・真鍮ランプ・光の円錐・埃パーティクル
│   │   ├── CameraRig.js    # シネマティックカメラ・画角追従・手ブレ
│   │   ├── PostFX.js       # ポストプロセス（ブルーム・粒子・収差）
│   │   ├── Particles.js    # 火花・煙・文字の飛散
│   │   ├── Henteko.js      # へんてこモード（熱・JAM・ウェーブ等）
│   │   └── textures.js     # プロシージャルテクスチャ生成
│   └── ui/
│       └── UI.js           # レトロHUD・設定モーダル・原稿ギャラリー
├── vendor/
│   └── three/              # Three.js (r186.1) & アドオン（オフライン完全対応）
├── assets/
│   ├── fonts/              # Special Elite / Courier Prime
│   ├── favicon.svg         # ベクターファビコン
│   └── ogp.jpg             # OGPプレビュー画像
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages 自動デプロイ設定
├── LICENSE                 # MIT License
└── README.md
```

---

## 🛠️ 技術スタック (Tech Stack)

- **3D Graphics**: [Three.js](https://threejs.org/) (r186.1, WebGL2)
- **Audio**: Web Audio API (オシレーター & バンドパスフィルターによる完全動的合成)
- **Language**: Vanilla JavaScript (ES2022+ / ES Modules)
- **Styling**: Vanilla CSS (CSS Variables, Glassmorphism, Vintage Paper Texture)
- **No Bundler**: Vite / Webpack などのビルドツールを挟まずブラウザネイティブの `importmap` で稼働

---

## 📜 ライセンス (License)

本ソフトウェアは **[MIT License](LICENSE)** の下で公開されています。  
Copyright (c) 2026 **haruka_apps**

### サードパーティライセンス (Third-Party Notices)
- **Three.js**: MIT License (Copyright © 2010-2026 three.js authors) - [`vendor/three/LICENSE`](vendor/three/LICENSE)
- **Special Elite Font**: Apache License 2.0 - [`assets/fonts/LICENSE-SpecialElite.txt`](assets/fonts/LICENSE-SpecialElite.txt)
- **Courier Prime Font**: SIL Open Font License 1.1 - [`assets/fonts/LICENSE-CourierPrime.txt`](assets/fonts/LICENSE-CourierPrime.txt)

---

<div align="center">

Crafted with ❤️ by **[haruka_apps](https://github.com/harukaappscreate)**

</div>
