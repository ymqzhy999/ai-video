import { Check, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useStudioStore } from '../../store/studioStore';

const ICONS = {
  info: Info,
  success: Check,
  warning: TriangleAlert,
  error: XCircle,
};

export function Toasts() {
  const toasts = useStudioStore((state) => state.toasts);
  const dismiss = useStudioStore((state) => state.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div key={toast.id} className={`toast toast--${toast.type}`} role="status">
            <span className="toast__icon">
              <Icon size={15} strokeWidth={2} />
            </span>
            <div className="toast__content">
              <strong>{toast.title}</strong>
              {toast.description ? <p>{toast.description}</p> : null}
            </div>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="关闭提示"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
