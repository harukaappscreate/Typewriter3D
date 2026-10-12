// ============================================================
//  調整用の設定値（ここを変えると挙動・寸法が変わります）
//  単位：1 = 10cm（デシメートル）
// ============================================================

export const PAPER = {
  width: 2.15,          // 紙の幅
  height: 2.78,         // 紙の高さ（レター比）
  marginLeft: 0.17,
  marginTop: 0.26,
  marginBottom: 0.2,
  cols: 48,             // 1行の文字数
  lineAdvance: 0.072,   // 1行送りの量（行間1.0のとき）
  bellBefore: 8,        // 行末の何文字手前でベルを鳴らすか
  tabStop: 8,
};

// 機械の主要寸法
export const MACHINE = {
  platen: { y: 1.15, z: -0.85, radius: 0.2, length: 2.62 },
  paperRadius: 0.206,   // 紙はプラテンより少し外側を通る
  segmentRadius: 0.5,   // 活字棒の支点の円弧
  pivotDrop: 0.2,       // 支点は印字点より下
  basketSpan: 1.36,     // 活字棒の扇の角度（ラジアン、片側）
  restDroop: 0.12,      // 待機中の活字棒の垂れ
};

// 印字点（すべての活字棒がここを打つ）
export const PRINT_POINT = {
  x: 0,
  y: MACHINE.platen.y,
  z: MACHINE.platen.z + MACHINE.paperRadius,
};

// タイミング（秒）
export const TIMING = {
  minStrikeGap: 0.038,  // 連打の最短間隔
  barUp: 0.052,         // キーを押してから活字が紙に当たるまで
  barDown: 0.13,
  keyDown: 0.03,
  keyUp: 0.11,
  returnBase: 0.2,
  returnPerCol: 0.006,
};

// 色・外装
export const FINISHES = {
  black:   { name: '黒エナメル',   body: '#0d0d10', decal: '#c9a15b' },
  seafoam: { name: 'シーフォーム', body: '#7fae9f', decal: '#f3eedf' },
  cream:   { name: 'クリーム',     body: '#d9cdb1', decal: '#7a2a20' },
  oxblood: { name: 'オックスブラッド', body: '#4a1414', decal: '#d8b56a' },
};

export const INK = {
  black: '#1b1a22',
  red: '#a3221c',
};

export const TYPEFACES = {
  elite:   { name: 'Special Elite（古びた活字）', family: 'Special Elite', weight: 400 },
  courier: { name: 'Courier Prime（端正な活字）', family: 'Courier Prime', weight: 400 },
};

// 画質プリセット
export const QUALITY_PRESETS = {
  high:   { label: '高', pixelRatio: 2,    shadowMap: 2048, post: true,  bloom: true,  msaa: 4, paperPx: 2048, dust: 420 },
  medium: { label: '中', pixelRatio: 1.6,  shadowMap: 1024, post: true,  bloom: true,  msaa: 2, paperPx: 2048, dust: 240 },
  low:    { label: '低', pixelRatio: 1.25, shadowMap: 1024, post: false, bloom: false, msaa: 0, paperPx: 1280, dust: 120 },
};

// 初期設定（localStorage に保存されます）
export const DEFAULT_SETTINGS = {
  typeface: 'elite',
  ribbon: 'black',
  finish: 'black',
  spacing: 1,
  autoReturn: true,
  volume: 0.8,
  ambience: true,
  sound: true,
  soundProfile: 'classic', // 打鍵音の音色（js/audio/soundProfiles.js）
  bellType: 'brass',
  room: 'study',
  feedSpeed: 9,            // 流し込みの速さ（字/秒）
  quality: 'auto',
  henteko: false,
};
