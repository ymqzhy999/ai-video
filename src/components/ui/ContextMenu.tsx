import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  children?: ReactNode;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, title, subtitle, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const padding = 10;
    let nextX = x;
    let nextY = y;
    if (nextX + rect.width > window.innerWidth - padding) nextX = window.innerWidth - rect.width - padding;
    if (nextY + rect.height > window.innerHeight - padding) nextY = window.innerHeight - rect.height - padding;
    setPosition({ x: Math.max(padding, nextX), y: Math.max(padding, nextY) });
  }, [x, y]);

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointer, true);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {title ? (
        <div className="context-menu__title">
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
      ) : null}
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="context-menu__separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={`context-menu__item ${item.danger ? 'is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onClick?.();
            }}
          >
            {item.icon ? <item.icon size={14} strokeWidth={1.8} /> : <span className="context-menu__blank" />}
            <span>{item.label}</span>
            {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
