import { useEffect, useRef, useState } from 'react';
import { useViewport } from '@xyflow/react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ChevronDown,
  Group,
  Hand,
  LayoutGrid,
  Maximize2,
  MousePointer2,
  Redo2,
  Ungroup,
  Undo2,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { ToolButton } from './ui/ToolButton';
import type { AlignMode } from '../lib/graph';

const ALIGN_ITEMS: Array<{ mode: AlignMode; label: string; icon: typeof AlignLeft }> = [
  { mode: 'left', label: '左对齐', icon: AlignLeft },
  { mode: 'centerX', label: '水平居中', icon: AlignCenterHorizontal },
  { mode: 'right', label: '右对齐', icon: AlignRight },
  { mode: 'top', label: '上对齐', icon: AlignStartVertical },
  { mode: 'centerY', label: '垂直居中', icon: AlignCenterVertical },
  { mode: 'bottom', label: '下对齐', icon: AlignEndVertical },
  { mode: 'distributeX', label: '水平分布', icon: AlignHorizontalSpaceAround },
  { mode: 'distributeY', label: '垂直分布', icon: AlignVerticalSpaceAround },
];

export function CanvasToolbar() {
  const tool = useStudioStore((state) => state.ui.canvasTool);
  const setUI = useStudioStore((state) => state.setUI);
  const undo = useStudioStore((state) => state.undo);
  const redo = useStudioStore((state) => state.redo);
  const pastLength = useStudioStore((state) => state.past.length);
  const futureLength = useStudioStore((state) => state.future.length);
  const selectedNodeIds = useStudioStore((state) => state.selectedNodeIds);
  const nodes = useStudioStore((state) => state.nodes);
  const groupSelected = useStudioStore((state) => state.groupSelected);
  const ungroupSelected = useStudioStore((state) => state.ungroupSelected);
  const alignSelected = useStudioStore((state) => state.alignSelected);
  const autoLayout = useStudioStore((state) => state.autoLayout);
  const requestFit = useStudioStore((state) => state.requestFit);
  const [alignOpen, setAlignOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport();

  useEffect(() => {
    if (!alignOpen) return;
    const handlePointer = (event: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setAlignOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [alignOpen]);

  const hasGroupSelected = nodes.some(
    (node) => selectedNodeIds.includes(node.id) && node.data.defType === 'group',
  );

  return (
    <div className="canvas-toolbar">
      <div className="canvas-toolbar__group">
        <ToolButton
          icon={MousePointer2}
          label="框选模式（拖动空白处框选）"
          active={tool === 'select'}
          onClick={() => setUI({ canvasTool: 'select' })}
        />
        <ToolButton
          icon={Hand}
          label="移动画布（拖动空白处平移）"
          active={tool === 'pan'}
          onClick={() => setUI({ canvasTool: 'pan' })}
        />
      </div>
      <span className="tool-separator" />
      <div className="canvas-toolbar__group">
        <ToolButton icon={Undo2} label="撤销" disabled={!pastLength} onClick={undo} />
        <ToolButton icon={Redo2} label="重做" disabled={!futureLength} onClick={redo} />
      </div>
      <span className="tool-separator" />
      <div className="canvas-toolbar__group canvas-toolbar__align">
        <button
          type="button"
          className={`tool-btn has-dropdown ${selectedNodeIds.length > 1 ? '' : 'is-disabled'}`}
          onClick={() => setAlignOpen((open) => !open)}
          disabled={selectedNodeIds.length < 2}
          title="对齐与分布"
          aria-label="对齐与分布"
        >
          <AlignCenterHorizontal size={15} />
          <ChevronDown size={10} />
        </button>
        {alignOpen ? (
          <div className="toolbar-popover" ref={popoverRef}>
            <p className="toolbar-popover__title">对齐与分布</p>
            <div className="align-grid">
              {ALIGN_ITEMS.map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  onClick={() => {
                    alignSelected(item.mode);
                    setAlignOpen(false);
                  }}
                >
                  <item.icon size={14} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <ToolButton
          icon={hasGroupSelected ? Ungroup : Group}
          label={hasGroupSelected ? '取消分组' : '分组所选节点'}
          onClick={hasGroupSelected ? ungroupSelected : groupSelected}
          disabled={selectedNodeIds.length < 2 && !hasGroupSelected}
        />
        <ToolButton icon={LayoutGrid} label="按依赖自动排列" onClick={autoLayout} />
      </div>
      <span className="tool-separator canvas-toolbar__fit-separator" />
      <ToolButton
        icon={Maximize2}
        label="全览工作流"
        onClick={() => {
          requestFit();
        }}
      />
      <span className="canvas-toolbar__zoom">{Math.round(viewport.zoom * 100)}%</span>
    </div>
  );
}
