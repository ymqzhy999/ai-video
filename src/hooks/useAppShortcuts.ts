import { useEffect } from 'react';
import { useStudioStore } from '../store/studioStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

export function useAppShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const state = useStudioStore.getState();
      const mod = event.metaKey || event.ctrlKey;
      const editable = isEditableTarget(event.target);

      if (event.key === 'Escape') {
        if (state.ui.activeModal) {
          state.closeModal();
          event.preventDefault();
          return;
        }
        if (state.ui.lightbox) {
          state.showLightbox(undefined);
          event.preventDefault();
          return;
        }
        if (state.ui.mobileMenuOpen) {
          state.setUI({ mobileMenuOpen: false });
          event.preventDefault();
          return;
        }
        if (state.ui.leftOpen || state.ui.rightOpen || state.ui.logsOpen) {
          state.setUI({ leftOpen: false, rightOpen: false, logsOpen: false });
        }
        return;
      }

      if (editable) return;

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void state.saveCurrent();
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        state.redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        state.copySelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        state.paste();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        state.duplicateSelected();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        state.selectAll();
        return;
      }
      if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void state.newWorkflow();
        return;
      }
      if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        state.openModal('workflows');
        return;
      }
      if (mod && event.key === 'Enter') {
        event.preventDefault();
        void state.runAll();
        return;
      }
      if (mod && (event.key === '.' || event.key === 'Backspace')) {
        event.preventDefault();
        state.stopRun();
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        state.deleteSelected();
        return;
      }
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        state.openModal('help');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export function useAutosaveFlush(): void {
  useEffect(() => {
    const flush = () => {
      void useStudioStore.getState().flushSave();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
