import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  variant?: 'default' | 'ghost' | 'primary' | 'danger' | 'soft';
  showLabel?: boolean;
  compact?: boolean;
  children?: ReactNode;
}

export function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active,
  variant = 'default',
  showLabel = false,
  compact = false,
  className = '',
  children,
  ...props
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className={[
        'tool-btn',
        `tool-btn--${variant}`,
        active ? 'is-active' : '',
        showLabel ? 'has-label' : '',
        compact ? 'is-compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-pressed={active}
      data-tooltip={showLabel ? undefined : label}
      {...props}
    >
      {Icon ? <Icon size={15} strokeWidth={1.8} aria-hidden /> : null}
      {showLabel ? <span>{label}</span> : null}
      {children}
      {shortcut && showLabel ? <kbd>{shortcut}</kbd> : null}
    </button>
  );
}
