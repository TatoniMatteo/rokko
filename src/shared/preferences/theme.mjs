const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
const hex = channels => '#' + channels.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export function mix(a, b, amount) { return hex(rgb(a).map((v, i) => v * (1 - amount) + rgb(b)[i] * amount)); }
export function contrast(a, b) {
  const luminance = value => rgb(value).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function themeTokens(seed, dark) {
  const bg = mix(seed, dark ? '#080d16' : '#ffffff', dark ? .94 : .96);
  const panel = mix(seed, dark ? '#18212f' : '#ffffff', dark ? .94 : .995);
  const panel2 = mix(seed, dark ? '#243145' : '#ffffff', dark ? .92 : .92);
  const accentContainer = mix(seed, panel, dark ? .84 : .92);
  const text = dark ? '#f1f4fa' : '#182132';
  const legible = (color, ratio) => {
    for (let i = 0; i <= 100; i++) {
      const next = mix(color, text, i / 100);
      if ([bg, panel, panel2, accentContainer].every(surface => contrast(next, surface) >= ratio)) return next;
    }
    return text;
  };
  const accent = legible(seed, 4.5);
  return { bg, panel, panel2, text, line: mix(text, panel, dark ? .88 : .91),
    'accent-container': accentContainer, muted: legible(dark ? '#a4b1c5' : '#59667a', 4.5), accent,
    border: legible(mix(seed, panel, .8), 3), 'on-accent': contrast('#ffffff', accent) >= 4.5 ? '#ffffff' : '#101621',
    danger: legible('#c53d54', 4.5), 'danger-border': legible('#c53d54', 3), 'icon-surface': '#f1f4fa' };
}
