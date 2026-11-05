import type { StudioEdge, StudioNode, WorkflowRecord } from '../types/studio';
import { getNodeDefinition } from '../lib/nodeRegistry';
import { createNode } from '../lib/graph';
import { uid } from '../lib/id';

export const WORKFLOW_CATEGORIES = ['全部', '图像生成', '提示词', '采样', '实验', '我的工作流'];

function makeNode(
  defType: string,
  id: string,
  x: number,
  y: number,
  paramOverrides: Record<string, unknown> = {},
  label?: string,
): StudioNode {
  const node = createNode(defType, { x, y });
  return {
    ...node,
    id,
    data: {
      ...node.data,
      ...(label ? { label } : {}),
      params: { ...node.data.params, ...paramOverrides },
    },
  };
}

function makeEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  nodePool: StudioNode[],
): StudioEdge {
  const sourceNode = nodePool.find((node) => node.id === source);
  const sourcePort = sourceNode
    ? getNodeDefinition(sourceNode.data.defType).outputs.find((port) => port.id === sourceHandle)
    : undefined;
  return {
    id: uid('edge'),
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'studioEdge',
    data: {
      dataType: sourcePort?.type ?? 'ANY',
      sourcePort: sourceHandle,
      targetPort: targetHandle,
    },
  };
}

const SAMPLE_NODES: StudioNode[] = [
  makeNode('prompt', 'n_prompt', 0, 20, {
    text: 'A lone astronaut standing at the edge of a black volcanic lake, distant aurora, reflective water, cinematic atmosphere, ultra detailed, 35mm film grain',
  }),
  makeNode('negative-prompt', 'n_negative', 0, 258),
  makeNode(
    'deepseek-refiner',
    'n_refiner',
    302,
    30,
    {
      instruction:
        'Rewrite this as a single production-ready English image prompt. Preserve the astronaut and volcanic lake. Add specific lens, lighting, mood and material details. Return prompt only.',
    },
  ),
  makeNode('style-preset', 'n_style', 302, 292, { style: 'cinematic', strength: 75 }),
  makeNode('seed', 'n_seed', 302, 474, { seed: 20260214, randomize: false }),
  makeNode(
    'agnes-image',
    'n_agnes',
    626,
    116,
    {
      width: 1024,
      height: 1536,
      count: 1,
      seed: 20260214,
      prompt:
        'A lone astronaut standing at the edge of a black volcanic lake, distant aurora, reflective water, cinematic atmosphere, ultra detailed',
    },
  ),
  makeNode('image-output', 'n_output', 942, 132, { filename: 'agnes-astronaut', format: 'png' }),
  makeNode(
    'note',
    'n_note',
    0,
    492,
    {
      text: '示例工作流：提示词 → DeepSeek 优化 → 风格叠加 → Agnes 生成 → 输出。\n未填写 API Key 时会在日志与输出图中明确标注「模拟」。',
      color: '#8b7dff',
    },
    '使用说明',
  ),
];

const sampleEdges: StudioEdge[] = [
  makeEdge('n_prompt', 'text', 'n_refiner', 'text', SAMPLE_NODES),
  makeEdge('n_refiner', 'text', 'n_style', 'text', SAMPLE_NODES),
  makeEdge('n_style', 'text', 'n_agnes', 'prompt', SAMPLE_NODES),
  makeEdge('n_negative', 'text', 'n_agnes', 'negative', SAMPLE_NODES),
  makeEdge('n_seed', 'seed', 'n_agnes', 'seed', SAMPLE_NODES),
  makeEdge('n_agnes', 'image', 'n_output', 'image', SAMPLE_NODES),
];

function makeWorkflow(
  id: string,
  name: string,
  description: string,
  category: string,
  nodes: StudioNode[],
  edges: StudioEdge[],
  tags: string[],
  offsetMinutes = 30,
): WorkflowRecord {
  const now = Date.now() - offsetMinutes * 60_000;
  return {
    id,
    name,
    description,
    category,
    tags,
    createdAt: now,
    updatedAt: now,
    favorite: false,
    nodes,
    edges,
  };
}

const IMG2IMG_NODES: StudioNode[] = [
  makeNode(
    'load-image',
    'i2i_image',
    0,
    60,
    { image: '' },
    '参考图',
  ),
  makeNode('image-adjust', 'i2i_adjust', 284, 60, {
    brightness: 98,
    contrast: 112,
    saturation: 88,
    grayscale: false,
  }),
  makeNode('prompt', 'i2i_prompt', 0, 320, {
    text: 'Transform the reference into an analog film photograph at blue hour, soft haze, subtle grain, natural skin tones',
  }),
  makeNode('style-preset', 'i2i_style', 284, 320, { style: 'film', strength: 80 }),
  makeNode('negative-prompt', 'i2i_negative', 0, 560),
  makeNode('agnes-image', 'i2i_agnes', 608, 176, {
    prompt:
      'Transform the reference into an analog film photograph at blue hour, soft haze, subtle grain',
    negativePrompt: 'digital look, oversharpened, plastic skin, watermark',
    width: 1024,
    height: 768,
    count: 1,
    seed: 771209,
  }),
  makeNode('image-output', 'i2i_output', 928, 192, { filename: 'film-transfer', format: 'png' }),
];

