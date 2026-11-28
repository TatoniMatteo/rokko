import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPosition =
  | 'right'
  | 'left'
  | 'below'
  | 'above'
  | 'dock-left'
  | 'dock-right'
  | 'dock-top'
  | 'dock-bottom';
type TooltipState = { text: string; left: number; top: number; position: TooltipPosition };

function positionTooltip(element: HTMLElement): TooltipState | null {
  const text = element.dataset.tooltip?.trim();
  if (!text) return null;
  if (element.dataset.tooltipPlacement === 'dock') {
    const rect = element.getBoundingClientRect();
    const shell = element.closest('.app-shell');
    const dock = ['left', 'right', 'top', 'bottom'].find((side) =>
      shell?.classList.contains(`dock-${side}`),
    );
    if (dock === 'left' || dock === 'right') {
      return {
        text,
        left: dock === 'left' ? rect.right + 8 : rect.left - 8,
        top: rect.top + rect.height / 2,
        position: `dock-${dock}`,
      };
    }
    if (dock === 'top' || dock === 'bottom') {
      return {
        text,
        left: rect.left + rect.width / 2,
        top: dock === 'top' ? rect.bottom + 8 : rect.top - 8,
        position: `dock-${dock}`,
      };
    }
    return {
      text,
      left: rect.left + rect.width / 2,
      top: rect.top - 8,
      position: 'above',
    };
  }
  if (element.dataset.tooltipPlacement === 'bottom') {
    return {
      text,
      left: window.innerWidth / 2,
      top: window.innerHeight - 16,
      position: 'above',
    };
  }
  const rect = element.getBoundingClientRect();
  const spaces: [TooltipPosition, number][] = [
    ['right', window.innerWidth - rect.right],
    ['left', rect.left],
    ['below', window.innerHeight - rect.bottom],
    ['above', rect.top],
  ];
  const position = spaces.reduce((best, current) => (current[1] > best[1] ? current : best))[0];
  return {
    text,
    position,
    left:
      position === 'right'
        ? rect.right + 8
        : position === 'left'
          ? rect.left - 8
          : rect.left + rect.width / 2,
    top:
      position === 'below'
        ? rect.bottom + 8
        : position === 'above'
          ? rect.top - 8
          : rect.top + rect.height / 2,
  };
}

export function ThemedTooltip({ overService = false }: { overService?: boolean }) {
  const id = useId();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const mirror = overService && tooltip?.position.startsWith('dock-');

  useLayoutEffect(() => {
    const element = tooltipRef.current;
    if (!tooltip || !element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    const left = rect.left < margin
      ? tooltip.left + margin - rect.left
      : rect.right > window.innerWidth - margin
        ? tooltip.left + window.innerWidth - margin - rect.right
        : tooltip.left;
    const top = rect.top < margin
      ? tooltip.top + margin - rect.top
      : rect.bottom > window.innerHeight - margin
        ? tooltip.top + window.innerHeight - margin - rect.bottom
        : tooltip.top;
    if (left !== tooltip.left || top !== tooltip.top) {
      setTooltip(current => current === tooltip ? { ...current, left, top } : current);
    }
  }, [tooltip]);

  useLayoutEffect(() => {
    if (!mirror || !tooltipRef.current) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const rect = tooltipRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.floor(rect.left);
        const y = Math.floor(rect.top);
        window.rokko.setDockTooltip({
          x, y, width: Math.ceil(rect.right) - x, height: Math.ceil(rect.bottom) - y,
        });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.rokko.setDockTooltip(null);
    };
  }, [mirror, tooltip]);

  useEffect(() => {
    function clear() {
      const target = targetRef.current;
      if (target) {
        const describedBy = target
          .getAttribute('aria-describedby')
          ?.split(/\s+/)
          .filter((value) => value && value !== id);
        if (describedBy?.length) target.setAttribute('aria-describedby', describedBy.join(' '));
        else target.removeAttribute('aria-describedby');
      }
      targetRef.current = null;
      setTooltip(null);
    }

    function show(target: HTMLElement | null) {
      if (!target) {
        clear();
        return;
      }
      if (targetRef.current !== target) clear();
      targetRef.current = target;
      const description = target.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? [];
      if (!description.includes(id)) {
        target.setAttribute('aria-describedby', [...description, id].join(' '));
      }
      setTooltip(positionTooltip(target));
    }

    function closestTooltip(target: EventTarget | null) {
      return target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
    }

    function onMouseOver(event: MouseEvent) {
      const target = closestTooltip(event.target);
      if (target && target !== targetRef.current) show(target);
    }
    function onMouseOut(event: MouseEvent) {
      const current = closestTooltip(event.target);
      if (current && current === targetRef.current && !current.contains(event.relatedTarget as Node | null)) {
        clear();
      }
    }
    function onFocusIn(event: FocusEvent) {
      show(closestTooltip(event.target));
    }
    function onFocusOut(event: FocusEvent) {
      const current = closestTooltip(event.target);
      if (current && current === targetRef.current && !current.contains(event.relatedTarget as Node | null)) {
        clear();
      }
    }
    function updatePosition() {
      if (targetRef.current) setTooltip(positionTooltip(targetRef.current));
    }

    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('pointerdown', clear);
    document.addEventListener('dragstart', clear);
    window.addEventListener('blur', clear);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer = new MutationObserver((records) => {
      const target = targetRef.current;
      if (!target) return;
      if (!target.isConnected || !target.dataset.tooltip?.trim()) clear();
      else if (records.some((record) => record.type === 'attributes' && record.target === target)) {
        updatePosition();
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-tooltip'],
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      document.removeEventListener('mouseover', onMouseOver, true);
      document.removeEventListener('mouseout', onMouseOut, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', clear);
      document.removeEventListener('dragstart', clear);
      window.removeEventListener('blur', clear);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      clear();
    };
  }, [id]);

  if (!tooltip) return null;
  return createPortal(
    <span
      ref={tooltipRef}
      className={`app-tooltip app-tooltip-${tooltip.position}`}
      id={id}
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top, animation: mirror ? 'none' : undefined }}
    >
      {tooltip.text}
    </span>,
    document.body,
  );
}
