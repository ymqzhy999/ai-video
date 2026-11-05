import { create } from 'zustand';
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import type {
  AppSettings,
  ConfirmOptions,
  ExecutionLog,
  ExecutionRecord,
  ExecutionState,
  ImageAsset,
  NodeResult,
  NodeStatus,
  StudioEdge,
  StudioNode,
  StudioNodeData,
  ToastItem,
  UIState,
  WorkflowRecord,
} from '../types/studio';
import {
  NODE_DEF_MAP,
  getNodeDefinition,
  typesCompatible,
} from '../lib/nodeRegistry';
import {
  alignNodes,
  autoArrange,
  createGroupNode,
  createNode,
  dedupeEdges,
  getDownstreamNodeIds,
  getSelectionBounds,
  removeGroupNodes,
} from '../lib/graph';
import {
  createDefaultState,
  loadPersistedState,
  parseWorkflowJson,
  savePersistedState,
  clearPersistedState,
  makeWorkflowFile,
  type PersistedState,
} from '../lib/storage';
import { createBlankWorkflow } from '../data/sampleWorkflows';
import { clearExecutionCache, runExecution, type EngineOutcome, type RunTarget } from '../lib/execution';
import { deepClone, hashString, uid } from '../lib/id';
import { downloadText } from '../lib/format';
import { focusCanvasNode, screenCenterToFlow } from '../lib/flowBridge';

/* ------------------------------------------------------------------ *
 *  Internal helpers
 * ------------------------------------------------------------------ */

interface HistorySnapshot {
  nodes: StudioNode[];
  edges: StudioEdge[];
  workflowName: string;
}

interface CopyBuffer {
  nodes: StudioNode[];
  edges: StudioEdge[];
}

const initialExecution: ExecutionState = {
  status: 'idle',
  progress: 0,
  completed: 0,
  total: 0,
  mode: 'mock',
  logs: [],
  history: [],
  simulatedNodes: 0,
  liveNodes: 0,
};

const initialUI: UIState = {
  leftOpen: false,
  rightOpen: false,
  logsOpen: false,
  mobileMenuOpen: false,
  activeModal: null,
  canvasTool: 'select',
  rightTab: 'params',
  logTab: 'logs',
  searchOpen: false,
};

let activeController: AbortController | null = null;
let saveTimer: number | undefined;
let mutationRevision = 0;
let lastSavedRevision = 0;
let lastHistoryKey = '';
let lastHistoryAt = 0;

function resetRuntime(nodes: StudioNode[]): StudioNode[] {
  return nodes.map((node) => ({
    ...node,
    selected: false,
    data: {
      ...node.data,
      status: 'idle',
      result: undefined,
      error: undefined,
      durationMs: undefined,
      cached: undefined,
      simulated: undefined,
      progress: undefined,
    },
  }));
}

function resetEdges(edges: StudioEdge[]): StudioEdge[] {
  return edges.map((edge) => ({ ...edge, selected: false }));
}

function resetExecution(): ExecutionState {
  return {
    ...initialExecution,
    logs: [],
    history: [],
  };
}

function nowLog(
  level: ExecutionLog['level'],
  message: string,
  nodeId?: string,
): ExecutionLog {
  return { id: uid('log'), time: Date.now(), level, message, nodeId };
}

function pathExists(from: string, to: string, edges: StudioEdge[]): boolean {
  if (from === to) return true;
  const visited = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const current = queue.shift() as string;
    if (current === to) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    edges
      .filter((edge) => edge.source === current)
      .forEach((edge) => queue.push(edge.target));
  }
  return false;
}

function invalidateFrom(nodes: StudioNode[], edges: StudioEdge[], nodeId: string): StudioNode[] {
  const affected = getDownstreamNodeIds(nodeId, edges);
  return nodes.map((node) => {
    if (!affected.has(node.id)) return node;
    return {
      ...node,
      data: {
        ...node.data,
        status: 'idle',
        result: undefined,
        error: undefined,
        durationMs: undefined,
        cached: undefined,
        simulated: undefined,
        progress: undefined,
      },
    };
  });
}

function resetNodeData(node: StudioNode): StudioNode {
  return {
    ...node,
    selected: false,
    data: {
      ...node.data,
      status: 'idle',
      result: undefined,
      error: undefined,
      durationMs: undefined,
      cached: undefined,
      simulated: undefined,
      progress: undefined,
    },
  };
}

function resetWorkflowRuntime(workflow: WorkflowRecord): WorkflowRecord {
  return {
    ...workflow,
    nodes: workflow.nodes.map(resetNodeData),
    edges: resetEdges(workflow.edges),
  };
}

function buildStateSnapshot(state: StudioStore): PersistedState {
  return {
    version: 1,
    workflows: state.workflows,
    activeWorkflowId: state.activeWorkflowId,
    favoriteNodes: state.favoriteNodes,
    recentNodes: state.recentNodes,
    recentWorkflows: state.recentWorkflows,
    settings: state.settings,
    savedAt: Date.now(),
  };
}

