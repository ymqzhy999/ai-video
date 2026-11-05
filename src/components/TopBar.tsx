import {
  ChevronDown,
  CircleHelp,
  FilePlus2,
  FolderOpen,
  Maximize2,
  MoreHorizontal,
  Play,
  Save,
  Settings,
  Square,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  X,
  Workflow,
  Download,
  Upload,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { BrandMark } from './BrandMark';
import { ToolButton } from './ui/ToolButton';
import { formatClock } from '../lib/format';
import { fitCanvasView, zoomCanvas } from '../lib/flowBridge';
import { hasAgnesKey, hasDeepSeekKey } from '../lib/api';

export function TopBar() {
  const workflowName = useStudioStore((state) => state.workflowName);
  const workflowCategory = useStudioStore((state) => state.workflowCategory);
  const nodesCount = useStudioStore((state) => state.nodes.length);
  const saveState = useStudioStore((state) => state.saveState);
  const lastSavedAt = useStudioStore((state) => state.lastSavedAt);
  const pastLength = useStudioStore((state) => state.past.length);
  const futureLength = useStudioStore((state) => state.future.length);
  const execution = useStudioStore((state) => state.execution);
  const settings = useStudioStore((state) => state.settings);
  const zoom = useStudioStore((state) => state.viewport.zoom);
  const ui = useStudioStore((state) => state.ui);
  const saveCurrent = useStudioStore((state) => state.saveCurrent);
  const newWorkflow = useStudioStore((state) => state.newWorkflow);
  const clearCanvas = useStudioStore((state) => state.clearCanvas);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const openModal = useStudioStore((state) => state.openModal);
  const requestFit = useStudioStore((state) => state.requestFit);
  const runAll = useStudioStore((state) => state.runAll);
  const stopRun = useStudioStore((state) => state.stopRun);
  const askConfirm = useStudioStore((state) => state.askConfirm);
  const setUI = useStudioStore((state) => state.setUI);
  const exportWorkflow = useStudioStore((state) => state.exportWorkflow);
  const mobileMenuOpen = ui.mobileMenuOpen;
  const setMobileMenuOpen = (open: boolean) => setUI({ mobileMenuOpen: open });

  const running = execution.status === 'running' || execution.status === 'validating';
  const modeLabel =
    settings.executionMode === 'mock'
      ? '模拟模式'
      : settings.executionMode === 'live'
        ? '真实模式'
        : hasAgnesKey(settings) || hasDeepSeekKey(settings)
          ? '自动 · API 就绪'
          : '自动 · 模拟回退';

  const saveLabel =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'dirty'
        ? '未保存'
        : saveState === 'error'
          ? '保存失败'
          : lastSavedAt
            ? `已保存 ${formatClock(lastSavedAt)}`
            : '已保存';

  const handleClear = () => {
    const doClear = () => clearCanvas();
    if (settings.confirmOnClear) {
      askConfirm({
        title: '清空画布？',
        description: `将删除当前工作流中的 ${nodesCount} 个节点和所有连接。此操作可以撤销。`,
        confirmLabel: '清空画布',
        tone: 'danger',
        onConfirm: doClear,
      });
    } else {
      doClear();
    }
  };

  const openMenu = (modal: 'workflows' | 'settings' | 'help') => {
    setMobileMenuOpen(false);
    openModal(modal);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <BrandMark size={27} />
          </span>
          <span className="brand__text">
            <strong>ComfyUI Studio</strong>
            <small>WORKFLOW LAB</small>
          </span>
        </div>

        <div className="topbar__divider" />

        <button
          type="button"
          className="project-switcher"
          onClick={() => openModal('workflows')}
          title="打开工作流管理"
        >
          <span className="project-switcher__main">
            <span className="project-switcher__name">{workflowName}</span>
            <span className={`save-status save-status--${saveState}`}>
              <i />
              {saveLabel}
            </span>
          </span>
          <ChevronDown size={13} />
        </button>

        <span className="topbar__category">{workflowCategory}</span>

        <div className="topbar__tools topbar__tools--file">
          <ToolButton
            icon={FilePlus2}
            label="新建"
            shortcut="⌘N"
            onClick={() => void newWorkflow()}
          />
          <ToolButton
            icon={FolderOpen}
            label="打开"
            shortcut="⌘O"
            onClick={() => openModal('workflows')}
          />
          <ToolButton
            icon={Save}
            label="保存"
            shortcut="⌘S"
            onClick={() => void saveCurrent()}
          />
          <span className="tool-separator" />
          <ToolButton
            icon={Undo2}
            label="撤销"
            shortcut="⌘Z"
            onClick={undo}
            disabled={!pastLength}
          />
          <ToolButton
            icon={Redo2}
            label="重做"
            shortcut="⇧⌘Z"
            onClick={redo}
            disabled={!futureLength}
          />
          <ToolButton icon={Trash2} label="清空画布" onClick={handleClear} disabled={!nodesCount} />
        </div>

        <div className="topbar__spacer" />

        <div className="topbar__zoom">
          <ToolButton icon={ZoomOut} label="缩小画布" onClick={() => zoomCanvas('out')} compact />
          <button
            type="button"
            className="zoom-value"
            onClick={() => {
              requestFit();
              fitCanvasView();
            }}
            title="重置缩放并全览"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton icon={ZoomIn} label="放大画布" onClick={() => zoomCanvas('in')} compact />
          <ToolButton
            icon={Maximize2}
            label="全览画布"
            shortcut="⇧1"
            onClick={() => {
              requestFit();
              fitCanvasView();
            }}
          />
        </div>

        <span className="topbar__mode" title={modeLabel}>
          <i className={hasAgnesKey(settings) && settings.executionMode !== 'mock' ? 'is-live' : ''} />
          {modeLabel}
        </span>

        <div className="topbar__tools topbar__tools--utility">
          <ToolButton icon={Settings} label="设置" onClick={() => openModal('settings')} />
          <ToolButton icon={CircleHelp} label="帮助" onClick={() => openModal('help')} />
        </div>

        <button
          type="button"
          className={`run-button ${running ? 'is-running' : ''}`}
          onClick={() => {
            if (running) stopRun();
            else void runAll();
          }}
          disabled={execution.stopping}
          aria-label={running ? '停止执行' : '执行工作流'}
        >
          {running ? (
            <>
              <Square size={13} fill="currentColor" />
              <span>{execution.stopping ? '停止中' : '停止'}</span>
              <span className="run-button__progress">{execution.progress}%</span>
            </>
          ) : (
            <>
              <Play size={14} fill="currentColor" />
              <span>执行</span>
            </>
          )}
        </button>

        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="更多操作"
        >
          <MoreHorizontal size={20} />
        </button>

        {running ? (
          <span
            className={`topbar__progress ${execution.status === 'validating' ? 'is-indeterminate' : ''}`}
            style={{ width: `${execution.status === 'validating' ? 18 : execution.progress}%` }}
          />
        ) : null}
      </header>

      {mobileMenuOpen ? (
        <div className="sheet-layer" onMouseDown={() => setMobileMenuOpen(false)}>
          <div className="mobile-sheet mobile-sheet--menu" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="mobile-sheet__header">
              <div>
                <p className="eyebrow">工作流操作</p>
                <h3>{workflowName}</h3>
              </div>
              <button
                type="button"
                className="icon-btn icon-btn--ghost"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="关闭"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mobile-action-grid">
              <MenuAction icon={FilePlus2} label="新建工作流" onClick={() => { void newWorkflow(); setMobileMenuOpen(false); }} />
              <MenuAction icon={Workflow} label="工作流管理" onClick={() => openMenu('workflows')} />
              <MenuAction icon={Save} label="保存" onClick={() => { void saveCurrent(); setMobileMenuOpen(false); }} />
              <MenuAction icon={Upload} label="导出 JSON" onClick={() => { exportWorkflow(); setMobileMenuOpen(false); }} />
              <MenuAction icon={Undo2} label="撤销" disabled={!pastLength} onClick={() => { undo(); setMobileMenuOpen(false); }} />
              <MenuAction icon={Redo2} label="重做" disabled={!futureLength} onClick={() => { redo(); setMobileMenuOpen(false); }} />
              <MenuAction icon={Maximize2} label="全览画布" onClick={() => { requestFit(); fitCanvasView(); setMobileMenuOpen(false); }} />
              <MenuAction icon={Trash2} label="清空画布" tone="danger" onClick={() => { setMobileMenuOpen(false); handleClear(); }} />
              <MenuAction icon={Settings} label="设置" onClick={() => openMenu('settings')} />
              <MenuAction icon={CircleHelp} label="帮助" onClick={() => openMenu('help')} />
              <MenuAction icon={Keyboard} label="快捷键" onClick={() => openMenu('help')} />
              <MenuAction icon={Sparkles} label={modeLabel} onClick={() => openMenu('settings')} />
            </div>
            <button
              type="button"
              className="mobile-sheet__primary"
              onClick={() => {
                setMobileMenuOpen(false);
                setUI({ leftOpen: true });
              }}
            >
              <Download size={16} />
              添加节点
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: typeof FilePlus2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      className={`mobile-action ${tone === 'danger' ? 'is-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mobile-action__icon">
        <Icon size={17} />
      </span>
      <span>{label}</span>
    </button>
  );
}
