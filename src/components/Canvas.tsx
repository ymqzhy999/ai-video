import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeMouseHandler,
  type OnConnect,
  type OnReconnect,
  type Connection,
} from '@xyflow/react';
import {
  BoxSelect,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Group,
  ImagePlus,
  LayoutGrid,
  Link2Off,
  Maximize2,
  MessageSquareText,
  MousePointer2,
  Play,
  PlayCircle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Ungroup,
  X,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import type { StudioEdge, StudioNode } from '../types/studio';
import { getNodeDefinition } from '../lib/nodeRegistry';
import { setFlowInstance, fitCanvasView } from '../lib/flowBridge';
import { StudioNodeView } from './StudioNode';
import { StudioEdgeView } from './StudioEdge';
import { CanvasToolbar } from './CanvasToolbar';
import { ContextMenu, type ContextMenuItem } from './ui/ContextMenu';

const nodeTypes = { studio: StudioNodeView };
const edgeTypes = { studioEdge: StudioEdgeView };

type MenuState =
  | { kind: 'node'; id: string; x: number; y: number }
  | { kind: 'edge'; id: string; x: number; y: number }
  | { kind: 'pane'; x: number; y: number }
  | null;

function CanvasInner() {
  const nodes = useStudioStore((state) => state.nodes);
  const edges = useStudioStore((state) => state.edges);
  const settings = useStudioStore((state) => state.settings);
  const tool = useStudioStore((state) => state.ui.canvasTool);
  const fitRequest = useStudioStore((state) => state.fitRequest);
  const activeWorkflowId = useStudioStore((state) => state.activeWorkflowId);
  const execution = useStudioStore((state) => state.execution);
  const selectedNodeIds = useStudioStore((state) => state.selectedNodeIds);
  const copyBuffer = useStudioStore((state) => state.copyBuffer);
  const favoriteNodes = useStudioStore((state) => state.favoriteNodes);
  const onNodesChange = useStudioStore((state) => state.onNodesChange);
  const onEdgesChange = useStudioStore((state) => state.onEdgesChange);
  const onConnect = useStudioStore((state) => state.onConnect);
  const onReconnect = useStudioStore((state) => state.onReconnect);
  const validateConnection = useStudioStore((state) => state.validateConnection);
  const onNodeDragStart = useStudioStore((state) => state.onNodeDragStart);
  const addNode = useStudioStore((state) => state.addNode);
  const openNodeInspector = useStudioStore((state) => state.openNodeInspector);
  const selectNodes = useStudioStore((state) => state.selectNodes);
  const duplicateSelected = useStudioStore((state) => state.duplicateSelected);
  const deleteNodes = useStudioStore((state) => state.deleteNodes);
  const disconnectNode = useStudioStore((state) => state.disconnectNode);
  const deleteEdge = useStudioStore((state) => state.deleteEdge);
  const toggleFavoriteNode = useStudioStore((state) => state.toggleFavoriteNode);
  const toggleNodeCollapse = useStudioStore((state) => state.toggleNodeCollapse);
  const runNode = useStudioStore((state) => state.runNode);
  const runFrom = useStudioStore((state) => state.runFrom);
  const groupSelected = useStudioStore((state) => state.groupSelected);
  const ungroupSelected = useStudioStore((state) => state.ungroupSelected);
  const autoLayout = useStudioStore((state) => state.autoLayout);
  const requestFit = useStudioStore((state) => state.requestFit);
  const paste = useStudioStore((state) => state.paste);
  const clearCanvas = useStudioStore((state) => state.clearCanvas);
  const askConfirm = useStudioStore((state) => state.askConfirm);
  const openModal = useStudioStore((state) => state.openModal);
  const setUI = useStudioStore((state) => state.setUI);
  const setViewport = useStudioStore((state) => state.setViewport);
  const { screenToFlowPosition, fitView } = useReactFlow<StudioNode, StudioEdge>();
  const [menu, setMenu] = useState<MenuState>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsTouch(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const handleNodeMenu = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; x: number; y: number }>).detail;
      if (!detail?.nodeId) return;
      selectNodes([detail.nodeId]);
      setMenu({ kind: 'node', id: detail.nodeId, x: detail.x, y: detail.y });
    };
    window.addEventListener('studio:node-menu', handleNodeMenu);
    return () => window.removeEventListener('studio:node-menu', handleNodeMenu);
  }, [selectNodes]);

  useEffect(() => {
    if (!fitRequest) return;
    const timer = window.setTimeout(() => {
      fitCanvasView();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [fitRequest, activeWorkflowId]);

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      onConnect(connection);
    },
    [onConnect],
  );

  const handleReconnect: OnReconnect<StudioEdge> = useCallback(
    (oldEdge, connection) => {
      onReconnect(oldEdge, connection);
    },
    [onReconnect],
  );

  const handleNodeClick: NodeMouseHandler<StudioNode> = useCallback(
    (event, node) => {
      closeMenu();
      if (window.matchMedia('(max-width: 980px)').matches) {
        openNodeInspector(node.id);
      }
      void event;
    },
    [closeMenu, openNodeInspector],
  );

  const handleNodeDoubleClick: NodeMouseHandler<StudioNode> = useCallback(
    (event, node) => {
      event.stopPropagation();
      openNodeInspector(node.id);
    },
    [openNodeInspector],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const defType =
        event.dataTransfer.getData('application/x-comfy-node') ||
        event.dataTransfer.getData('text/plain');
      if (!defType) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNode(defType, position);
    },
    [addNode, screenToFlowPosition],
  );

  const menuNode = useMemo(
    () => (menu?.kind === 'node' ? nodes.find((node) => node.id === menu.id) : undefined),
    [menu, nodes],
  );
  const menuEdge = useMemo(
    () => (menu?.kind === 'edge' ? edges.find((edge) => edge.id === menu.id) : undefined),
    [menu, edges],
  );

  const nodeMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menuNode) return [];
    const definition = getNodeDefinition(menuNode.data.defType);
    const isGroup = menuNode.data.defType === 'group';
    const isNote = menuNode.data.defType === 'note';
    const isFavorite = favoriteNodes.includes(menuNode.data.defType);
    if (isGroup) {
      return [
        {
          id: 'inspect',
          label: '打开分组属性',
          icon: SlidersHorizontal,
          onClick: () => openNodeInspector(menuNode.id),
        },
        {
          id: 'ungroup',
          label: '取消分组',
          icon: Ungroup,
          onClick: () => ungroupSelected(),
        },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'delete',
          label: '删除分组（保留节点）',
          icon: Trash2,
          danger: true,
          onClick: () => deleteNodes([menuNode.id]),
        },
      ];
    }
    const items: ContextMenuItem[] = [
      ...(!isNote
        ? [
            {
              id: 'run',
              label: '运行此节点',
              icon: Play,
              shortcut: '⌘↵',
              onClick: () => void runNode(menuNode.id),
            },
            {
              id: 'run-from',
              label: '从此节点继续执行',
              icon: PlayCircle,
              onClick: () => void runFrom(menuNode.id),
            },
            { id: 'sep-run', label: '', separator: true },
          ]
        : []),
      {
        id: 'inspect',
        label: '打开属性面板',
        icon: SlidersHorizontal,
        onClick: () => openNodeInspector(menuNode.id),
      },
      {
        id: 'duplicate',
        label: '复制节点',
        icon: Copy,
        shortcut: '⌘D',
        onClick: () => {
          selectNodes([menuNode.id]);
          window.setTimeout(() => duplicateSelected(), 0);
        },
      },
      {
        id: 'disconnect',
        label: '断开所有连接',
        icon: Link2Off,
        disabled: !edges.some((edge) => edge.source === menuNode.id || edge.target === menuNode.id),
        onClick: () => disconnectNode(menuNode.id),
      },
      {
        id: 'favorite',
        label: isFavorite ? '取消收藏节点类型' : '收藏节点类型',
        icon: Star,
        onClick: () => toggleFavoriteNode(menuNode.data.defType),
      },
      {
        id: 'collapse',
        label: menuNode.data.collapsed ? '展开节点' : '收起节点',
        icon: menuNode.data.collapsed ? ChevronDown : ChevronUp,
        onClick: () => toggleNodeCollapse(menuNode.id),
      },
      { id: 'sep1', label: '', separator: true },
      {
        id: 'delete',
        label: '删除节点',
        icon: Trash2,
        shortcut: '⌫',
        danger: true,
        onClick: () => deleteNodes([menuNode.id]),
      },
    ];
    void definition;
    return items;
  }, [
    menuNode,
    favoriteNodes,
    edges,
    duplicateSelected,
    disconnectNode,
    toggleFavoriteNode,
    toggleNodeCollapse,
    openNodeInspector,
    ungroupSelected,
    deleteNodes,
    runNode,
    runFrom,
    selectNodes,
  ]);

  const paneMenuItems = useMemo<ContextMenuItem[]>(
    () => [
      {
        id: 'add-node',
        label: '添加节点',
        icon: Sparkles,
        onClick: () => setUI({ leftOpen: true }),
      },
      {
        id: 'paste',
        label: '粘贴节点',
        icon: ClipboardPaste,
        shortcut: '⌘V',
        disabled: !copyBuffer?.nodes.length,
        onClick: paste,
      },
      { id: 'sep1', label: '', separator: true },
      {
        id: 'layout',
        label: '自动排列工作流',
        icon: LayoutGrid,
        onClick: autoLayout,
      },
      {
        id: 'fit',
        label: '全览画布',
        icon: Maximize2,
        onClick: requestFit,
      },
      { id: 'sep2', label: '', separator: true },
      {
        id: 'clear',
        label: '清空画布',
        icon: Trash2,
        danger: true,
        onClick: () => {
          if (settings.confirmOnClear) {
            askConfirm({
              title: '清空画布？',
              description: `将删除 ${nodes.length} 个节点和全部连接，此操作可以撤销。`,
              confirmLabel: '清空画布',
              tone: 'danger',
              onConfirm: clearCanvas,
            });
          } else {
            clearCanvas();
          }
        },
      },
    ],
    [
      copyBuffer,
      paste,
      autoLayout,
      requestFit,
      settings.confirmOnClear,
      askConfirm,
      clearCanvas,
      setUI,
      nodes.length,
    ],
  );

  const isRunning = execution.status === 'running';

  return (
    <div
      className={`canvas-stage ${dragOver ? 'is-drag-over' : ''} tool-${tool}`}
      ref={wrapperRef}
      onDrop={handleDrop}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
      }}
    >
      <ReactFlow<StudioNode, StudioEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onReconnect={handleReconnect}
        edgesReconnectable
        isValidConnection={(connection) => validateConnection(connection as Connection)}
        onNodeDragStart={onNodeDragStart}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          selectNodes([node.id]);
          setMenu({ kind: 'node', id: node.id, x: event.clientX, y: event.clientY });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          setMenu({ kind: 'edge', id: edge.id, x: event.clientX, y: event.clientY });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu({ kind: 'pane', x: event.clientX, y: event.clientY });
        }}
        onPaneClick={closeMenu}
        onMoveEnd={(_, viewport) => setViewport(viewport)}
        onInit={(instance) => {
          setFlowInstance(instance);
          window.setTimeout(() => fitView({ padding: 0.18, duration: 0, maxZoom: 1.02 }), 60);
        }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.02 }}
        minZoom={0.2}
        maxZoom={2.4}
        defaultEdgeOptions={{ type: 'studioEdge', interactionWidth: 20 }}
        connectionLineStyle={{ stroke: '#8b7dff', strokeWidth: 2 }}
        connectionRadius={30}
        snapToGrid={settings.snapToGrid}
        snapGrid={[settings.gridSize, settings.gridSize]}
        panOnDrag={tool === 'pan' || isTouch ? true : [1, 2]}
        selectionOnDrag={tool === 'select' && !isTouch}
        selectNodesOnDrag={false}
        multiSelectionKeyCode={['Meta', 'Control']}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        elevateNodesOnSelect
        proOptions={{ hideAttribution: true }}
        className="studio-flow"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={settings.gridSize > 16 ? settings.gridSize * 1.5 : 24}
          size={1.15}
          color="#252a33"
        />
        {settings.showMinimap ? (
          <MiniMap
            className="studio-minimap"
            pannable
            zoomable
            nodeStrokeWidth={2}
            maskColor="rgba(6, 8, 11, .72)"
            nodeColor={(node) => {
              if (node.data.status === 'running') return '#8b7dff';
              if (node.data.status === 'success') return '#45d483';
              if (node.data.status === 'error') return '#ff5d6c';
              if (node.data.defType === 'group') return 'rgba(139,125,255,.12)';
              return '#353c49';
            }}
            nodeBorderRadius={6}
          />
        ) : null}
        <Panel position="top-left" className="canvas-panel-toolbar">
          <CanvasToolbar />
        </Panel>
        {isRunning && execution.currentNodeLabel ? (
          <Panel position="top-center" className="canvas-panel-status">
            <span className="canvas-running-pill">
              <i />
              正在执行
              <strong>{execution.currentNodeLabel}</strong>
              <em>{execution.progress}%</em>
            </span>
          </Panel>
        ) : null}
        <Panel position="bottom-left" className="canvas-panel-hints">
          <span className="canvas-hint">
            <MousePointer2 size={11} />
            {tool === 'select' ? '拖动空白处框选 · 手形工具平移' : '拖动平移 · 滚轮缩放'}
          </span>
        </Panel>
      </ReactFlow>

      {!nodes.length ? (
        <div className="canvas-empty">
          <div className="canvas-empty__mark">
            <Sparkles size={21} />
          </div>
          <p className="eyebrow">START A WORKFLOW</p>
          <h2>从第一个节点开始</h2>
          <p className="canvas-empty__copy">
            从左侧拖入节点，或点击下面的快捷入口。连接同类型端口，就能搭建一条可以运行的
            AI 图像工作流。
          </p>
          <div className="canvas-empty__actions">
            <button type="button" className="btn btn--soft" onClick={() => addNode('prompt')}>
              <MessageSquareText size={15} />
              添加提示词
            </button>
            <button type="button" className="btn btn--soft" onClick={() => addNode('agnes-image')}>
              <ImagePlus size={15} />
              添加 Agnes 生成
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => openModal('help')}>
              <BookOpen size={15} />
              3 分钟入门
            </button>
          </div>
          <div className="canvas-empty__steps">
            <span>
              <b>01</b> 拖入节点
            </span>
            <i />
            <span>
              <b>02</b> 连接端口
            </span>
            <i />
            <span>
              <b>03</b> 点击执行
            </span>
          </div>
        </div>
      ) : null}

      {selectedNodeIds.length > 1 ? (
        <div className="canvas-selection-pill">
          <BoxSelect size={13} />
          <span>已选择 {selectedNodeIds.length} 个节点</span>
          <button type="button" onClick={groupSelected}>
            <Group size={12} />
            分组
          </button>
          <button type="button" onClick={duplicateSelected}>
            <Copy size={12} />
            复制
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => {
              askConfirm({
                title: `删除 ${selectedNodeIds.length} 个节点？`,
                description: '与这些节点相连的连接也会被删除。此操作可以撤销。',
                confirmLabel: '删除',
                tone: 'danger',
                onConfirm: () => deleteNodes(selectedNodeIds),
              });
            }}
          >
            <Trash2 size={12} />
            删除
          </button>
          <button
            type="button"
            className="canvas-selection-pill__close"
            onClick={() => useStudioStore.getState().clearSelection()}
            aria-label="取消选择"
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {dragOver ? (
        <div className="canvas-drop-indicator">
          <span>松开以添加节点</span>
        </div>
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={
            menu.kind === 'node'
              ? nodeMenuItems
              : menu.kind === 'edge'
                ? [
                    {
                      id: 'delete-edge',
                      label: '删除这条连接',
                      icon: Trash2,
                      danger: true,
                      onClick: () => {
                        if (menuEdge) deleteEdge(menuEdge.id);
                      },
                    },
                    { id: 'sep', label: '', separator: true },
                    {
                      id: 'inspect-hint',
                      label: '拖动连接端点可重新连接',
                      icon: Link2Off,
                      disabled: true,
                    },
                  ]
                : paneMenuItems
          }
          title={
            menu.kind === 'node'
              ? menuNode?.data.label
              : menu.kind === 'edge'
                ? '连接'
                : '画布'
          }
          subtitle={
            menu.kind === 'node'
              ? menuNode
                ? getNodeDefinition(menuNode.data.defType).subtitle
                : undefined
              : menu.kind === 'edge'
                ? '点击 × 或按删除键移除'
                : '在工作流空白处操作'
          }
        />
      ) : null}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
