import type { ViewBounds } from '../../shared/contracts/model';
export function splitBounds(
  bounds: ViewBounds,
  ratio: number,
  divider?: number,
): [ViewBounds, ViewBounds];
