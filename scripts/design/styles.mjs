const numeric = (value, name, max = 200) => {
  if (!Number.isFinite(value) || value < 0 || value > max)
    throw new Error(`Unsupported ${name}: ${value}`);
  return `${value}px`;
};
const colorNames = {
  bg: 'bg',
  surface: 'panel',
  soft: 'panel2',
  text: 'text',
  muted: 'muted',
  accent: 'accent',
  onAccent: 'on-accent',
  line: 'line',
  control: 'border',
  tint: 'accent-container',
  danger: 'danger',
  accentHover: 'accent-hover',
};
function color(paints, binding, variables) {
  if (paints?.some((paint) => paint.type !== 'solid'))
    throw new Error('Only solid colors can be synced');
  const variable = variables[binding];
  const semantic = variable && colorNames[variable.name.split('/').at(-1)];
  if (semantic) return `var(--${semantic})`;
  const paint = paints?.[0];
  if (!paint) return 'transparent';
  if (paints.length !== 1 || paint.type !== 'solid' || !/^#[\da-f]{6,8}$/i.test(paint.color))
    throw new Error('Only a solid color or semantic variable can be synced');
  return paint.color;
}
export function componentCss(nodes, variables = {}) {
  const rules = [];
  for (const [key, node] of Object.entries(nodes)) {
    if (
      key !== 'card' &&
      node.type === 'COMPONENT' &&
      !node.children?.some((c) => c.name === 'Sfondo' || c.name === 'Input')
    )
      throw new Error(`Structural change in ${key}; update the component contract`);
    const surface = node.children?.find((c) => c.name === 'Sfondo' || c.name === 'Input') || node;
    const label =
      surface.children?.find((c) => c.type === 'TEXT') ||
      node.children?.find((c) => c.type === 'TEXT');
    const field = key.startsWith('field');
    const suffix = key.endsWith('Hover')
      ? ':hover:not(:disabled)'
      : key.endsWith('Focus')
        ? ':focus-visible'
        : key.endsWith('Disabled')
          ? ':disabled'
          : key.endsWith('Busy')
            ? '[aria-busy=true]'
            : key.endsWith('Error')
              ? '[aria-invalid=true]'
              : '';
    const base = field
      ? '.ui-field-control,.settings-page input:not([type=checkbox]):not([type=color]):not([type=file]),.settings-page select'
      : key === 'card'
        ? '.ui-card,.settings-card'
        : key === 'secondary'
          ? '.ui-button.secondary,.secondary'
          : key === 'danger'
            ? '.ui-button.danger-button,.danger-button'
            : '.ui-button.primary,.primary';
    const selector = base
      .split(',')
      .map((s) => s + suffix)
      .join(',');
    const rawStroke = surface.strokeWeight ?? 0;
    const normal = field ? nodes.field : nodes.primary;
    const normalSurface =
      normal?.children?.find((c) => c.name === 'Sfondo' || c.name === 'Input') || normal;
    const border = key.endsWith('Focus') ? (normalSurface?.strokeWeight ?? rawStroke) : rawStroke;
    const opacity = node.opacity ?? 1;
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
      throw new Error('Unsupported opacity');
    const props = [
      `opacity:${opacity}`,
      `border-radius:${(Array.isArray(surface.cornerRadius) ? surface.cornerRadius : [surface.cornerRadius ?? 0]).map((n) => numeric(n, 'radius')).join(' ')}`,
      `background:${color(surface.fills, surface.boundVariables?.fill, variables)}`,
      `border:${numeric(border, 'border', 10)} solid ${color(surface.strokes, surface.boundVariables?.stroke, variables)}`,
    ];
    if (key.endsWith('Focus'))
      props.push(
        `box-shadow:inset 0 0 0 ${numeric(Math.max(0, rawStroke - border), 'focus', 10)} ${color(surface.strokes, surface.boundVariables?.stroke, variables)}`,
      );
    if (!field && key !== 'card')
      props.push(`--ui-button-width:${numeric(node.width ?? 208, 'button width', 800)}`);
    if (key === 'card') {
      const layout = node.layout || {};
      const p = layout.padding;
      const padding = Array.isArray(p)
        ? p
        : typeof p === 'number'
          ? [p]
          : p
            ? [p.top, p.right, p.bottom, p.left]
            : [label?.x ?? 24];
      props.push(`padding:${padding.map((value) => numeric(value, 'padding')).join(' ')}`);
    } else {
      if (!label) throw new Error(`Missing text in ${key}`);
      if (label.fontFamily !== 'Onest')
        throw new Error('Use the bundled Onest font; new fonts need explicit asset integration');
      const weight =
        label.fontVariations?.wght ??
        {
          Thin: 100,
          ExtraLight: 200,
          Light: 300,
          Regular: 400,
          Medium: 500,
          SemiBold: 600,
          Bold: 700,
          ExtraBold: 800,
          Black: 900,
        }[label.fontStyle] ??
        400;
      if (!Number.isFinite(weight) || weight < 100 || weight > 900)
        throw new Error('Unsupported font weight');
      const lineHeight = /^\d+(?:\.\d+)?$/.test(String(label.lineHeight))
        ? Number(label.lineHeight)
        : Math.round(label.fontSize * 1.4);
      props.push(`line-height:${numeric(lineHeight, 'line height', 100)}`);
      props.push(
        `min-height:${numeric(surface.height, 'height')}`,
        `padding:0 ${numeric(Math.max(0, (label.x ?? 16) - border), 'padding')}`,
        `font-size:${numeric(label.fontSize, 'font size', 48)}`,
        `font-weight:${weight}`,
        `color:${color(label.fills, label.boundVariables?.fill, variables)}`,
      );
    }
    rules.push(`${selector}{${props.join(';')}}`);
  }
  return (
    '/* Generated from FigCraft. Edit the native components, then save. */\n' +
    rules.join('\n') +
    '\n'
  );
}
export function paletteFromVariables(data) {
  data = data.meta ?? data;
  const palettes = { light: {}, dark: {} };
  for (const variable of Object.values(data.variables || {})) {
    const name = colorNames[variable.name.split('/').at(-1)];
    if (!name || variable.variableCollectionId !== 'VariableCollectionId:1') continue;
    const collection = data.variableCollections[variable.variableCollectionId];
    for (const mode of collection.modes) {
      const theme = mode.name === 'Chiaro' ? 'light' : mode.name === 'Scuro' ? 'dark' : null;
      const raw = variable.valuesByMode[mode.modeId];
      const value =
        raw &&
        typeof raw === 'object' &&
        ['r', 'g', 'b'].every((k) => Number.isFinite(raw[k]) && raw[k] >= 0 && raw[k] <= 1) &&
        raw.a === 1
          ? '#' +
            ['r', 'g', 'b']
              .map((k) =>
                Math.round(raw[k] * 255)
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join('')
          : raw;
      if (theme) {
        if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))
          throw new Error(`Unsupported palette value: ${variable.name}`);
        palettes[theme][name] = value;
      }
    }
  }
  if (!palettes.light.accent || !palettes.dark.accent)
    throw new Error('Missing light/dark semantic palette');
  return palettes;
}
