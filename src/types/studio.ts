import type { Edge, Node, Viewport } from '@xyflow/react';

/* ------------------------------------------------------------------ *
 *  Core data types
 * ------------------------------------------------------------------ */

export type PortType =
  | 'TEXT'
  | 'IMAGE'
  | 'MODEL'
  | 'NUMBER'
  | 'LATENT'
  | 'CONDITIONING'
  | 'ANY';

export interface PortTypeMeta {
  label: string;
  short: string;
  color: string;
  description: string;
}

export const PORT_TYPES: Record<PortType, PortTypeMeta> = {
  TEXT: {
    label: '文本',
    short: 'TXT',
    color: '#4ade80',
    description: '提示词、字符串或描述文本',
  },
  IMAGE: {
    label: '图像',
    short: 'IMG',
    color: '#b07cff',
    description: '位图、图片 URL 或 Base64 数据',
  },
  MODEL: {
    label: '模型',
    short: 'MDL',
    color: '#5b9dff',
    description: 'Checkpoint、LoRA 等模型引用',
  },
  NUMBER: {
    label: '数值',
    short: 'NUM',
    color: '#f5a623',
    description: '整数、浮点数或种子',
  },
  LATENT: {
    label: '潜空间',
    short: 'LAT',
    color: '#38d6d0',
    description: '扩散模型的 Latent 张量描述',
  },
  CONDITIONING: {
    label: '条件',
    short: 'CON',
    color: '#ff7ac3',
    description: '编码后的提示词条件',
  },
  ANY: {
    label: '任意',
    short: 'ANY',
    color: '#8a93a3',
    description: '接受任意类型的数据',
  },
};

export type NodeCategoryId =
  | 'input'
  | 'text'
  | 'image'
  | 'model'
  | 'prompt'
  | 'generation'
  | 'processing'
  | 'sampling'
  | 'params'
  | 'output'
  | 'custom';

export interface NodeCategory {
  id: NodeCategoryId;
  label: string;
  description: string;
}

export const NODE_CATEGORIES: NodeCategory[] = [
  { id: 'input', label: '输入节点', description: '文本、图像与基础数据入口' },
  { id: 'text', label: '文本节点', description: '提示词编写、拼接与 AI 优化' },
  { id: 'image', label: '图片节点', description: '图像载入与素材管理' },
  { id: 'model', label: '模型节点', description: 'Checkpoint 与 LoRA 模型' },
  { id: 'prompt', label: '提示词节点', description: '正负提示词与风格控制' },
  { id: 'generation', label: '图像生成', description: 'Agnes 与 ComfyUI 生成任务' },
  { id: 'processing', label: '图像处理', description: '缩放、裁剪与调色' },
  { id: 'sampling', label: '采样节点', description: '采样器、步数与潜空间' },
  { id: 'params', label: '参数节点', description: '数值、尺寸与随机种子' },
  { id: 'output', label: '输出节点', description: '结果预览与落盘' },
  { id: 'custom', label: '自定义节点', description: 'API 请求、便签与扩展' },
];

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
  description?: string;
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'select'
  | 'toggle'
  | 'image'
  | 'code'
  | 'seed'
  | 'color'
  | 'readonly';

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  description?: string;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  rows?: number;
  monospace?: boolean;
  accept?: string;
  showIf?: { key: string; equals: string | number | boolean };
}

export interface NodeDefinition {
  type: string;
  title: string;
  subtitle: string;
  category: NodeCategoryId;
  icon: string;
  accent: string;
  description: string;
  inputs: PortDef[];
  outputs: PortDef[];
  fields: FieldDef[];
  defaults: Record<string, unknown>;
  keywords?: string[];
  width?: number;
  singleton?: boolean;
}

/* ------------------------------------------------------------------ *
 *  Runtime graph types
 * ------------------------------------------------------------------ */

export type NodeStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'skipped';

export interface ImageAsset {
  src: string;
  width?: number;
  height?: number;
  mime?: string;
  alt?: string;
  simulated?: boolean;
  revisedPrompt?: string;
  filename?: string;
}

export interface NodeResult {
  outputs: Record<string, unknown>;
  images?: ImageAsset[];
  text?: string;
  meta?: Record<string, unknown>;
  simulated?: boolean;
}

export interface StudioNodeData extends Record<string, unknown> {
  defType: string;
  label: string;
  params: Record<string, unknown>;
  status: NodeStatus;
  result?: NodeResult;
  error?: string;
  durationMs?: number;
  cached?: boolean;
  simulated?: boolean;
  progress?: number;
  note?: string;
  collapsed?: boolean;
}

export type StudioNode = Node<StudioNodeData, 'studio'>;

