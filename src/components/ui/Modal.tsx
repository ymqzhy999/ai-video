import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  closeOnBackdrop?: boolean;
  headerExtra?: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  icon,
  children,
  footer,
  size = 'md',
  className = '',
  closeOnBackdrop = true,
  headerExtra,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal modal--${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div className="modal__heading">
            {icon ? <span className="modal__icon">{icon}</span> : null}
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h2>{title}</h2>
              {subtitle ? <p className="modal__subtitle">{subtitle}</p> : null}
            </div>
          </div>
          <div className="modal__header-actions">
            {headerExtra}
            <button
              type="button"
              className="icon-btn icon-btn--ghost"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={17} />
            </button>
          </div>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
