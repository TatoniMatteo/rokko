/** One gap in native DIP leaves the shell's drag separator reachable. */
export function splitBounds(bounds, ratio, divider = 8) {
  if (!Number.isFinite(ratio) || ratio < 0.25 || ratio > 0.75)
    throw new Error('Invalid split ratio');
  const gap = Math.min(divider, bounds.width),
    width = bounds.width - gap;
  const first = Math.floor(width * ratio);
  return [
    { ...bounds, width: first },
    { ...bounds, x: bounds.x + first + gap, width: width - first },
  ];
}
