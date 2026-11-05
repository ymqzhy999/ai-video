import type {
  AppSettings,
  StudioEdge,
  StudioNode,
  WorkflowFile,
  WorkflowRecord,
} from '../types/studio';
import { DEFAULT_SETTINGS } from '../types/studio';
import { NODE_DEF_MAP } from './nodeRegistry';
import {
  normalizeEdge,
  normalizeNode,
  serializeEdges,
  serializeNodes,
} from './graph';
import { uid } from './id';
import { idbGet, idbSet, idbDelete } from './db';
import { SAMPLE_WORKFLOWS } from '../data/sampleWorkflows';

export const STATE_VERSION = 1;
const IDB_KEY = 'app-state-v1';
const LOCAL_KEY = 'comfyui-studio:state:v1';
const SETTINGS_KEY = 'comfyui-studio:settings:v1';

export interface PersistedState {
  version: number;
  workflows: WorkflowRecord[];
  activeWorkflowId: string;
  favoriteNodes: string[];
  recentNodes: string[];
  recentWorkflows: string[];
  settings: AppSettings;
  savedAt: number;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

function cloneSamples(): WorkflowRecord[] {
  return SAMPLE_WORKFLOWS.map((workflow) => ({
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        params: JSON.parse(JSON.stringify(node.data.params)),
        status: 'idle' as const,
        result: undefined,
        error: undefined,
      },
    })),
    edges: workflow.edges.map((edge) => ({ ...edge })),
  }));
}

export function createDefaultState(): PersistedState {
  const workflows = cloneSamples();
  return {
    version: STATE_VERSION,
    workflows,
    activeWorkflowId: workflows[0]?.id ?? '',
    favoriteNodes: ['agnes-image', 'prompt', 'deepseek-refiner'],
    recentNodes: ['prompt', 'agnes-image', 'image-output'],
    recentWorkflows: [workflows[0]?.id ?? ''].filter(Boolean),
    settings: { ...DEFAULT_SETTINGS },
    savedAt: Date.now(),
  };
}

export function normalizeSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const candidate = raw as Partial<AppSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    executionMode:
      candidate.executionMode === 'live' ||
      candidate.executionMode === 'mock' ||
      candidate.executionMode === 'auto'
        ? candidate.executionMode
        : DEFAULT_SETTINGS.executionMode,
    requestTimeoutMs: Math.max(
      10000,
      Math.min(600000, Number(candidate.requestTimeoutMs) || DEFAULT_SETTINGS.requestTimeoutMs),
    ),
    gridSize: Math.max(8, Math.min(64, Number(candidate.gridSize) || DEFAULT_SETTINGS.gridSize)),
  };
}

export function normalizeWorkflowRecord(
  raw: unknown,
  options: { keepId?: boolean; newName?: string } = {},
): { workflow: WorkflowRecord | null; droppedNodes: number; droppedEdges: number } {
  if (!raw || typeof raw !== 'object') {
    return { workflow: null, droppedNodes: 0, droppedEdges: 0 };
  }
  const candidate = raw as Partial<WorkflowRecord> & {
    nodes?: unknown[];
    edges?: unknown[];
  };
  if (!Array.isArray(candidate.nodes)) {
    return { workflow: null, droppedNodes: 0, droppedEdges: 0 };
  }

  const nodes: StudioNode[] = [];
  const seenNodeIds = new Set<string>();
  let droppedNodes = 0;
  candidate.nodes.slice(0, 400).forEach((rawNode, index) => {
    const defType =
      rawNode && typeof rawNode === 'object'
        ? (rawNode as { data?: { defType?: string } }).data?.defType
        : undefined;
    if (defType && defType !== 'group' && !NODE_DEF_MAP[defType]) {
      droppedNodes += 1;
      return;
    }
    const node = normalizeNode(rawNode, index);
    if (!node) {
      droppedNodes += 1;
      return;
    }
    if (seenNodeIds.has(node.id)) node.id = uid('node');
    seenNodeIds.add(node.id);
    nodes.push(node);
  });

  const groupIds = new Set(nodes.filter((node) => node.data.defType === 'group').map((node) => node.id));
  nodes.forEach((node) => {
    if (node.parentId && !groupIds.has(node.parentId)) {
      node.parentId = undefined;
      node.extent = undefined;
    }
  });
  const orderedNodes = [
    ...nodes.filter((node) => node.data.defType === 'group'),
    ...nodes.filter((node) => node.data.defType !== 'group'),
  ];

  const edges: StudioEdge[] = [];
  const seenEdgeIds = new Set<string>();
  const seenTargets = new Set<string>();
  let droppedEdges = 0;
  (Array.isArray(candidate.edges) ? candidate.edges : []).slice(0, 800).forEach((rawEdge, index) => {
    const edge = normalizeEdge(rawEdge, orderedNodes);
    if (!edge) {
      droppedEdges += 1;
      return;
    }
    const targetKey = `${edge.target}:${edge.targetHandle}`;
    if (seenTargets.has(targetKey)) {
      droppedEdges += 1;
      return;
    }
    seenTargets.add(targetKey);
    if (seenEdgeIds.has(edge.id)) edge.id = uid('edge');
    seenEdgeIds.add(edge.id);
    edges.push(edge);
    void index;
  });

  const now = Date.now();
  const workflow: WorkflowRecord = {
    id: options.keepId !== false && typeof candidate.id === 'string' && candidate.id
      ? candidate.id
      : uid('wf'),
    name:
      options.newName ||
      (typeof candidate.name === 'string' && candidate.name.trim()
        ? candidate.name.trim()
        : '导入的工作流'),
    description:
      typeof candidate.description === 'string' ? candidate.description : '通过 JSON 导入的工作流。',
    category:
      typeof candidate.category === 'string' && candidate.category ? candidate.category : '导入',
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8)
      : [],
    createdAt:
      typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : now,
    updatedAt:
      typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : now,
    favorite: Boolean(candidate.favorite),
    nodes: orderedNodes,
    edges,
    viewport:
      candidate.viewport &&
      typeof candidate.viewport.x === 'number' &&
      typeof candidate.viewport.y === 'number' &&
      typeof candidate.viewport.zoom === 'number'
        ? candidate.viewport
        : undefined,
  };
  return { workflow, droppedNodes, droppedEdges };
}

