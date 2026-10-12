// ============================================================
//  打鍵音のプリセット（すべて合成。数値は「クラシック」に対する倍率）
// ============================================================
//  pitch      … 音全体の高さ
//  gain       … 音量
//  thud       … 胴鳴り（低い「ドッ」）の強さ
//  click      … 高い「チッ」の強さ
//  ring       … 金属の響きの強さ
//  decay      … 余韻の長さ
//  escapement … キャリッジが一歩進む「カチッ」の強さ（0 で無し）
//  jitter     … 1打ごとのばらつき
//  slide      … 改行の滑走音の高さ
//  lowpass    … 全体にかける高域カット（Hz）
//  hum        … 電動機のうなり（0 で無し）
//  chip       … true で 8bit 風の別系統の音

const BASE = {
  pitch: 1, gain: 1, thud: 1, click: 1, ring: 1, decay: 1,
  escapement: 1, jitter: 1, slide: 1, lowpass: 20000, hum: 0, chip: false,
};

export const SOUND_PROFILES = {
  classic: { ...BASE, name: 'クラシック' },
  desk: {
    ...BASE, name: '重厚なデスクトップ機',
    pitch: 0.78, gain: 1.05, thud: 1.6, click: 0.75, ring: 1.3, decay: 1.45, escapement: 1.2, slide: 0.8, lowpass: 9000,
  },
  portable: {
    ...BASE, name: '軽快なポータブル',
    pitch: 1.32, gain: 0.9, thud: 0.5, click: 1.35, ring: 0.6, decay: 0.7, escapement: 0.8, jitter: 1.25, slide: 1.25,
  },
  electric: {
    ...BASE, name: '電動タイプライター',
    pitch: 1.08, gain: 0.85, thud: 0.9, click: 0.5, ring: 0.4, decay: 0.6, escapement: 0, jitter: 0.2, lowpass: 7000, hum: 1,
  },
  quiet: {
    ...BASE, name: '静音（夜の書斎）',
    pitch: 0.9, gain: 0.5, thud: 0.8, click: 0.25, ring: 0.3, decay: 0.85, escapement: 0.4, jitter: 0.8, slide: 0.9, lowpass: 2400,
  },
  chip: { ...BASE, name: 'ピコピコ', gain: 0.8, chip: true },
};

// ベル：基音の高さと、倍音 [倍率, 音量, 余韻(秒)]
export const BELL_TYPES = {
  brass: { name: '真鍮のベル', f0: 1860, partials: [[1, 0.32, 1.7], [2.76, 0.14, 0.9], [5.4, 0.07, 0.5], [8.93, 0.035, 0.28]] },
  small: { name: '小さなチン', f0: 2650, partials: [[1, 0.26, 0.7], [2.4, 0.1, 0.35], [4.1, 0.05, 0.2]] },
  deep:  { name: '低い鐘', f0: 1050, partials: [[1, 0.34, 2.6], [2.0, 0.12, 1.8], [2.98, 0.09, 1.2], [4.2, 0.05, 0.7], [5.4, 0.03, 0.45]] },
};

// 部屋の響き（残響の長さ・減衰・混ぜる量）
export const ROOMS = {
  study: { name: '書斎', seconds: 1.1, decay: 3.2, wet: 0.16 },
  hall:  { name: '広間', seconds: 2.8, decay: 2.2, wet: 0.34 },
  dry:   { name: '響きなし', seconds: 0.25, decay: 4, wet: 0.03 },
};
