import { TriangleAlert } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { Modal } from './ui/Modal';

export function ConfirmDialog() {
  const activeModal = useStudioStore((state) => state.ui.activeModal);
  const confirm = useStudioStore((state) => state.ui.confirm);
  const closeModal = useStudioStore((state) => state.closeModal);
  const acceptConfirm = useStudioStore((state) => state.acceptConfirm);

  return (
    <Modal
      open={activeModal === 'confirm' && Boolean(confirm)}
      onClose={closeModal}
      title={confirm?.title ?? '确认操作'}
      subtitle={confirm?.description}
      eyebrow="PLEASE CONFIRM"
      icon={<TriangleAlert size={18} />}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={closeModal}>
            取消
          </button>
          <button
            type="button"
            className={`btn ${confirm?.tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
            onClick={acceptConfirm}
          >
            {confirm?.confirmLabel ?? '确认'}
          </button>
        </>
      }
    >
      <p className="confirm-copy">
        {confirm?.tone === 'danger'
          ? '此操作会立即生效。你仍然可以使用撤销恢复画布改动。'
          : '确认后会立即执行此操作。'}
      </p>
    </Modal>
  );
}