function sanitizeWorkflow(workflow: WorkflowRecord): WorkflowRecord {
  return {
    ...workflow,
    nodes: serializeNodes(workflow.nodes) as unknown as StudioNode[],
    edges: serializeEdges(workflow.edges) as unknown as StudioEdge[],
  };
}

export function serializePersistedState(state: PersistedState): PersistedState {
  return {
    ...state,
    version: STATE_VERSION,
    workflows: state.workflows.map(sanitizeWorkflow),
    settings: { ...state.settings },
    savedAt: Date.now(),
  };
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  let raw: unknown = null;
  try {
    raw = await idbGet<PersistedState>(IDB_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    try {
      const local = localStorage.getItem(LOCAL_KEY);
      if (local) raw = JSON.parse(local);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== 'object') {
    try {
      const settingsRaw = localStorage.getItem(SETTINGS_KEY);
      if (settingsRaw) {
        return {
          ...createDefaultState(),
          settings: normalizeSettings(JSON.parse(settingsRaw)),
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }
  const candidate = raw as Partial<PersistedState>;
  if (!Array.isArray(candidate.workflows)) return null;

  const workflows: WorkflowRecord[] = [];
  candidate.workflows.slice(0, 50).forEach((workflow) => {
    const normalized = normalizeWorkflowRecord(workflow, { keepId: true }).workflow;
    if (normalized) workflows.push(normalized);
  });
  if (!workflows.length) return null;
  const active = workflows.some((workflow) => workflow.id === candidate.activeWorkflowId)
    ? String(candidate.activeWorkflowId)
    : workflows[0].id;
  const favoriteNodes = Array.isArray(candidate.favoriteNodes)
    ? candidate.favoriteNodes.filter((type): type is string => typeof type === 'string' && Boolean(NODE_DEF_MAP[type]))
    : [];
  const recentNodes = Array.isArray(candidate.recentNodes)
    ? candidate.recentNodes.filter((type): type is string => typeof type === 'string' && Boolean(NODE_DEF_MAP[type])).slice(0, 8)
    : [];
  const recentWorkflows = Array.isArray(candidate.recentWorkflows)
    ? candidate.recentWorkflows
        .filter((id): id is string => typeof id === 'string' && workflows.some((workflow) => workflow.id === id))
        .slice(0, 8)
    : [active];

  return {
    version: STATE_VERSION,
    workflows,
    activeWorkflowId: active,
    favoriteNodes,
    recentNodes,
    recentWorkflows,
    settings: normalizeSettings(candidate.settings),
    savedAt: typeof candidate.savedAt === 'number' ? candidate.savedAt : Date.now(),
  };
}

export async function savePersistedState(state: PersistedState): Promise<SaveResult> {
  const payload = serializePersistedState(state);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload.settings));
  } catch {
    /* non-fatal */
  }
  const ok = await idbSet(IDB_KEY, payload);
  if (ok) return { ok: true };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'QuotaExceededError'
        ? '本地存储空间不足，请删除不用的工作流或图片素材。'
        : '保存失败，请检查设备存储空间。';
    return { ok: false, error: message };
  }
}

export async function clearPersistedState(): Promise<void> {
  await idbDelete(IDB_KEY);
  try {
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* ignore */
  }
}

export function parseWorkflowJson(text: string): {
  workflow: WorkflowRecord | null;
  warnings: string[];
  error?: string;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { workflow: null, warnings: [], error: '文件不是合法 JSON。' };
  }
  const payload = raw as WorkflowFile | WorkflowRecord;
  if (!payload || typeof payload !== 'object') {
    return { workflow: null, warnings: [], error: 'JSON 结构不正确。' };
  }
  if ('schemaVersion' in payload && payload.schemaVersion !== 1) {
    return {
      workflow: null,
      warnings: [],
      error: `不支持的工作流版本：${String(payload.schemaVersion)}。`,
    };
  }
  const normalized = normalizeWorkflowRecord(payload, { keepId: false });
  if (!normalized.workflow) {
    return { workflow: null, warnings: [], error: '未找到有效的 nodes / edges 数据。' };
  }
  const warnings: string[] = [];
  if (normalized.droppedNodes) warnings.push(`跳过 ${normalized.droppedNodes} 个未知或无效节点。`);
  if (normalized.droppedEdges) warnings.push(`跳过 ${normalized.droppedEdges} 条无效连接。`);
  if (!normalized.workflow.nodes.length) warnings.push('工作流中没有节点。');
  return { workflow: normalized.workflow, warnings };
}

export function makeWorkflowFile(workflow: WorkflowRecord): WorkflowFile {
  return {
    schemaVersion: 1,
    app: 'comfyui-workflow-studio',
    version: '1.0.0',
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    category: workflow.category,
    tags: workflow.tags,
    createdAt: workflow.createdAt,
    updatedAt: Date.now(),
    nodes: serializeNodes(workflow.nodes) as unknown as WorkflowFile['nodes'],
    edges: serializeEdges(workflow.edges) as unknown as WorkflowFile['edges'],
    viewport: workflow.viewport,
  };
}
