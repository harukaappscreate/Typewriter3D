// キー配列（US配列。英数字と記号 94 文字すべてを打てる）
// 各キー: { lower, upper } が活字。special は機能キー。

const ROWS_DEF = [
  ['`~', '1!', '2@', '3#', '4$', '5%', '6^', '7&', '8*', '9(', '0)', '-_', '=+', { special: 'backspace', label: '◀' }],
  [{ special: 'tab', label: 'TAB' }, 'qQ', 'wW', 'eE', 'rR', 'tT', 'yY', 'uU', 'iI', 'oO', 'pP', '[{', ']}', '\\|'],
  [{ special: 'lock', label: 'LOCK' }, 'aA', 'sS', 'dD', 'fF', 'gG', 'hH', 'jJ', 'kK', 'lL', ';:', '\'"'],
  [{ special: 'shift', label: 'SHIFT' }, 'zZ', 'xX', 'cC', 'vV', 'bB', 'nN', 'mM', ',<', '.>', '/?', { special: 'shift', label: 'SHIFT' }],
];

// 段ごとの左右ずれ（実機の千鳥配列）
const ROW_OFFSET = [0, 0.07, 0.17, 0.25];

export const KEY_SPACING = 0.212;

/** すべてのキーの一覧と、文字→キーの対応表を作る */
export function buildLayout() {
  const keys = [];
  const charMap = new Map(); // char -> { key, shifted }
  let typebarIndex = 0;
  ROWS_DEF.forEach((row, r) => {
    const n = row.length;
    const start = -((n - 1) * KEY_SPACING) / 2 + ROW_OFFSET[r] - 0.1;
    row.forEach((def, i) => {
      const key = {
        index: keys.length,
        row: r,
        x: start + i * KEY_SPACING,
        special: null,
        lower: null,
        upper: null,
        label: '',
        typebar: -1,
      };
      if (typeof def === 'string') {
        key.lower = def[0];
        key.upper = def[1];
        key.label = /[a-z]/.test(key.lower) ? key.upper : key.lower;
        key.typebar = typebarIndex++;
        charMap.set(key.lower, { key, shifted: false });
        charMap.set(key.upper, { key, shifted: true });
      } else {
        key.special = def.special;
        key.label = def.label;
      }
      keys.push(key);
    });
  });
  return { keys, charMap, typebarCount: typebarIndex };
}