export interface StudioEdgeData extends Record<string, unknown> {
  dataType: PortType;
  sourcePort: string;
  targetPort: string;
}

export type StudioEdge = Edge<StudioEdgeData, 'studioEdge'>;

/* ------------------------------------------------------------------ *
 *  Workflow documents
 * ------------------------------------------------------------------ */

export interface WorkflowRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  favorite: boolean;
  nodes: StudioNode[];
  edges: StudioEdge[];
  viewport?: Viewport;
}

export interface WorkflowFile {
  schemaVersion: 1;
  app: 'comfyui-workflow-studio';
  version: string;
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  viewport?: Viewport;
}

export interface SerializedNode {
  id: string;
  type: 'studio';
  position: { x: number; y: number };
  data: {
    defType: string;
    label: string;
    params: Record<string, unknown>;
    note?: string;
    collapsed?: boolean;
  };
  parentId?: string;
  extent?: 'parent';
  style?: Record<string, string | number>;
  width?: number;
  height?: number;
  zIndex?: number;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type: 'studioEdge';
  data: {
    dataType: PortType;
    sourcePort: string;
    targetPort: string;
  };
}

/* ------------------------------------------------------------------ *
 *  Settings
 * ------------------------------------------------------------------ */

export type ExecutionMode = 'auto' | 'mock' | 'live';

export interface AppSettings {
  executionMode: ExecutionMode;
  agnesApiKey: string;
  agnesBaseUrl: string;
  agnesModel: string;
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  comfyBaseUrl: string;
  backendBaseUrl: string;
  useBackendProxy: boolean;
  requestTimeoutMs: number;
  autoSave: boolean;
  cacheEnabled: boolean;
  snapToGrid: boolean;
  gridSize: number;
  showMinimap: boolean;
  confirmOnClear: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  executionMode: 'auto',
  agnesApiKey: '',
  agnesBaseUrl: 'https://apihub.agnes-ai.com/v1',
  agnesModel: 'agnes-image-2.0-flash',
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-chat',
  comfyBaseUrl: '',
  backendBaseUrl: 'http://127.0.0.1:8000',
  useBackendProxy: false,
  requestTimeoutMs: 120000,
  autoSave: true,
  cacheEnabled: true,
  snapToGrid: false,
  gridSize: 16,
  showMinimap: true,
  confirmOnClear: true,
};

/* ------------------------------------------------------------------ *
 *  Execution
 * ------------------------------------------------------------------ */

export type ExecutionStatus =
  | 'idle'
  | 'validating'
  | 'running'
  | 'success'
  | 'error'
  | 'stopped';

export type RunMode = 'live' | 'mock' | 'mixed';

export interface ExecutionLog {
  id: string;
  time: number;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  message: string;
  nodeId?: string;
}

export interface ExecutionRecord {
  id: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'success' | 'error' | 'stopped';
  mode: RunMode;
  total: number;
  completed: number;
  error?: string;
  simulatedNodes?: number;
  liveNodes?: number;
}

export interface ExecutionState {
  status: ExecutionStatus;
  progress: number;
  completed: number;
  total: number;
  currentNodeId?: string;
  currentNodeLabel?: string;
  startedAt?: number;
  finishedAt?: number;
  mode: RunMode;
  logs: ExecutionLog[];
  history: ExecutionRecord[];
  lastError?: string;
  stopping?: boolean;
  simulatedNodes: number;
  liveNodes: number;
}

export interface ValidationIssue {
  nodeId?: string;
  edgeId?: string;
  message: string;
  severity: 'error' | 'warning';
}

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */

export type ModalName =
  | 'workflows'
  | 'settings'
  | 'help'
  | 'confirm'
  | null;

export type CanvasTool = 'select' | 'pan';

export interface ToastItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  description?: string;
}

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
}

export interface UIState {
  leftOpen: boolean;
  rightOpen: boolean;
  logsOpen: boolean;
  mobileMenuOpen: boolean;
  activeModal: ModalName;
  canvasTool: CanvasTool;
  rightTab: 'params' | 'output';
  logTab: 'logs' | 'history';
  lightbox?: ImageAsset;
  confirm?: ConfirmOptions;
  searchOpen: boolean;
}

export interface NodeRunContext {
  params: Record<string, unknown>;
  inputs: Record<string, unknown>;
  settings: AppSettings;
  mode: 'live' | 'mock';
  signal: AbortSignal;
  nodeId: string;
  nodeLabel: string;
  log: (message: string, level?: ExecutionLog['level']) => void;
  reportSimulated: () => void;
  reportLive: () => void;
  progress: (value: number, message?: string) => void;
}
