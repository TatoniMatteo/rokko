import { useEffect, useRef } from 'react';
import type { ViewBounds } from '../../shared/contracts/model';
import type { Preferences } from '../../shared/preferences/preferences.mjs';

// Keep Chromium's native view aligned with the React content area and focus page headings.
export function useServiceViewport(
  page: string,
  dock: Preferences['dock'],
  activeAppId: string | null,
  selectedWorkspaceId: string,
  hasActiveApp: boolean,
) {
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayOpen = page !== 'home';
  useEffect(() => {
    window.rokko.setOverlayOpen(overlayOpen);
  }, [page, overlayOpen]);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const bounds: ViewBounds = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.max(0, Math.floor(r.width)),
        height: Math.max(0, Math.floor(r.height)),
      };
      window.rokko.updateBounds(bounds);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [dock, overlayOpen, page]);
  useEffect(() => {
    if (!overlayOpen && hasActiveApp) return;
    const content = contentRef.current;
    if (content?.contains(document.activeElement) && document.activeElement !== content) return;
    const heading = content?.querySelector('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [page, activeAppId, selectedWorkspaceId, overlayOpen, hasActiveApp]);
  return contentRef;
}
