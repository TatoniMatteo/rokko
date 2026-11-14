import { validBounds } from '../../shared/security/validation.mjs';

/** Renderer rectangles are CSS pixels; native WebContentsView bounds are device-independent pixels. */
export function nativeViewBounds(value, width, height, zoom) {
  if (!Number.isFinite(zoom) || zoom <= 0 ||
      !validBounds(value, Math.ceil(width / zoom), Math.ceil(height / zoom))) return null;
  const x = Math.min(width, Math.round(value.x * zoom));
  const y = Math.min(height, Math.round(value.y * zoom));
  return { x, y, width: Math.min(width - x, Math.floor(value.width * zoom)),
    height: Math.min(height - y, Math.floor(value.height * zoom)) };
}
