import type { StudioEdge, StudioNode, WorkflowRecord } from '../types/studio';
import { getNodeDefinition } from '../lib/nodeRegistry';
import { createNode } from '../lib/graph';
import { uid } from '../lib/id';

export const WORKFLOW_CATEGORIES = [
  '全部',
  '图像生成',
  '漫剧创作',
  '视频生成',
  '提示词',
  '采样',
  '实验',
  '我的工作流',
];

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
      sizePreset: '1024x1536',
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
    sizePreset: '1024x768',
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


/* ------------------------------------------------------------------ *
 *  Learning workflows: storyboard + video structures
 * ------------------------------------------------------------------ */

const STORY_NODES: StudioNode[] = [
  makeNode('text-input', 'sb_premise', 0, 20, {
    text: '雨夜，城市天台。沈星第一次见到失踪三年的哥哥，对方却像完全不认识她。',
  }),
  makeNode('character-card', 'sb_character', 0, 230, {
    name: '沈星',
    appearance: '22 岁女性，黑色短发，浅灰色风衣，左耳银色星形耳钉，清冷疏离',
    personality: '冷静克制，追寻真相时异常执着',
    voice: '低沉清晰，语速偏慢',
  }),
  makeNode('storyboard-script', 'sb_script', 320, 40, {
    genre: 'urban-mystery',
    shots: 3,
    style: '电影感写实，雨夜冷蓝色，浅景深',
    notes: '第一镜建立空间，第二镜给人物反应，第三镜留下悬念，不要文字。',
  }),
  makeNode('shot-prompt', 'sb_shot', 640, 60, {
    shotNumber: 1,
    shotSize: 'wide',
    camera: 'push-in',
    lighting: '冷蓝边缘光，雨夜霓虹，潮湿空气',
    mood: '压抑、悬疑、克制',
  }),
  makeNode('negative-prompt', 'sb_negative', 640, 438, {
    text: 'text, watermark, extra fingers, deformed face, oversaturated, low quality',
  }),
  makeNode('agnes-image', 'sb_agnes', 940, 80, {
    prompt: '',
    negativePrompt: '',
    width: 1024,
    height: 1536,
    sizePreset: '1024x1536',
    count: 1,
    seed: 20261105,
  }),
  makeNode('image-output', 'sb_output', 1260, 100, {
    filename: 'storyboard-shot-01',
    format: 'png',
  }),
  makeNode('note', 'sb_note', 0, 560, {
    text: '学习路径：角色设定卡 → 分镜脚本 → 镜头提示词 → Agnes 生成。\n第一步先把角色和镜头说清楚，再谈画面风格；这样才能保证多个镜头里角色一致。',
    color: '#f472b6',
  }, '漫剧第一镜：怎么拆'),
];

const STORY_EDGES: StudioEdge[] = [
  makeEdge('sb_premise', 'text', 'sb_script', 'premise', STORY_NODES),
  makeEdge('sb_character', 'text', 'sb_script', 'character', STORY_NODES),
  makeEdge('sb_character', 'text', 'sb_shot', 'character', STORY_NODES),
  makeEdge('sb_script', 'script', 'sb_shot', 'script', STORY_NODES),
  makeEdge('sb_shot', 'prompt', 'sb_agnes', 'prompt', STORY_NODES),
  makeEdge('sb_negative', 'text', 'sb_agnes', 'negative', STORY_NODES),
  makeEdge('sb_agnes', 'image', 'sb_output', 'image', STORY_NODES),
];

const I2V_NODES: StudioNode[] = [
  makeNode('prompt', 'i2v_prompt', 0, 20, {
    text: '雨夜天台，穿浅灰风衣的年轻女性缓慢回头，发丝被风吹动，霓虹倒影，电影感写实',
  }),
  makeNode('negative-prompt', 'i2v_negative', 0, 300, {
    text: 'text, watermark, blurry, low quality, distorted face, extra limbs',
  }),
  makeNode('agnes-image', 'i2v_frame', 320, 40, {
    prompt: '',
    negativePrompt: '',
    width: 1024,
    height: 1536,
    sizePreset: '1024x1536',
    count: 1,
    seed: 20261105,
  }),
  makeNode('wan-image-to-video', 'i2v_wan', 660, 80, {
    prompt: '',
    duration: 5,
    fps: '16',
    resolution: '480p',
    motion: 55,
    seed: 20261105,
  }),
  makeNode('video-combine', 'i2v_combine', 980, 110, {
    fps: '16',
    format: 'mp4',
    codec: 'h264',
    crf: 20,
  }),
  makeNode('video-output', 'i2v_output', 1280, 130, {
    autoplay: false,
    loop: true,
  }),
  makeNode('note', 'i2v_note', 0, 500, {
    text: '学习路径：先做一张首帧图，再把它交给 Wan 图生视频，最后合成并输出。\n如果视频节点显示 SIMULATION，说明真实视频服务尚未接入；节点结构和参数仍然完整保留。',
    color: '#ff8a5b',
  }, '图生视频：先图后动'),
];