const IMG2IMG_EDGES: StudioEdge[] = [
  makeEdge('i2i_image', 'image', 'i2i_adjust', 'image', IMG2IMG_NODES),
  makeEdge('i2i_adjust', 'image', 'i2i_agnes', 'image', IMG2IMG_NODES),
  makeEdge('i2i_prompt', 'text', 'i2i_style', 'text', IMG2IMG_NODES),
  makeEdge('i2i_style', 'text', 'i2i_agnes', 'prompt', IMG2IMG_NODES),
  makeEdge('i2i_negative', 'text', 'i2i_agnes', 'negative', IMG2IMG_NODES),
  makeEdge('i2i_agnes', 'image', 'i2i_output', 'image', IMG2IMG_NODES),
];

const SAMPLER_NODES: StudioNode[] = [
  makeNode('checkpoint', 'ks_model', 0, 40, { model: 'flux1-dev', precision: 'bf16' }),
  makeNode('prompt', 'ks_prompt', 0, 250, {
    text: 'editorial still life of wild flowers in a hand-blown glass vase, morning light, quiet luxury',
  }),
  makeNode('negative-prompt', 'ks_negative', 0, 458),
  makeNode('latent-empty', 'ks_latent', 306, 40, { width: 1024, height: 1024, batch: 1 }),
  makeNode('ksampler', 'ks_sampler', 614, 156, {
    steps: 30,
    cfg: 6.5,
    sampler: 'dpmpp_2m',
    scheduler: 'karras',
    seed: 884422,
  }),
  makeNode('image-output', 'ks_output', 926, 180, { filename: 'flower-study', format: 'png' }),
  makeNode(
    'note',
    'ks_note',
    0,
    626,
    {
      text: '采样器参数用于演示节点结构与依赖执行。若需要真实采样，请在「设置 → 执行」配置 ComfyUI 服务地址并使用 ComfyUI API 工作流节点。',
      color: '#f5a623',
    },
    '关于真实采样',
  ),
];

const SAMPLER_EDGES: StudioEdge[] = [
  makeEdge('ks_model', 'model', 'ks_sampler', 'model', SAMPLER_NODES),
  makeEdge('ks_prompt', 'text', 'ks_sampler', 'positive', SAMPLER_NODES),
  makeEdge('ks_negative', 'text', 'ks_sampler', 'negative', SAMPLER_NODES),
  makeEdge('ks_latent', 'latent', 'ks_sampler', 'latent', SAMPLER_NODES),
  makeEdge('ks_sampler', 'image', 'ks_output', 'image', SAMPLER_NODES),
];

export const SAMPLE_WORKFLOWS: WorkflowRecord[] = [
  makeWorkflow(
    'wf_aurora_astronaut',
    'Aurora / 电影感宇航员',
    'DeepSeek 提示词优化 + Agnes 图像生成，适合作为第一个可运行工作流。',
    '图像生成',
    SAMPLE_NODES,
    sampleEdges,
    ['Agnes', 'DeepSeek', '示例'],
    18,
  ),
  makeWorkflow(
    'wf_film_transfer',
    'Film Transfer / 胶片转绘',
    '载入参考图，经本地调色后交给 Agnes 做图生图风格迁移。',
    '图像生成',
    IMG2IMG_NODES,
    IMG2IMG_EDGES,
    ['图生图', 'Agnes'],
    74,
  ),
  makeWorkflow(
    'wf_sampler_study',
    'Sampler Study / 采样结构',
    '展示 Checkpoint、Latent、KSampler 的依赖关系与参数结构。',
    '采样',
    SAMPLER_NODES,
    SAMPLER_EDGES,
    ['KSampler', 'ComfyUI'],
    240,
  ),
];

export function createBlankWorkflow(name = '未命名工作流'): WorkflowRecord {
  const now = Date.now();
  return {
    id: uid('wf'),
    name,
    description: '空白画布，从左侧节点库开始搭建。',
    category: '我的工作流',
    tags: [],
    createdAt: now,
    updatedAt: now,
    favorite: false,
    nodes: [],
    edges: [],
  };
}

export function cloneSampleAsNew(sample: WorkflowRecord, name: string): WorkflowRecord {
  return {
    ...sample,
    id: uid('wf'),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    favorite: false,
    nodes: sample.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        status: 'idle',
        result: undefined,
        error: undefined,
      },
    })),
    edges: sample.edges.map((edge) => ({ ...edge })),
  };
}