function workflowFromCurrent(
  state: StudioStore,
  overrides: Partial<WorkflowRecord> = {},
): WorkflowRecord {
  const active =
    state.workflows.find((workflow) => workflow.id === state.activeWorkflowId) ??
    createBlankWorkflow(state.workflowName);
  return {
    ...active,
    name: state.workflowName,
    description: state.workflowDescription,
    category: state.workflowCategory,
    nodes: state.nodes,
    edges: state.edges,
    viewport: state.viewport,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function currentModeLabel(settings: AppSettings): string {
  if (settings.executionMode === 'mock') return '模拟模式';
  if (settings.executionMode === 'live') return '真实模式';
  return '自动模式';
}

/* ------------------------------------------------------------------ *
 *  Store contract
 * ------------------------------------------------------------------ */

interface StudioStore {
  hydrated: boolean;
  nodes: StudioNode[];
  edges: StudioEdge[];
  viewport: Viewport;
  activeWorkflowId: string;
  workflows: WorkflowRecord[];
  workflowName: string;
  workflowDescription: string;
  workflowCategory: string;
  favoriteNodes: string[];
  recentNodes: string[];
  recentWorkflows: string[];
  settings: AppSettings;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  copyBuffer: CopyBuffer | null;
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  saveState: 'saved' | 'dirty' | 'saving' | 'error';
  lastSavedAt: number;
  lastSaveError?: string;
  fitRequest: number;
  execution: ExecutionState;
  ui: UIState;
  toasts: ToastItem[];

  hydrate: () => Promise<void>;
  setSaveState: (state: 'saved' | 'dirty' | 'saving' | 'error', error?: string) => void;
  scheduleSave: () => void;
  saveCurrent: (options?: { quiet?: boolean }) => Promise<void>;
  flushSave: () => Promise<void>;
  clearAllData: () => Promise<void>;

  onNodesChange: (changes: NodeChange<StudioNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<StudioEdge>[]) => void;
  onNodeDragStart: () => void;
  onConnect: (connection: Connection) => void;
  onReconnect: (oldEdge: StudioEdge, connection: Connection) => void;
  validateConnection: (connection: Connection) => boolean;
  deleteEdge: (id: string) => void;

  addNode: (defType: string, position?: { x: number; y: number }) => string | null;
  addNodeAtCenter: (defType: string) => string | null;
  deleteSelected: () => void;
  deleteNodes: (ids: string[]) => void;
  disconnectNode: (id: string) => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  paste: () => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectNodes: (ids: string[]) => void;
  updateNodeParams: (id: string, patch: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeNote: (id: string, note: string) => void;
  toggleNodeCollapse: (id: string) => void;
  setNodeResult: (id: string, patch: Partial<StudioNodeData>) => void;
  toggleFavoriteNode: (type: string) => void;
  addRecentNode: (type: string) => void;

  groupSelected: () => void;
  ungroupSelected: () => void;
  alignSelected: (mode: Parameters<typeof alignNodes>[2]) => void;
  autoLayout: () => void;
  clearCanvas: () => void;

  undo: () => void;
  redo: () => void;
  checkpoint: () => void;

  runAll: () => Promise<void>;
  runNode: (id: string) => Promise<void>;
  runFrom: (id: string) => Promise<void>;
  stopRun: () => void;
  clearLogs: () => void;
  clearExecutionHistory: () => void;

  newWorkflow: () => Promise<void>;
  openWorkflow: (id: string) => Promise<void>;
  saveAs: (name: string) => Promise<void>;
  renameWorkflow: (id: string, name: string) => void;
  duplicateWorkflow: (id: string) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  toggleWorkflowFavorite: (id: string) => void;
  importWorkflowJson: (text: string) => Promise<{ ok: boolean; message: string; warnings: string[] }>;
  exportWorkflow: (id?: string) => void;
  setWorkflowMeta: (patch: Partial<Pick<WorkflowRecord, 'name' | 'description' | 'category'>>) => void;
  setViewport: (viewport: Viewport) => void;
  requestFit: () => void;

  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettings: () => void;

  setUI: (patch: Partial<UIState>) => void;
  openModal: (modal: UIState['activeModal']) => void;
  closeModal: () => void;
  askConfirm: (options: ConfirmOptions) => void;
  acceptConfirm: () => void;
  openNodeInspector: (id: string) => void;
  showLightbox: (asset?: ImageAsset) => void;
  toast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

/* ------------------------------------------------------------------ *
 *  Store implementation
 * ------------------------------------------------------------------ */

export const useStudioStore = create<StudioStore>((set, get) => ({
  hydrated: false,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 0.82 },
  activeWorkflowId: '',
  workflows: [],
  workflowName: 'Aurora / 电影感宇航员',
  workflowDescription: '',
  workflowCategory: '图像生成',
  favoriteNodes: [],
  recentNodes: [],
  recentWorkflows: [],
  settings: createDefaultState().settings,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  copyBuffer: null,
  past: [],
  future: [],
  saveState: 'saved',
  lastSavedAt: 0,
  fitRequest: 0,
  execution: resetExecution(),
  ui: initialUI,
  toasts: [],

  hydrate: async () => {
    if (get().hydrated) return;
    const persisted = await loadPersistedState();
    const fallback = createDefaultState();
    const state = persisted ?? fallback;
    const active =
      state.workflows.find((workflow) => workflow.id === state.activeWorkflowId) ??
      state.workflows[0];
    if (!active) {
      set({ hydrated: true });
      await get().newWorkflow();
      return;
    }
    const hydratedWorkflows = state.workflows.map((workflow) =>
      workflow.id === active.id ? { ...workflow, lastOpenedAt: Date.now() } : workflow,
    );
    set({
      hydrated: true,
      workflows: hydratedWorkflows,
      activeWorkflowId: active.id,
      nodes: resetRuntime(active.nodes),
      edges: resetEdges(active.edges),
      viewport: active.viewport ?? { x: 0, y: 0, zoom: 0.82 },
      workflowName: active.name,
      workflowDescription: active.description,
      workflowCategory: active.category,
      favoriteNodes: state.favoriteNodes,
      recentNodes: state.recentNodes,
      recentWorkflows: state.recentWorkflows,
      settings: state.settings,
      saveState: 'saved',
      lastSavedAt: state.savedAt,
      past: [],
      future: [],
      fitRequest: get().fitRequest + 1,
      execution: {
        ...resetExecution(),
        logs: [nowLog('info', `已载入「${active.name}」· ${currentModeLabel(state.settings)}`)],
      },
    });
  },

  setSaveState: (state, error) => set({ saveState: state, lastSaveError: error }),

  scheduleSave: () => {
    const { settings } = get();
    mutationRevision += 1;
    set({ saveState: 'dirty' });
    if (!settings.autoSave) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void get().saveCurrent({ quiet: true });
    }, 950);
  },

  saveCurrent: async (options = {}) => {
    const state = get();
    if (!state.hydrated) return;
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    const capturedRevision = mutationRevision;
    const activeRecord = workflowFromCurrent(state);
    const workflows = state.workflows.some((workflow) => workflow.id === activeRecord.id)
      ? state.workflows.map((workflow) =>
          workflow.id === activeRecord.id ? activeRecord : workflow,
        )
      : [activeRecord, ...state.workflows];
    set({
      workflows,
      saveState: 'saving',
      lastSaveError: undefined,
    });
    const persisted = buildStateSnapshot({ ...get(), workflows });
    const result = await savePersistedState(persisted);
    if (result.ok) {
      lastSavedRevision = capturedRevision;
      if (mutationRevision === capturedRevision) {
        set({ saveState: 'saved', lastSavedAt: Date.now() });
      } else {
        set({ saveState: 'dirty' });
        if (get().settings.autoSave) {
          saveTimer = window.setTimeout(() => {
            void get().saveCurrent({ quiet: true });
          }, 650);
        }
      }
      if (!options.quiet) get().toast({ type: 'success', title: '工作流已保存' });
    } else {
      set({ saveState: 'error', lastSaveError: result.error });
      get().toast({
        type: 'error',
        title: '保存失败',
        description: result.error ?? '请检查本地存储空间。',
      });
    }
  },

  flushSave: async () => {
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    if (mutationRevision !== lastSavedRevision || get().saveState === 'dirty') {
      await get().saveCurrent({ quiet: true });
    }
  },

  clearAllData: async () => {
    await clearPersistedState();
    clearExecutionCache();
    const defaults = createDefaultState();
    const active = defaults.workflows[0];
    set({
      workflows: defaults.workflows,
      activeWorkflowId: active.id,
      nodes: resetRuntime(active.nodes),
      edges: resetEdges(active.edges),
      workflowName: active.name,
      workflowDescription: active.description,
      workflowCategory: active.category,
      favoriteNodes: defaults.favoriteNodes,
      recentNodes: defaults.recentNodes,
      recentWorkflows: defaults.recentWorkflows,
      settings: defaults.settings,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      past: [],
      future: [],
      saveState: 'saved',
      fitRequest: get().fitRequest + 1,
      execution: resetExecution(),
      ui: { ...initialUI },
    });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
    get().toast({ type: 'success', title: '本地数据已重置' });
  },

  /* ----------------------- graph change handlers ----------------------- */

  onNodesChange: (changes) => {
    if (!changes.length) return;
    let nextNodes = applyNodeChanges(changes, get().nodes);
    let nextEdges = get().edges;
    const removedIds = changes
      .filter((change): change is NodeChange<StudioNode> & { type: 'remove'; id: string } => change.type === 'remove')
      .map((change) => change.id);
    if (removedIds.length) {
      nextEdges = nextEdges.filter(
        (edge) => !removedIds.includes(edge.source) && !removedIds.includes(edge.target),
      );
    }
    const selectedNodeIds = nextNodes.filter((node) => node.selected).map((node) => node.id);
    const selectedEdgeIds = nextEdges.filter((edge) => edge.selected).map((edge) => edge.id);
    set({ nodes: nextNodes, edges: nextEdges, selectedNodeIds, selectedEdgeIds });
    const contentChanged = changes.some(
      (change) => change.type === 'position' || change.type === 'remove' || change.type === 'add',
    );
    if (contentChanged) get().scheduleSave();
  },

  onEdgesChange: (changes) => {
    if (!changes.length) return;
    const nextEdges = applyEdgeChanges(changes, get().edges);
    const selectedEdgeIds = nextEdges.filter((edge) => edge.selected).map((edge) => edge.id);
    const selectedNodeIds = get().nodes.filter((node) => node.selected).map((node) => node.id);
    set({ edges: nextEdges, selectedEdgeIds, selectedNodeIds });
    if (changes.some((change) => change.type === 'remove')) get().scheduleSave();
  },

  onNodeDragStart: () => {
    get().checkpoint();
  },

  onConnect: (connection) => {
    const state = get();
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) {
      get().toast({ type: 'error', title: '无法连接节点到自身' });
      return;
    }
    const sourceNode = state.nodes.find((node) => node.id === connection.source);
    const targetNode = state.nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;
    const sourcePort = getNodeDefinition(sourceNode.data.defType).outputs.find(
      (port) => port.id === connection.sourceHandle,
    );
    const targetPort = getNodeDefinition(targetNode.data.defType).inputs.find(
      (port) => port.id === connection.targetHandle,
    );
    if (!sourcePort || !targetPort) {
      get().toast({ type: 'error', title: '端口不存在', description: '请刷新页面后重试。' });
      return;
    }
    if (!typesCompatible(sourcePort.type, targetPort.type)) {
      get().toast({
        type: 'error',
        title: '数据类型不兼容',
        description: `${sourcePort.type} 不能连接到 ${targetPort.type}。`,
      });
      return;
    }
    if (pathExists(connection.target, connection.source, state.edges)) {
      get().toast({
        type: 'error',
        title: '连接会形成循环',
        description: '工作流必须保持有向无环图。',
      });
      return;
    }
    get().checkpoint();
    const existing = state.edges.filter(
      (edge) =>
        edge.target === connection.target && edge.targetHandle === connection.targetHandle,
    );
    const nextEdges = dedupeEdges([
      ...state.edges.filter(
        (edge) =>
          !(edge.target === connection.target && edge.targetHandle === connection.targetHandle),
      ),
      {
        id: uid('edge'),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
        type: 'studioEdge',
        data: {
          dataType: sourcePort.type,
          sourcePort: sourcePort.id,
          targetPort: targetPort.id,
        },
      },
    ]);
    const nextNodes = invalidateFrom(state.nodes, nextEdges, connection.target);
    set({ edges: nextEdges, nodes: nextNodes, selectedEdgeIds: [] });
    get().scheduleSave();
    get().toast({
      type: 'success',
      title: '连接已建立',
      description:
        existing.length > 0
          ? `${sourcePort.label} → ${targetPort.label}（已替换原有连接）`
          : `${sourcePort.type} → ${targetPort.type}`,
    });
  },

  validateConnection: (connection) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;
    const state = get();
    const sourceNode = state.nodes.find((node) => node.id === connection.source);
    const targetNode = state.nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return false;
    const sourcePort = getNodeDefinition(sourceNode.data.defType).outputs.find(
      (port) => port.id === connection.sourceHandle,
    );
    const targetPort = getNodeDefinition(targetNode.data.defType).inputs.find(
      (port) => port.id === connection.targetHandle,
    );
    if (!sourcePort || !targetPort) return false;
    if (!typesCompatible(sourcePort.type, targetPort.type)) return false;
    return !pathExists(connection.target, connection.source, state.edges);
  },

  deleteEdge: (id) => {
    const state = get();
    const edge = state.edges.find((candidate) => candidate.id === id);
    if (!edge) return;
    get().checkpoint();
    const nextEdges = state.edges.filter((candidate) => candidate.id !== id);
    set({
      edges: nextEdges,
      nodes: invalidateFrom(state.nodes, nextEdges, edge.target),
      selectedEdgeIds: [],
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: '连接已删除' });
  },

  onReconnect: (oldEdge, connection) => {
    if (!connection.source || !connection.target) return;
    const state = get();
    if (connection.source === connection.target) {
      get().toast({ type: 'error', title: '无法连接节点到自身' });
      return;
    }
    const sourceNode = state.nodes.find((node) => node.id === connection.source);
    const targetNode = state.nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;
    const sourcePort = getNodeDefinition(sourceNode.data.defType).outputs.find(
      (port) => port.id === connection.sourceHandle,
    );
    const targetPort = getNodeDefinition(targetNode.data.defType).inputs.find(
      (port) => port.id === connection.targetHandle,
    );
    if (!sourcePort || !targetPort || !typesCompatible(sourcePort.type, targetPort.type)) {
      get().toast({ type: 'error', title: '重新连接失败', description: '端口类型不兼容。' });
      return;
    }
    const withoutOld = state.edges.filter((edge) => edge.id !== oldEdge.id);
    if (pathExists(connection.target, connection.source, withoutOld)) {
      get().toast({ type: 'error', title: '重新连接会形成循环' });
      return;
    }
    get().checkpoint();
    const nextEdge: StudioEdge = {
      ...oldEdge,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
      data: {
        dataType: sourcePort.type,
        sourcePort: sourcePort.id,
        targetPort: targetPort.id,
      },
    };
    const occupied = withoutOld.filter(
      (edge) =>
        edge.target === connection.target && edge.targetHandle === connection.targetHandle,
    );
    const nextEdges = [...withoutOld.filter((edge) => !occupied.includes(edge)), nextEdge];
    const nextNodes = invalidateFrom(state.nodes, nextEdges, connection.target);
    set({ edges: nextEdges, nodes: nextNodes });
    get().scheduleSave();
    get().toast({ type: 'success', title: '连接已更新' });
  },

  /* ----------------------------- nodes ------------------------------ */

  addNode: (defType, position) => {
    if (!NODE_DEF_MAP[defType]) {
      get().toast({ type: 'error', title: '未知节点类型' });
      return null;
    }
    const definition = getNodeDefinition(defType);
    const center = position ?? screenCenterToFlow();
    const count = get().nodes.filter((node) => node.data.defType === defType).length;
    const node = createNode(defType, {
      x: Math.round(center.x - (definition.width ?? 236) / 2 + count * 18),
      y: Math.round(center.y - 70 + count * 18),
    });
    get().checkpoint();
    set({
      nodes: [...get().nodes, node],
      selectedNodeIds: [node.id],
      selectedEdgeIds: [],
      recentNodes: [defType, ...get().recentNodes.filter((type) => type !== defType)].slice(0, 8),
      ui: {
        ...get().ui,
        rightTab: 'params',
        rightOpen: !window.matchMedia('(max-width: 980px)').matches,
      },
    });
    get().scheduleSave();
    get().toast({ type: 'info', title: `已添加「${definition.title}」` });
    return node.id;
  },

  addNodeAtCenter: (defType) => get().addNode(defType, screenCenterToFlow()),

  deleteSelected: () => {
    const { selectedNodeIds, selectedEdgeIds } = get();
    if (!selectedNodeIds.length && !selectedEdgeIds.length) {
      get().toast({ type: 'info', title: '没有选中的节点或连接' });
      return;
    }
    get().checkpoint();
    const states = get();
    const groups = states.nodes
      .filter((node) => selectedNodeIds.includes(node.id) && node.data.defType === 'group')
      .map((node) => node.id);
    const directIds = selectedNodeIds.filter((id) => !groups.includes(id));
    let nextNodes = states.nodes.filter(
      (node) => !directIds.includes(node.id) && !groups.includes(node.id),
    );
    if (groups.length) {
      nextNodes = removeGroupNodes(states.nodes, groups).filter(
        (node) => !directIds.includes(node.id),
      );
    }
    const removedIds = new Set([...directIds, ...groups]);
    const nextEdges = states.edges.filter(
      (edge) =>
        !removedIds.has(edge.source) &&
        !removedIds.has(edge.target) &&
        !selectedEdgeIds.includes(edge.id),
    );
    set({
      nodes: nextNodes,
      edges: nextEdges,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      ui: { ...states.ui, rightOpen: false },
    });
    get().scheduleSave();
    get().toast({
      type: 'success',
      title: '已删除',
      description: `${selectedNodeIds.length} 个节点 · ${states.edges.length - nextEdges.length} 条连接`,
    });
  },

  deleteNodes: (ids) => {
    if (!ids.length) return;
    get().checkpoint();
    const state = get();
    const groups = state.nodes
      .filter((node) => ids.includes(node.id) && node.data.defType === 'group')
      .map((node) => node.id);
    const nextNodes = groups.length
      ? removeGroupNodes(state.nodes, groups).filter(
          (node) => !ids.includes(node.id) || groups.includes(node.id),
        )
      : state.nodes.filter((node) => !ids.includes(node.id));
    const removed = new Set(ids);
    const nextEdges = state.edges.filter(
      (edge) => !removed.has(edge.source) && !removed.has(edge.target),
    );
    set({
      nodes: nextNodes,
      edges: nextEdges,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      ui: { ...state.ui, rightOpen: false },
    });
    get().scheduleSave();
  },

  disconnectNode: (id) => {
    const state = get();
    const nextEdges = state.edges.filter((edge) => edge.source !== id && edge.target !== id);
    if (nextEdges.length === state.edges.length) {
      get().toast({ type: 'info', title: '该节点没有连接' });
      return;
    }
    get().checkpoint();
    set({
      edges: nextEdges,
      nodes: invalidateFrom(state.nodes, nextEdges, id),
      selectedEdgeIds: [],
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: '已断开所有连接' });
  },

  duplicateSelected: () => {
    const state = get();
    if (!state.selectedNodeIds.length) {
      get().toast({ type: 'info', title: '请先选择节点' });
      return;
    }
    get().checkpoint();
    const idMap = new Map<string, string>();
    state.selectedNodeIds.forEach((id) => idMap.set(id, uid('node')));
    const newNodes = state.nodes
      .filter((node) => idMap.has(node.id))
      .map((node) => ({
        ...resetNodeData(node),
        id: idMap.get(node.id) as string,
        position: { x: node.position.x + 36, y: node.position.y + 36 },
        parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : undefined,
        extent: node.parentId && idMap.has(node.parentId) ? ('parent' as const) : undefined,
        data: {
          ...deepClone(node.data),
          status: 'idle' as const,
          result: undefined,
          error: undefined,
          durationMs: undefined,
          cached: undefined,
          simulated: undefined,
        },
        selected: true,
      }));
    const newEdges = state.edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: uid('edge'),
        source: idMap.get(edge.source) as string,
        target: idMap.get(edge.target) as string,
        selected: false,
      }));
    set({
      nodes: [
        ...state.nodes.map((node) => ({ ...node, selected: false })),
        ...newNodes,
      ],
      edges: [...state.edges.map((edge) => ({ ...edge, selected: false })), ...newEdges],
      selectedNodeIds: newNodes.map((node) => node.id),
      selectedEdgeIds: [],
      ui: { ...state.ui, rightOpen: true },
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: `已复制 ${newNodes.length} 个节点` });
  },

  copySelected: () => {
    const state = get();
    if (!state.selectedNodeIds.length) {
      get().toast({ type: 'info', title: '请先选择要复制的节点' });
      return;
    }
    const selected = new Set(state.selectedNodeIds);
    set({
      copyBuffer: {
        nodes: deepClone(state.nodes.filter((node) => selected.has(node.id))),
        edges: deepClone(
          state.edges.filter(
            (edge) => selected.has(edge.source) && selected.has(edge.target),
          ),
        ),
      },
    });
    get().toast({ type: 'success', title: `已复制 ${selected.size} 个节点` });
  },

  paste: () => {
    const state = get();
    if (!state.copyBuffer?.nodes.length) {
      get().toast({ type: 'info', title: '剪贴板为空', description: '先选择节点并复制。' });
      return;
    }
    get().checkpoint();
    const idMap = new Map<string, string>();
    state.copyBuffer.nodes.forEach((node) => idMap.set(node.id, uid('node')));
    const newNodes = state.copyBuffer.nodes.map((node) => ({
      ...resetNodeData(node),
      id: idMap.get(node.id) as string,
      position: { x: node.position.x + 44, y: node.position.y + 44 },
      parentId: node.parentId && idMap.has(node.parentId) ? idMap.get(node.parentId) : undefined,
      extent: node.parentId && idMap.has(node.parentId) ? ('parent' as const) : undefined,
      data: {
        ...deepClone(node.data),
        status: 'idle' as const,
        result: undefined,
        error: undefined,
        durationMs: undefined,
        cached: undefined,
        simulated: undefined,
      },
      selected: true,
    }));
    const newEdges = state.copyBuffer.edges.map((edge) => ({
      ...edge,
      id: uid('edge'),
      source: idMap.get(edge.source) as string,
      target: idMap.get(edge.target) as string,
      selected: false,
    }));
    set({
      nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), ...newNodes],
      edges: [...state.edges.map((edge) => ({ ...edge, selected: false })), ...newEdges],
      selectedNodeIds: newNodes.map((node) => node.id),
      selectedEdgeIds: [],
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: `已粘贴 ${newNodes.length} 个节点` });
  },

  selectAll: () => {
    const state = get();
    set({
      nodes: state.nodes.map((node) => ({ ...node, selected: true })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: state.nodes.map((node) => node.id),
      selectedEdgeIds: [],
    });
  },

  clearSelection: () => {
    const state = get();
    set({
      nodes: state.nodes.map((node) => ({ ...node, selected: false })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
  },

  selectNodes: (ids) => {
    const state = get();
    const idSet = new Set(ids);
    set({
      nodes: state.nodes.map((node) => ({ ...node, selected: idSet.has(node.id) })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: ids,
      selectedEdgeIds: [],
    });
  },

  updateNodeParams: (id, patch) => {
    const state = get();
    const node = state.nodes.find((candidate) => candidate.id === id);
    if (!node) return;
    if (!lastHistoryKey.startsWith('params') || lastHistoryKey !== `params:${id}` || Date.now() - lastHistoryAt > 1200) {
      get().checkpoint();
      lastHistoryKey = `params:${id}`;
      lastHistoryAt = Date.now();
    }
    let nextParams = { ...node.data.params, ...patch };
    if (node.data.defType === 'dimensions' && typeof patch.preset === 'string' && patch.preset !== 'custom') {
      const [width, height] = patch.preset.split('x').map(Number);
      if (width && height) nextParams = { ...nextParams, width, height };
    }
    const nextNodes = state.nodes.map((candidate) =>
      candidate.id === id
        ? {
            ...candidate,
            data: { ...candidate.data, params: nextParams, error: undefined },
          }
        : candidate,
    );
    set({ nodes: invalidateFrom(nextNodes, state.edges, id) });
    get().scheduleSave();
  },

  updateNodeLabel: (id, label) => {
    const state = get();
    if (lastHistoryKey !== `label:${id}` || Date.now() - lastHistoryAt > 1200) {
      get().checkpoint();
      lastHistoryKey = `label:${id}`;
      lastHistoryAt = Date.now();
    }
    set({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, label } } : node,
      ),
    });
    get().scheduleSave();
  },

  updateNodeNote: (id, note) => {
    const state = get();
    if (lastHistoryKey !== `note:${id}` || Date.now() - lastHistoryAt > 1200) {
      get().checkpoint();
      lastHistoryKey = `note:${id}`;
      lastHistoryAt = Date.now();
    }
    set({
      nodes: state.nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, note } } : node,
      ),
    });
    get().scheduleSave();
  },

  toggleNodeCollapse: (id) => {
    const state = get();
    set({
      nodes: state.nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, collapsed: !node.data.collapsed } }
          : node,
      ),
    });
    get().scheduleSave();
  },

  setNodeResult: (id, patch) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    });
  },

  toggleFavoriteNode: (type) => {
    if (!NODE_DEF_MAP[type]) return;
    const favorites = get().favoriteNodes;
    const exists = favorites.includes(type);
    set({
      favoriteNodes: exists
        ? favorites.filter((item) => item !== type)
        : [type, ...favorites].slice(0, 20),
    });
    get().scheduleSave();
    get().toast({
      type: exists ? 'info' : 'success',
      title: exists ? '已取消收藏' : '已收藏节点',
      description: getNodeDefinition(type).title,
    });
  },

  addRecentNode: (type) => {
    if (!NODE_DEF_MAP[type]) return;
    const recent = [type, ...get().recentNodes.filter((item) => item !== type)].slice(0, 8);
    set({ recentNodes: recent });
  },

  /* ----------------------------- groups ----------------------------- */

  groupSelected: () => {
    const state = get();
    const selected = state.nodes.filter(
      (node) => state.selectedNodeIds.includes(node.id) && node.data.defType !== 'group',
    );
    if (selected.length < 2) {
      get().toast({ type: 'info', title: '至少选择两个节点才能分组' });
      return;
    }
    if (selected.some((node) => node.parentId)) {
      get().toast({ type: 'warning', title: '暂不支持嵌套分组', description: '请先取消原有分组。' });
      return;
    }
    get().checkpoint();
    const bounds = getSelectionBounds(state.nodes, selected.map((node) => node.id));
    if (!bounds) return;
    const group = createGroupNode(
      {
        x: bounds.x - 24,
        y: bounds.y - 60,
        width: bounds.width + 48,
        height: bounds.height + 84,
      },
      `分组 · ${selected.length} 个节点`,
    );
    const selectedIds = new Set(selected.map((node) => node.id));
    const nextNodes = state.nodes.map((node) => {
      if (!selectedIds.has(node.id)) return { ...node, selected: false };
      return {
        ...node,
        parentId: group.id,
        extent: 'parent' as const,
        position: {
          x: node.position.x - group.position.x,
          y: node.position.y - group.position.y,
        },
        selected: false,
        zIndex: 1,
      };
    });
    set({
      nodes: [group, ...nextNodes],
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNodeIds: [group.id],
      selectedEdgeIds: [],
      ui: { ...state.ui, rightOpen: true },
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: '已创建分组', description: '拖动分组标题可整体移动。' });
  },

  ungroupSelected: () => {
    const state = get();
    const groups = state.nodes.filter(
      (node) => state.selectedNodeIds.includes(node.id) && node.data.defType === 'group',
    );
    if (!groups.length) {
      get().toast({ type: 'info', title: '请选择一个分组' });
      return;
    }
    get().checkpoint();
    const groupIds = groups.map((group) => group.id);
    const promotedIds = state.nodes
      .filter((node) => node.parentId && groupIds.includes(node.parentId))
      .map((node) => node.id);
    const nextNodes = removeGroupNodes(state.nodes, groupIds);
    set({
      nodes: nextNodes,
      selectedNodeIds: promotedIds,
      selectedEdgeIds: [],
      ui: { ...state.ui, rightOpen: promotedIds.length === 1 },
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: '已取消分组' });
  },

  alignSelected: (mode) => {
    const state = get();
    if (state.selectedNodeIds.length < 2) {
      get().toast({ type: 'info', title: '至少选择两个节点才能对齐' });
      return;
    }
    get().checkpoint();
    set({
      nodes: alignNodes(state.nodes, state.selectedNodeIds, mode),
    });
    get().scheduleSave();
  },

  autoLayout: () => {
    const state = get();
    if (!state.nodes.length) return;
    get().checkpoint();
    const arranged = autoArrange(state.nodes, state.edges);
    set({
      nodes: arranged.nodes,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      fitRequest: state.fitRequest + 1,
      ui: { ...state.ui, rightOpen: false },
    });
    get().scheduleSave();
    get().toast({
      type: 'success',
      title: '已自动排列',
      description: arranged.groupsRemoved
        ? `按依赖关系布局，并解散了 ${arranged.groupsRemoved} 个分组。`
        : '按依赖关系分层布局。',
    });
  },

  clearCanvas: () => {
    const state = get();
    get().checkpoint();
    set({
      nodes: [],
      edges: [],
      selectedNodeIds: [],
      selectedEdgeIds: [],
      execution: resetExecution(),
      ui: { ...state.ui, rightOpen: false },
    });
    get().scheduleSave();
    get().toast({ type: 'success', title: '画布已清空' });
  },

  /* ---------------------------- history ----------------------------- */

  checkpoint: () => {
    const state = get();
    if (!state.hydrated) return;
    const snapshot: HistorySnapshot = {
      nodes: deepClone(state.nodes),
      edges: deepClone(state.edges),
      workflowName: state.workflowName,
    };
    set({
      past: [...state.past, snapshot].slice(-50),
      future: [],
    });
    lastHistoryKey = '';
    lastHistoryAt = 0;
  },

  undo: () => {
    const state = get();
    if (!state.past.length) {
      get().toast({ type: 'info', title: '没有可撤销的操作' });
      return;
    }
    const previous = state.past[state.past.length - 1];
    const current: HistorySnapshot = {
      nodes: deepClone(state.nodes),
      edges: deepClone(state.edges),
      workflowName: state.workflowName,
    };
    set({
      past: state.past.slice(0, -1),
      future: [current, ...state.future].slice(0, 50),
      nodes: previous.nodes,
      edges: previous.edges,
      workflowName: previous.workflowName,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      ui: { ...state.ui, rightOpen: false },
    });
    get().scheduleSave();
    get().toast({ type: 'info', title: '已撤销' });
  },

  redo: () => {
    const state = get();
    if (!state.future.length) {
      get().toast({ type: 'info', title: '没有可重做的操作' });
      return;
    }
    const next = state.future[0];
    const current: HistorySnapshot = {
      nodes: deepClone(state.nodes),
      edges: deepClone(state.edges),
      workflowName: state.workflowName,
    };
    set({
      future: state.future.slice(1),
      past: [...state.past, current].slice(-50),
      nodes: next.nodes,
      edges: next.edges,
      workflowName: next.workflowName,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      ui: { ...state.ui, rightOpen: false },
    });
    get().scheduleSave();
    get().toast({ type: 'info', title: '已重做' });
  },

  /* --------------------------- execution ---------------------------- */

  runAll: async () => {
    await runTarget({ kind: 'all' });
  },

  runNode: async (id) => {
    await runTarget({ kind: 'node', nodeId: id });
  },

  runFrom: async (id) => {
    await runTarget({ kind: 'from', nodeId: id });
  },

  stopRun: () => {
    if (!activeController) return;
    activeController.abort();
    set({
      execution: {
        ...get().execution,
        stopping: true,
        logs: [...get().execution.logs, nowLog('warn', '收到停止指令，正在中断…')].slice(-500),
      },
    });
  },

  clearLogs: () => {
    set({ execution: { ...get().execution, logs: [] } });
  },

  clearExecutionHistory: () => {
    set({ execution: { ...get().execution, history: [] } });
  },

  /* --------------------------- workflows ---------------------------- */

  newWorkflow: async () => {
    if (activeController) {
      get().toast({ type: 'info', title: '请先停止执行', description: '执行期间不能切换或修改工作流列表。' });
      return;
    }
    if (get().hydrated) await get().saveCurrent({ quiet: true });
    const blank = createBlankWorkflow(`未命名工作流 ${get().workflows.length + 1}`);
    set({
      workflows: [blank, ...get().workflows],
      activeWorkflowId: blank.id,
      nodes: [],
      edges: [],
      workflowName: blank.name,
      workflowDescription: blank.description,
      workflowCategory: blank.category,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      viewport: { x: 0, y: 0, zoom: 0.9 },
      past: [],
      future: [],
      execution: resetExecution(),
      recentWorkflows: [blank.id, ...get().recentWorkflows.filter((id) => id !== blank.id)].slice(0, 8),
      ui: {
        ...initialUI,
        activeModal: null,
      },
      fitRequest: get().fitRequest + 1,
    });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
    get().toast({ type: 'success', title: '已创建工作流', description: blank.name });
  },

  openWorkflow: async (id) => {
    if (activeController) {
      get().toast({ type: 'info', title: '请先停止执行', description: '执行期间不能切换或修改工作流列表。' });
      return;
    }
    if (get().activeWorkflowId === id) {
      set({ ui: { ...get().ui, activeModal: null }, fitRequest: get().fitRequest + 1 });
      return;
    }
    if (get().hydrated) await get().saveCurrent({ quiet: true });
    const state = get();
    const workflow = state.workflows.find((item) => item.id === id);
    if (!workflow) {
      get().toast({ type: 'error', title: '工作流不存在' });
      return;
    }
    const reset = resetWorkflowRuntime(workflow);
    clearExecutionCache();
    set({
      activeWorkflowId: workflow.id,
      nodes: resetRuntime(reset.nodes),
      edges: resetEdges(reset.edges),
      workflowName: workflow.name,
      workflowDescription: workflow.description,
      workflowCategory: workflow.category,
      viewport: workflow.viewport ?? { x: 0, y: 0, zoom: 0.82 },
      selectedNodeIds: [],
      selectedEdgeIds: [],
      past: [],
      future: [],
      execution: {
        ...resetExecution(),
        logs: [nowLog('info', `已打开「${workflow.name}」`)],
      },
      recentWorkflows: [workflow.id, ...state.recentWorkflows.filter((item) => item !== workflow.id)].slice(0, 8),
      ui: { ...state.ui, activeModal: null, rightOpen: false, leftOpen: false },
      fitRequest: state.fitRequest + 1,
      saveState: 'saved',
    });
    const updatedWorkflows = get().workflows.map((item) =>
      item.id === workflow.id ? { ...item, lastOpenedAt: Date.now() } : item,
    );
    set({ workflows: updatedWorkflows });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
  },

  saveAs: async (name) => {
    if (activeController) {
      get().toast({ type: 'info', title: '请先停止执行', description: '执行期间不能切换或修改工作流列表。' });
      return;
    }
    const state = get();
    const cleanName = name.trim() || '未命名工作流';
    const source = workflowFromCurrent(state, { name: cleanName });
    const copy: WorkflowRecord = {
      ...source,
      id: uid('wf'),
      name: cleanName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite: false,
      nodes: deepClone(state.nodes).map(resetNodeData),
      edges: deepClone(state.edges),
    };
    set({
      workflows: [copy, ...state.workflows],
      activeWorkflowId: copy.id,
      workflowName: cleanName,
      workflowDescription: copy.description,
      workflowCategory: copy.category,
      saveState: 'saved',
      past: [],
      future: [],
      recentWorkflows: [copy.id, ...state.recentWorkflows].slice(0, 8),
      ui: { ...state.ui, activeModal: null },
    });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
    get().toast({ type: 'success', title: '已另存为', description: cleanName });
  },

  renameWorkflow: (id, name) => {
    const cleanName = name.trim() || '未命名工作流';
    const state = get();
    set({
      workflows: state.workflows.map((workflow) =>
        workflow.id === id ? { ...workflow, name: cleanName, updatedAt: Date.now() } : workflow,
      ),
      ...(state.activeWorkflowId === id ? { workflowName: cleanName } : {}),
    });
    get().scheduleSave();
  },

  duplicateWorkflow: async (id) => {
    if (activeController) {
      get().toast({ type: 'info', title: '请先停止执行', description: '执行期间不能切换或修改工作流列表。' });
      return;
    }
    if (get().activeWorkflowId === id) await get().saveCurrent({ quiet: true });
    const state = get();
    const source = state.workflows.find((workflow) => workflow.id === id);
    if (!source) return;
    const copy: WorkflowRecord = {
      ...source,
      id: uid('wf'),
      name: `${source.name} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastOpenedAt: Date.now(),
      favorite: false,
      nodes: deepClone(source.nodes).map(resetNodeData),
      edges: deepClone(source.edges).map((edge) => ({ ...edge, selected: false })),
    };
    set({
      workflows: [copy, ...state.workflows],
    });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
    get().toast({ type: 'success', title: '工作流已复制', description: copy.name });
  },

  deleteWorkflow: async (id) => {
    if (activeController) {
      get().toast({ type: 'info', title: '请先停止执行', description: '执行期间不能切换或修改工作流列表。' });
      return;
    }
    const state = get();
    const target = state.workflows.find((workflow) => workflow.id === id);
    if (!target) return;
    let remaining = state.workflows.filter((workflow) => workflow.id !== id);
    let nextActiveId = state.activeWorkflowId;
    if (state.activeWorkflowId === id) {
      if (!remaining.length) {
        const blank = createBlankWorkflow('未命名工作流');
        remaining = [blank];
        nextActiveId = blank.id;
      } else {
        nextActiveId = remaining[0].id;
      }
    }
    const nextWorkflow = remaining.find((workflow) => workflow.id === nextActiveId) ?? remaining[0];
    const reset = resetWorkflowRuntime(nextWorkflow);
    set({
      workflows: remaining,
      activeWorkflowId: nextWorkflow.id,
      nodes: resetRuntime(reset.nodes),
      edges: resetEdges(reset.edges),
      workflowName: nextWorkflow.name,
      workflowDescription: nextWorkflow.description,
      workflowCategory: nextWorkflow.category,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      past: [],
      future: [],
      recentWorkflows: state.recentWorkflows.filter((item) => item !== id),
      execution: resetExecution(),
      fitRequest: state.fitRequest + 1,
      ui: { ...state.ui, activeModal: null },
    });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
    get().toast({ type: 'success', title: '工作流已删除', description: target.name });
  },

  toggleWorkflowFavorite: (id) => {
    set({
      workflows: get().workflows.map((workflow) =>
        workflow.id === id ? { ...workflow, favorite: !workflow.favorite } : workflow,
      ),
    });
    get().scheduleSave();
  },

  importWorkflowJson: async (text) => {
    if (activeController) {
      get().toast({ type: 'info', title: '请先停止执行', description: '执行期间不能切换或修改工作流列表。' });
      return { ok: false, message: '请先停止当前执行。', warnings: [] };
    }
    const parsed = parseWorkflowJson(text);
    if (!parsed.workflow) {
      return { ok: false, message: parsed.error ?? '导入失败。', warnings: [] };
    }
    const imported: WorkflowRecord = {
      ...parsed.workflow,
      name: `${parsed.workflow.name}${parsed.workflow.name.includes('（导入）') ? '' : '（导入）'}`,
      category: parsed.workflow.category || '导入',
      lastOpenedAt: Date.now(),
      nodes: resetRuntime(parsed.workflow.nodes),
      edges: resetEdges(parsed.workflow.edges),
    };
    const state = get();
    set({
      workflows: [imported, ...state.workflows],
      activeWorkflowId: imported.id,
      nodes: imported.nodes,
      edges: imported.edges,
      workflowName: imported.name,
      workflowDescription: imported.description,
      workflowCategory: imported.category,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      past: [],
      future: [],
      execution: resetExecution(),
      recentWorkflows: [imported.id, ...state.recentWorkflows].slice(0, 8),
      fitRequest: state.fitRequest + 1,
      ui: { ...state.ui, activeModal: null },
    });
    mutationRevision += 1;
    await get().saveCurrent({ quiet: true });
    get().toast({
      type: 'success',
      title: '工作流已导入',
      description: parsed.warnings[0] ?? `${imported.nodes.length} 个节点`,
    });
    return { ok: true, message: '导入成功', warnings: parsed.warnings };
  },

  exportWorkflow: (id) => {
    const state = get();
    const workflow =
      id && id !== state.activeWorkflowId
        ? state.workflows.find((item) => item.id === id)
        : workflowFromCurrent(state);
    if (!workflow) return;
    const file = makeWorkflowFile({
      ...workflow,
      nodes: id && id !== state.activeWorkflowId ? workflow.nodes : state.nodes,
      edges: id && id !== state.activeWorkflowId ? workflow.edges : state.edges,
    });
    downloadText(
      JSON.stringify(file, null, 2),
      `${workflow.name.replace(/[\\/:*?"<>|]+/g, '-')}.json`,
    );
    get().toast({ type: 'success', title: '已导出 JSON', description: workflow.name });
  },

  setWorkflowMeta: (patch) => {
    set((state) => ({
      workflowName: patch.name !== undefined ? patch.name : state.workflowName,
      workflowDescription:
        patch.description !== undefined ? patch.description : state.workflowDescription,
      workflowCategory:
        patch.category !== undefined ? patch.category : state.workflowCategory,
    }));
    get().scheduleSave();
  },

  setViewport: (viewport) => {
    set({ viewport });
    get().scheduleSave();
  },

  requestFit: () => set({ fitRequest: get().fitRequest + 1 }),

  /* ---------------------------- settings ---------------------------- */

  updateSettings: (patch) => {
    set({ settings: { ...get().settings, ...patch } });
    get().scheduleSave();
  },

  resetSettings: () => {
    set({ settings: { ...createDefaultState().settings } });
    get().scheduleSave();
    get().toast({ type: 'success', title: '设置已恢复默认' });
  },

  /* ------------------------------- UI ------------------------------- */

  setUI: (patch) => set({ ui: { ...get().ui, ...patch } }),
  openModal: (modal) => set({ ui: { ...get().ui, activeModal: modal } }),
  closeModal: () => set({ ui: { ...get().ui, activeModal: null, confirm: undefined } }),
  askConfirm: (options) =>
    set({ ui: { ...get().ui, activeModal: 'confirm', confirm: options } }),
  acceptConfirm: () => {
    const confirm = get().ui.confirm;
    set({ ui: { ...get().ui, activeModal: null, confirm: undefined } });
    confirm?.onConfirm();
  },
  openNodeInspector: (id) => {
    set({
      selectedNodeIds: [id],
      selectedEdgeIds: [],
      ui: { ...get().ui, rightOpen: true, rightTab: 'params' },
      nodes: get().nodes.map((node) => ({ ...node, selected: node.id === id })),
      edges: get().edges.map((edge) => ({ ...edge, selected: false })),
    });
  },
  showLightbox: (asset) => set({ ui: { ...get().ui, lightbox: asset } }),
  toast: (toast) => {
    const id = uid('toast');
    set({ toasts: [...get().toasts, { ...toast, id }].slice(-4) });
    window.setTimeout(() => get().dismissToast(id), toast.type === 'error' ? 6200 : 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

/* ------------------------------------------------------------------ *
 *  Execution orchestration (needs store access)
 * ------------------------------------------------------------------ */

async function runTarget(target: RunTarget): Promise<void> {
  const state = useStudioStore.getState();
  if (activeController) {
    state.toast({ type: 'info', title: '已有任务正在执行', description: '请先停止当前执行。' });
    return;
  }
  if (!state.nodes.length) {
    state.toast({ type: 'info', title: '画布为空', description: '请先添加节点再执行。' });
    return;
  }
  if (target.kind !== 'all' && !state.nodes.some((node) => node.id === target.nodeId)) {
    return;
  }

  const priorResults = new Map<string, NodeResult>();
  state.nodes.forEach((node) => {
    if (node.data.result) priorResults.set(node.id, node.data.result);
  });

  let baseNodes = state.nodes;
  if (target.kind === 'all') {
    baseNodes = state.nodes.map((node) =>
      node.data.defType === 'group'
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              status: 'idle' as const,
              result: undefined,
              error: undefined,
              durationMs: undefined,
              cached: undefined,
              simulated: undefined,
              progress: undefined,
            },
          },
    );
  }

  const startedAt = Date.now();
  const initialLogs: ExecutionLog[] = [
    nowLog(
      'info',
      target.kind === 'all'
        ? `开始执行完整工作流 · ${currentModeLabel(state.settings)}`
        : target.kind === 'node'
          ? '开始执行单个节点 · 上游使用现有结果'
          : '从指定节点继续执行 · 上游优先使用缓存',
    ),
  ];

  activeController = new AbortController();
  useStudioStore.setState({
    nodes: baseNodes,
    execution: {
      ...state.execution,
      status: 'validating',
      progress: 0,
      completed: 0,
      total: 0,
      currentNodeId: undefined,
      currentNodeLabel: undefined,
      startedAt,
      finishedAt: undefined,
      mode: state.settings.executionMode === 'mock' ? 'mock' : 'mixed',
      logs: initialLogs,
      lastError: undefined,
      stopping: false,
      simulatedNodes: 0,
      liveNodes: 0,
    },
    selectedEdgeIds: [],
    ui: {
      ...state.ui,
      logsOpen: window.matchMedia('(min-width: 981px)').matches,
      rightTab: 'output',
    },
  });

  const controller = activeController;
  const method =
    target.kind === 'all' ? '完整执行' : target.kind === 'node' ? '单节点执行' : '从此节点继续';
  initialLogs.push(nowLog('debug', `执行方式：${method}`));

  let finalStatus: ExecutionState['status'] = 'success';
  let finalError: string | undefined;
  let errorNodeId: string | undefined;
  let outcome: EngineOutcome = {
    ok: false,
    stopped: false,
    completed: 0,
    total: 0,
    simulated: 0,
    live: 0,
  };

  try {
    useStudioStore.setState({
      execution: {
        ...useStudioStore.getState().execution,
        status: 'running',
      },
    });
    outcome = await runExecution({
      nodes: baseNodes,
      edges: state.edges,
      settings: state.settings,
      target,
      signal: controller.signal,
      priorResults,
      callbacks: {
        onNodeStatus: (nodeId, status: NodeStatus, patch) => {
          useStudioStore.setState((current) => ({
            nodes: current.nodes.map((node) =>
              node.id === nodeId
                ? { ...node, data: { ...node.data, ...patch, status } }
                : node,
            ),
            ...(status === 'running'
              ? {
                  execution: {
                    ...current.execution,
                    currentNodeId: nodeId,
                    currentNodeLabel:
                      current.nodes.find((node) => node.id === nodeId)?.data.label ?? '',
                  },
                }
              : {}),
          }));
        },
        onNodeProgress: (nodeId, value) => {
          useStudioStore.setState((current) => ({
            nodes: current.nodes.map((node) =>
              node.id === nodeId
                ? { ...node, data: { ...node.data, progress: value } }
                : node,
            ),
          }));
        },
        onLog: (log) => {
          useStudioStore.setState((current) => ({
            execution: {
              ...current.execution,
              logs: [
                ...current.execution.logs,
                { ...log, id: uid('log'), time: Date.now() },
              ].slice(-500),
            },
          }));
        },
        onProgress: (completed, total, node) => {
          useStudioStore.setState((current) => ({
            execution: {
              ...current.execution,
              completed,
              total,
              progress: total ? Math.round((completed / total) * 100) : 0,
              currentNodeId: node?.id ?? current.execution.currentNodeId,
              currentNodeLabel: node?.data.label ?? current.execution.currentNodeLabel,
            },
          }));
        },
        onSimulated: () => {
          useStudioStore.setState((current) => ({
            execution: {
              ...current.execution,
              simulatedNodes: current.execution.simulatedNodes + 1,
            },
          }));
        },
        onLive: () => {
          useStudioStore.setState((current) => ({
            execution: {
              ...current.execution,
              liveNodes: current.execution.liveNodes + 1,
            },
          }));
        },
      },
    });

    if (outcome.stopped) {
      finalStatus = 'stopped';
    } else if (!outcome.ok) {
      finalStatus = 'error';
      finalError = outcome.error;
      errorNodeId = outcome.errorNodeId;
    }
  } catch (error) {
    finalStatus = 'error';
    finalError = error instanceof Error ? error.message : '执行引擎异常。';
    useStudioStore.getState().toast({ type: 'error', title: '执行引擎异常', description: finalError });
  } finally {
    activeController = null;
    const finishedAt = Date.now();
    const current = useStudioStore.getState();
    const mode: RunModeValue = outcome.simulated > 0
      ? outcome.live > 0
        ? 'mixed'
        : 'mock'
      : 'live';
    const historyRecord: ExecutionRecord = {
      id: uid('run'),
      startedAt,
      finishedAt,
      status:
        finalStatus === 'success'
          ? 'success'
          : finalStatus === 'stopped'
            ? 'stopped'
            : 'error',
      mode,
      total: outcome.total,
      completed: outcome.completed,
      error: finalError,
      simulatedNodes: outcome.simulated,
      liveNodes: outcome.live,
    };
    const finalNodes = current.nodes.map((node) =>
      node.data.status === 'queued' || node.data.status === 'running'
        ? { ...node, data: { ...node.data, status: 'skipped' as const, progress: undefined } }
        : node.data.status === 'success'
          ? { ...node, data: { ...node.data, progress: 100 } }
          : node,
    );
    const finalLogs = [
      ...current.execution.logs,
      nowLog(
        finalStatus === 'success' ? 'success' : finalStatus === 'stopped' ? 'warn' : 'error',
        finalStatus === 'success'
          ? `执行完成 · ${outcome.completed}/${outcome.total} 个节点 · ${
              mode === 'mock' ? '模拟' : mode === 'mixed' ? '混合模式' : '真实'
            }`
          : finalStatus === 'stopped'
            ? `执行已停止 · 完成 ${outcome.completed}/${outcome.total}`
            : `执行失败：${finalError ?? '未知错误'}`,
        errorNodeId,
      ),
    ].slice(-500);

    useStudioStore.setState({
      nodes: finalNodes,
      execution: {
        ...current.execution,
        status: finalStatus,
        progress:
          finalStatus === 'success'
            ? 100
            : outcome.total
              ? Math.round((outcome.completed / outcome.total) * 100)
              : 0,
        completed: outcome.completed,
        total: outcome.total,
        currentNodeId: undefined,
        currentNodeLabel: undefined,
        finishedAt,
        mode,
        logs: finalLogs,
        history: [historyRecord, ...current.execution.history].slice(0, 30),
        lastError: finalError,
        stopping: false,
        simulatedNodes: outcome.simulated,
        liveNodes: outcome.live,
      },
    });

    if (finalStatus === 'error') {
      if (errorNodeId) {
        useStudioStore.getState().openNodeInspector(errorNodeId);
        const nodeToFocus = errorNodeId;
        window.setTimeout(() => focusCanvasNode(nodeToFocus), 120);
      }
      useStudioStore.getState().toast({
        type: 'error',
        title: '执行失败',
        description: finalError ?? '请查看执行日志。',
      });
    } else if (finalStatus === 'stopped') {
      useStudioStore.getState().toast({
        type: 'warning',
        title: '执行已停止',
        description: `完成 ${outcome.completed}/${outcome.total} 个节点。`,
      });
    } else {
      const simulated = outcome.simulated > 0;
      useStudioStore.getState().toast({
        type: simulated ? 'warning' : 'success',
        title: '执行完成',
        description: simulated
          ? `完成 ${outcome.completed} 个节点，其中 ${outcome.simulated} 个为模拟输出。`
          : `完成 ${outcome.completed} 个节点，全部为真实执行。`,
      });
    }

    if (errorNodeId) {
      useStudioStore.setState((stateNow) => ({
        nodes: stateNow.nodes.map((node) =>
          node.id === errorNodeId && node.data.status !== 'error'
            ? { ...node, data: { ...node.data, status: 'error', error: finalError } }
            : node,
        ),
      }));
    }
  }
}

type RunModeValue = 'live' | 'mock' | 'mixed';