const I2V_EDGES: StudioEdge[] = [
  makeEdge('i2v_prompt', 'text', 'i2v_frame', 'prompt', I2V_NODES),
  makeEdge('i2v_negative', 'text', 'i2v_frame', 'negative', I2V_NODES),
  makeEdge('i2v_frame', 'image', 'i2v_wan', 'image', I2V_NODES),
  makeEdge('i2v_prompt', 'text', 'i2v_wan', 'prompt', I2V_NODES),
  makeEdge('i2v_wan', 'video', 'i2v_combine', 'video', I2V_NODES),
  makeEdge('i2v_combine', 'video', 'i2v_output', 'video', I2V_NODES),
];

const SAMPLER_VIDEO_NODES: StudioNode[] = [
  makeNode('checkpoint', 'sv_model', 0, 40, {
    model: 'flux1-dev',
    precision: 'bf16',
  }),
  makeNode('prompt', 'sv_prompt', 0, 250, {
    text: '雨夜城市天台，霓虹倒影，人物缓慢回头，镜头稳定，电影感写实',
  }),
  makeNode('negative-prompt', 'sv_negative', 0, 500, {
    text: 'text, watermark, distorted face, low quality',
  }),
  makeNode('video-latent', 'sv_latent', 320, 40, {
    width: 832,
    height: 1216,
    frames: 33,
    fps: '16',
  }),
  makeNode('video-sampler', 'sv_sampler', 640, 150, {
    steps: 20,
    cfg: 5,
    sampler: 'euler',
    denoise: 1,
    seed: 20261105,
  }),
  makeNode('video-output', 'sv_output', 960, 170, {
    autoplay: false,
    loop: true,
  }),
  makeNode('note', 'sv_note', 0, 690, {
    text: '这是一张结构学习图：模型、正负条件、视频 Latent 和视频采样器分别负责什么。\n真实采样需要 ComfyUI/Wan 视频工作流；模拟执行仍会按依赖顺序运行，并在结果上标记 SIMULATION。',
    color: '#ff8a5b',
  }, '视频采样：各管什么'),
];

const SAMPLER_VIDEO_EDGES: StudioEdge[] = [
  makeEdge('sv_model', 'model', 'sv_sampler', 'model', SAMPLER_VIDEO_NODES),
  makeEdge('sv_prompt', 'text', 'sv_sampler', 'positive', SAMPLER_VIDEO_NODES),
  makeEdge('sv_negative', 'text', 'sv_sampler', 'negative', SAMPLER_VIDEO_NODES),
  makeEdge('sv_latent', 'latent', 'sv_sampler', 'latent', SAMPLER_VIDEO_NODES),
  makeEdge('sv_sampler', 'video', 'sv_output', 'video', SAMPLER_VIDEO_NODES),
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

  makeWorkflow(
    'wf_storyboard_first_shot',
    '漫剧第一镜 / 角色与分镜',
    '从角色设定卡到分镜脚本、镜头提示词，再做一张可复用的首镜定妆照。',
    '漫剧创作',
    STORY_NODES,
    STORY_EDGES,
    ['漫剧', '分镜', '角色', 'Agnes'],
    8,
  ),
  makeWorkflow(
    'wf_image_to_video',
    '首帧到视频 / Wan I2V',
    '先生成首帧，再走 Wan 图生视频、合成与视频输出；用来理解视频链路的结构。',
    '视频生成',
    I2V_NODES,
    I2V_EDGES,
    ['视频', 'Wan', '图生视频', 'Agnes'],
    6,
  ),
  makeWorkflow(
    'wf_video_sampler_study',
    '视频采样结构 / 每个节点管什么',
    '模型、Latent、正负条件和视频采样器如何连接；模拟执行也会保留完整的节点与端口。',
    '视频生成',
    SAMPLER_VIDEO_NODES,
    SAMPLER_VIDEO_EDGES,
    ['视频采样', 'ComfyUI', '结构'],
    4,
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
