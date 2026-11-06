import type {
  AppSettings,
  ExecutionLog,
  AudioAsset,
  ImageAsset,
  NodeResult,
  VideoAsset,
  NodeStatus,
  StudioEdge,
  StudioNode,
  StudioNodeData,
  ValidationIssue,
} from '../types/studio';
import { getNodeDefinition, typesCompatible } from './nodeRegistry';
import { getDownstreamNodeIds, topologicalOrder } from './graph';
import { hashString } from './id';
import {
  ApiError,
  callCustomApi,
  generateAgnesImages,
  hasAgnesKey,
  hasDeepSeekKey,
  refinePromptWithDeepSeek,
  runComfyWorkflow,
} from './api';
import { generateVideoViaApi } from './videoApi';
import {
  adjustImage,
  cropImage,
  makeMockImage,
  normalizeAgnesSize,
  scaleImage,
} from './image';

/* ------------------------------------------------------------------ *
 *  Public types
 * ------------------------------------------------------------------ */

export type RunTarget =
  | { kind: 'all' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'from'; nodeId: string };

export interface EngineCallbacks {
  onNodeStatus: (nodeId: string, status: NodeStatus, patch?: Partial<StudioNodeData>) => void;
  onNodeProgress?: (nodeId: string, value: number, message?: string) => void;
  onLog: (log: Omit<ExecutionLog, 'id' | 'time'>) => void;
  onProgress: (completed: number, total: number, node?: StudioNode) => void;
  onSimulated: (nodeId: string) => void;
  onLive: (nodeId: string) => void;
}

export interface EngineOptions {
  nodes: StudioNode[];
  edges: StudioEdge[];
  settings: AppSettings;
  target: RunTarget;
  signal: AbortSignal;
  callbacks: EngineCallbacks;
  priorResults?: Map<string, NodeResult>;
}

export interface EngineOutcome {
  ok: boolean;
  stopped: boolean;
  error?: string;
  errorNodeId?: string;
  completed: number;
  total: number;
  simulated: number;
  live: number;
}

interface ExecutionRuntime {
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

const nodeCache = new Map<string, NodeResult>();
const MAX_CACHE_ENTRIES = 80;

export function clearExecutionCache(): void {
  nodeCache.clear();
}

export function executionCacheSize(): number {
  return nodeCache.size;
}

/* ------------------------------------------------------------------ *
 *  Validation
 * ------------------------------------------------------------------ */

export function validateGraph(
  nodes: StudioNode[],
  edges: StudioEdge[],
  targetIds?: Set<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const executable = nodes.filter(
    (node) => node.data.defType !== 'group' && node.data.defType !== 'note',
  );
  const targetExecutable = executable.filter((node) => !targetIds || targetIds.has(node.id));

  nodes.forEach((node) => {
    if (node.data.defType === 'group' || node.data.defType === 'note') return;
    const definition = getNodeDefinition(node.data.defType);
    if (!definition || definition.type === 'group') {
      issues.push({
        nodeId: node.id,
        message: `节点「${node.data.label}」类型未知（${node.data.defType}）。`,
        severity: 'error',
      });
    }
  });

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({
        edgeId: edge.id,
        message: '存在指向已删除节点的连接。',
        severity: 'error',
      });
      return;
    }
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) return;
    const sourcePort = getNodeDefinition(sourceNode.data.defType).outputs.find(
      (port) => port.id === edge.sourceHandle,
    );
    const targetPort = getNodeDefinition(targetNode.data.defType).inputs.find(
      (port) => port.id === edge.targetHandle,
    );
    if (!sourcePort || !targetPort) {
      issues.push({
        edgeId: edge.id,
        message: '连接的端口不存在。',
        severity: 'error',
      });
      return;
    }
    if (!typesCompatible(sourcePort.type, targetPort.type)) {
      issues.push({
        edgeId: edge.id,
        message: `类型不兼容：${sourcePort.type} → ${targetPort.type}。`,
        severity: 'error',
      });
    }
  });

  targetExecutable.forEach((node) => {
    const definition = getNodeDefinition(node.data.defType);
    const incoming = edges.filter((edge) => edge.target === node.id);
    definition.inputs.filter((port) => port.required).forEach((port) => {
      if (!incoming.some((edge) => edge.targetHandle === port.id)) {
        issues.push({
          nodeId: node.id,
          message: `节点「${node.data.label}」缺少必填输入「${port.label}」。`,
          severity: 'error',
        });
      }
    });
    definition.inputs.forEach((port) => {
      const matching = incoming.filter((edge) => edge.targetHandle === port.id);
      if (matching.length > 1) {
        issues.push({
          nodeId: node.id,
          edgeId: matching[1]?.id,
          message: `节点「${node.data.label}」的「${port.label}」存在多条连接。`,
          severity: 'error',
        });
      }
    });
  });

  const edgeNodes = new Set<string>();
  edges.forEach((edge) => {
    edgeNodes.add(edge.source);
    edgeNodes.add(edge.target);
  });
  targetExecutable.forEach((node) => {
    if (!edgeNodes.has(node.id)) {
      issues.push({
        nodeId: node.id,
        message: `节点「${node.data.label}」未连接到工作流。`,
        severity: 'warning',
      });
    }
  });

  const { cycleNodeIds } = topologicalOrder(executable, edges);
  cycleNodeIds.forEach((nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    issues.push({
      nodeId,
      message: `检测到循环依赖：${node?.data.label ?? nodeId} 位于环中，已阻止执行。`,
      severity: 'error',
    });
  });

  return issues;
}

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '');
  }
  return '';
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return asNumber((value as { value?: unknown }).value);
  }
  return 0;
}

function asImage(value: unknown): ImageAsset | null {
  if (!value) return null;
  if (typeof value === 'string') return { src: value };
  if (typeof value === 'object') {
    const candidate = value as Partial<ImageAsset>;
    if (typeof candidate.src === 'string' && candidate.src) {
      return {
        src: candidate.src,
        width: candidate.width,
        height: candidate.height,
        mime: candidate.mime,
        alt: candidate.alt,
        simulated: candidate.simulated,
      };
    }
  }
  return null;
}

function asVideo(value: unknown): VideoAsset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<VideoAsset>;
  if (typeof candidate.width !== 'number' || typeof candidate.height !== 'number') return null;
  return {
    src: typeof candidate.src === 'string' ? candidate.src : undefined,
    poster: typeof candidate.poster === 'string' ? candidate.poster : undefined,
    width: candidate.width,
    height: candidate.height,
    duration: Number(candidate.duration ?? 0),
    fps: Number(candidate.fps ?? 16),
    simulated: Boolean(candidate.simulated),
    provider: candidate.provider,
    filename: candidate.filename,
    mimeType: candidate.mimeType,
  };
}

function asAudio(value: unknown): AudioAsset | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AudioAsset>;
  return {
    src: typeof candidate.src === 'string' ? candidate.src : undefined,
    duration: Number(candidate.duration ?? 0),
    simulated: Boolean(candidate.simulated),
    label: candidate.label,
  };
}

function makeSimulatedVideo(
  prompt: string,
  width: number,
  height: number,
  duration: number,
  fps: number,
  seed: number,
  provider = '本地视频模拟',
): { video: VideoAsset; poster: ImageAsset } {
  const poster = makeMockImage(
    prompt || 'video storyboard preview',
    Math.min(width, 768),
    Math.min(height, 1024),
    seed || 1,
    3,
  );
  return {
    video: {
      poster: poster.src,
      width,
      height,
      duration,
      fps,
      simulated: true,
      provider,
    },
    poster,
  };
}

function asLatent(value: unknown): { width: number; height: number; batch: number; frames?: number; fps?: number } {
  if (value && typeof value === 'object') {
    const latent = value as { width?: unknown; height?: unknown; batch?: unknown };
    return {
      width: asNumber(latent.width) || 1024,
      height: asNumber(latent.height) || 1024,
      batch: asNumber(latent.batch) || 1,
    };
  }
  return { width: 1024, height: 1024, batch: 1 };
}

function localRefinePrompt(prompt: string, language: string): string {
  const additions =
    language === 'zh'
      ? '电影感构图，体积光，丰富的材质细节，浅景深，超高细节，专业摄影'
      : 'cinematic composition, volumetric lighting, rich material detail, shallow depth of field, ultra detailed, professional photography';
  return `${prompt.replace(/[.\s]+$/, '')}, ${additions}`;
}

const STYLE_KEYWORDS: Record<string, string> = {
  cinematic: 'cinematic still, anamorphic lens flare, dramatic lighting, film grain',
  cyberpunk: 'cyberpunk, neon reflections, rain-soaked streets, high contrast magenta and cyan',
  film: 'analog 35mm film photograph, natural grain, soft halation, muted colors',
  product: 'premium product photography, studio softbox light, seamless backdrop, crisp detail',
  anime: 'japanese anime illustration, clean line art, vibrant cel shading, detailed background',
  '3d': 'high-end 3D render, physically based materials, soft global illumination, octane',
};

function styleSuffix(style: string, strength: number): string {
  const keyword = STYLE_KEYWORDS[style] ?? STYLE_KEYWORDS.cinematic;
  if (strength >= 80) return keyword;
  if (strength >= 50) return `${keyword.split(',')[0]}, ${keyword.split(',')[1] ?? ''}`.trim();
  return keyword.split(',')[0];
}

function cacheFingerprint(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value.length > 6000 && (value.startsWith('data:') || value.startsWith('http'))) {
      return `${value.slice(0, 180)}:${value.length}:${hashString(value)}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(cacheFingerprint);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cacheFingerprint(item),
      ]),
    );
  }
  return value;
}

function cacheKey(
  node: StudioNode,
  inputs: Record<string, unknown>,
  mode: string,
  settings: AppSettings,
): string {
  return hashString(
    JSON.stringify({
      type: node.data.defType,
      params: cacheFingerprint(node.data.params),
      inputs: cacheFingerprint(inputs),
      mode,
      agnesModel: settings.agnesModel,
      deepseekModel: settings.deepseekModel,
      comfyBase: settings.comfyBaseUrl,
    }),
  );
}

function shouldUseLive(node: StudioNode, settings: AppSettings): boolean {
  if (settings.executionMode === 'mock') return false;
  if (settings.executionMode === 'live') return true;
  if (node.data.defType === 'agnes-image') return hasAgnesKey(settings);
  if (node.data.defType === 'deepseek-refiner') return hasDeepSeekKey(settings);
  if (node.data.defType === 'comfyui-workflow') return Boolean(settings.comfyBaseUrl.trim());
  return true;
}

function resolveTargets(
  nodes: StudioNode[],
  edges: StudioEdge[],
  target: RunTarget,
): Set<string> {
  if (target.kind === 'all') {
    return new Set(
      nodes
        .filter((node) => node.data.defType !== 'group' && node.data.defType !== 'note')
        .map((node) => node.id),
    );
  }
  if (target.kind === 'node') return new Set([target.nodeId]);
  return getDownstreamNodeIds(target.nodeId, edges);
}

/* ------------------------------------------------------------------ *
 *  Executors
 * ------------------------------------------------------------------ */

async function executeNode(runtime: ExecutionRuntime, node: StudioNode): Promise<NodeResult> {
  const { params, inputs, settings, mode, signal, log, reportSimulated, reportLive, progress } =
    runtime;
  const type = node.data.defType;

  const inputImage = asImage(inputs.image);
  const promptInput = asText(inputs.prompt);
  const negativeInput = asText(inputs.negative);

  switch (type) {
    case 'text-input': {
      reportLive();
      const text = String(params.text ?? '');
      return { outputs: { text }, text };
    }
    case 'load-image': {
      reportLive();
      const src = typeof params.image === 'string' ? params.image : '';
      if (!src) throw new ApiError('请先在属性面板上传一张图片。');
      const image: ImageAsset = { src, alt: node.data.label };
      return { outputs: { image }, images: [image] };
    }
    case 'number-input': {
      reportLive();
      const value = Number(params.value ?? 0);
      return { outputs: { value }, text: String(value) };
    }
    case 'prompt': {
      reportLive();
      const base = String(params.text ?? '').trim();
      const template = String(params.template ?? 'custom');
      const suffixes: Record<string, string> = {
        portrait:
          'editorial portrait photography, 85mm lens, soft directional window light, natural skin texture, shallow depth of field',
        product:
          'premium product shot, studio softbox lighting, seamless background, macro detail, commercial photography',
        cinematic:
          'cinematic film still, anamorphic lens, volumetric light, atmospheric depth, subtle film grain',
        illustration:
          'modern editorial illustration, bold shapes, limited palette, textured paper, poster composition',
      };
      const text = template === 'custom' || !suffixes[template]
        ? base
        : `${base}${base ? ', ' : ''}${suffixes[template]}`;
      return { outputs: { text }, text };
    }
    case 'negative-prompt': {
      reportLive();
      const text = String(params.text ?? '').trim();
      return { outputs: { text }, text };
    }
    case 'prompt-merge': {
      reportLive();
      const parts = [asText(inputs.a), asText(inputs.b)].filter((part) =>
        String(params.trim ?? true) === 'false' ? true : Boolean(part.trim()),
      );
      if (!parts.length) throw new ApiError('两个输入都为空，无法合并。');
      const text = parts.join(String(params.separator ?? ', '));
      return { outputs: { text }, text };
    }
    case 'deepseek-refiner': {
      const raw = asText(inputs.text) || String(params.fallback ?? '');
      if (!raw.trim()) throw new ApiError('缺少原始提示词输入。');
      if (mode === 'live' && hasDeepSeekKey(settings)) {
        progress(18, '连接 DeepSeek…');
        const text = await refinePromptWithDeepSeek(
          settings,
          raw,
          String(params.instruction ?? ''),
          String(params.language ?? 'en') === 'zh' ? 'zh' : 'en',
          signal,
        );
        progress(100, '提示词优化完成');
        reportLive();
        log('DeepSeek 提示词优化完成。', 'success');
        return {
          outputs: { text, raw },
          text,
          meta: { provider: 'DeepSeek', model: settings.deepseekModel },
        };
      }
      if (mode === 'live' && !hasDeepSeekKey(settings)) {
        throw new ApiError('当前为真实执行模式，但未配置 DeepSeek API Key。');
      }
      const text = localRefinePrompt(raw, String(params.language ?? 'en'));
      reportSimulated();
      log('未配置 DeepSeek Key，使用本地规则模拟提示词优化（结果已标注）。', 'warn');
      return {
        outputs: { text, raw },
        text,
        simulated: true,
        meta: { provider: '本地规则模拟' },
      };
    }
    case 'style-preset': {
      reportLive();
      const base = asText(inputs.text);
      const style = String(params.style ?? 'cinematic');
      const strength = Number(params.strength ?? 70);
      const suffix = styleSuffix(style, strength);
      const text = `${base}${base ? ', ' : ''}${suffix}`;
      return { outputs: { text }, text, meta: { style, strength } };
    }
    case 'image-scale': {
      reportLive();
      if (!inputImage) throw new ApiError('缺少图像输入。');
      progress(20, '本地缩放中…');
      const image = await scaleImage(
        inputImage,
        Number(params.width ?? 768),
        Number(params.height ?? 768),
        (String(params.fit ?? 'cover') as 'stretch' | 'contain' | 'cover') ?? 'cover',
      );
      progress(100);
      return { outputs: { image }, images: [image] };
    }
    case 'image-crop': {
      reportLive();
      if (!inputImage) throw new ApiError('缺少图像输入。');
      progress(20, '本地裁剪中…');
      const image = await cropImage(
        inputImage,
        String(params.ratio ?? '1:1'),
        Number(params.zoom ?? 100),
        Number(params.offsetX ?? 0),
        Number(params.offsetY ?? 0),
      );
      progress(100);
      return { outputs: { image }, images: [image] };
    }
    case 'image-adjust': {
      reportLive();
      if (!inputImage) throw new ApiError('缺少图像输入。');
      progress(25, '本地调色中…');
      const image = await adjustImage(inputImage, {
        brightness: Number(params.brightness ?? 100),
        contrast: Number(params.contrast ?? 100),
        saturation: Number(params.saturation ?? 100),
        grayscale: Boolean(params.grayscale),
      });
      progress(100);
      return { outputs: { image }, images: [image] };
    }
    case 'checkpoint': {
      reportLive();
      const model = {
        name: String(params.model ?? ''),
        precision: String(params.precision ?? ''),
        source: 'checkpoint',
      };
      return {
        outputs: { model },
        text: `${model.name} · ${model.precision}`,
        meta: model,
      };
    }
    case 'lora': {
      reportLive();
      const model = inputs.model;
      if (!model) throw new ApiError('缺少模型输入。');
      return {
        outputs: {
          model: {
            ...(typeof model === 'object' ? model : { base: model }),
            lora: String(params.lora ?? ''),
            strength: Number(params.strength ?? 65),
          },
        },
        text: String(params.lora ?? ''),
      };
    }
    case 'agnes-image': {
      const prompt = promptInput || String(params.prompt ?? '');
      if (!prompt.trim()) throw new ApiError('缺少正向提示词，请在节点属性中填写或连接提示词节点。');
      const negative = negativeInput || String(params.negativePrompt ?? '');
      const width = Number(params.width ?? 1024);
      const height = Number(params.height ?? 1024);
      const count = Math.max(1, Math.min(4, Number(params.count ?? 1)));
      const seed = asNumber(inputs.seed) || Number(params.seed ?? 0);
      if (mode === 'live' && hasAgnesKey(settings)) {
        progress(10, '准备提交 Agnes 生成任务…');
        const images = await generateAgnesImages(settings, {
          prompt,
          negativePrompt: negative,
          image: inputImage,
          width,
          height,
          count,
          seed,
          signal,
          onProgress: (message, completed, total) => {
            progress(10 + Math.round((completed / Math.max(1, total)) * 85), message);
          },
        });
        reportLive();
        const size = normalizeAgnesSize(width, height);
        log(
          `Agnes 返回 ${images.length} 张图像（${size.label}，seed ${seed}）。`,
          'success',
        );
        return {
          outputs: { image: images[0], prompt, images },
          images,
          text: prompt,
          meta: {
            provider: 'Agnes',
            model: settings.agnesModel,
            size: size.label,
            seed,
            count: images.length,
          },
        };
      }
      if (mode === 'live' && !hasAgnesKey(settings)) {
        throw new ApiError('当前为真实执行模式，但未配置 Agnes API Key。');
      }
      progress(22, '生成演示图像…');
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      const images = Array.from({ length: count }, (_, index) =>
        makeMockImage(prompt, width, height, seed || 1, index),
      );
      progress(100, '演示图像已生成');
      reportSimulated();
      log(
        'Agnes Key 未配置或处于模拟模式：已生成带「SIMULATION」水印的演示图，未调用真实 API。',
        'warn',
      );
      return {
        outputs: { image: images[0], prompt, images },
        images,
        text: prompt,
        simulated: true,
        meta: { provider: '模拟器', simulated: true, size: `${width}×${height}`, seed },
      };
    }
    case 'ksampler': {
      const latent = asLatent(inputs.latent);
      const positive = asText(inputs.positive) || 'untitled';
      const seed = asNumber(inputs.seed) || Number(params.seed ?? 1);
      progress(15, '采样器模拟：构建潜空间…');
      await new Promise((resolve) => window.setTimeout(resolve, 360));
      const image = makeMockImage(
        positive,
        latent.width,
        latent.height,
        seed,
        Number(params.steps ?? 20),
      );
      reportSimulated();
      log('KSampler 以模拟模式运行；真实采样请配置 ComfyUI 并使用对应节点。', 'warn');
      return {
        outputs: { image },
        images: [image],
        simulated: true,
        meta: {
          steps: Number(params.steps ?? 0),
          cfg: Number(params.cfg ?? 0),
          sampler: String(params.sampler ?? ''),
          scheduler: String(params.scheduler ?? ''),
          seed,
          simulated: true,
        },
      };
    }
    case 'latent-empty': {
      reportLive();
      const latent = {
        width: Number(params.width ?? 1024),
        height: Number(params.height ?? 1024),
        batch: Number(params.batch ?? 1),
      };
      return {
        outputs: { latent },
        text: `${latent.width} × ${latent.height} · batch ${latent.batch}`,
        meta: latent,
      };
    }
    case 'seed': {
      reportLive();
      const value = params.randomize
        ? Math.floor(Math.random() * 999_999_999)
        : Number(params.seed ?? 0);
      return { outputs: { seed: value }, text: String(value), meta: { seed: value } };
    }
    case 'dimensions': {
      reportLive();
      const preset = String(params.preset ?? 'custom');
      let width = Number(params.width ?? 1024);
      let height = Number(params.height ?? 1024);
      if (preset !== 'custom' && preset.includes('x')) {
        const [presetWidth, presetHeight] = preset.split('x').map(Number);
        width = presetWidth || width;
        height = presetHeight || height;
      }
      return {
        outputs: { width, height },
        text: `${width} × ${height}`,
        meta: { width, height },
      };
    }
    case 'image-output': {
      reportLive();
      if (!inputImage) throw new ApiError('缺少图像输入。');
      progress(100);
      return {
        outputs: {},
        images: [inputImage],
        meta: {
          filename: String(params.filename ?? ''),
          format: String(params.format ?? 'png'),
        },
      };
    }
    case 'text-output': {
      reportLive();
      const text = asText(inputs.text);
      if (!text) throw new ApiError('缺少文本输入。');
      return { outputs: {}, text };
    }
    case 'comfyui-workflow': {
      if (!settings.comfyBaseUrl.trim()) {
        throw new ApiError(
          '未配置 ComfyUI 服务地址，请前往「设置 → API 接入」填写后再运行。',
        );
      }
      progress(5, '提交 ComfyUI 工作流…');
      const result = await runComfyWorkflow(settings, String(params.workflowJson ?? ''), {
        signal,
        timeoutMs: Number(params.timeout ?? 180),
        onProgress: (value, message) => progress(value, message),
      });
      reportLive();
      log(`ComfyUI 任务 ${result.promptId.slice(0, 8)} 完成，输出 ${result.images.length} 张图。`, 'success');
      if (!result.images.length) throw new ApiError('ComfyUI 任务完成但未返回图像。');
      return {
        outputs: {
          image: result.images[0],
          info: JSON.stringify(result.raw).slice(0, 4000),
          images: result.images,
        },
        images: result.images,
        text: result.promptId,
        meta: { provider: 'ComfyUI', promptId: result.promptId },
      };
    }
    case 'api-request': {
      progress(20, '发送 HTTP 请求…');
      const text = await callCustomApi(settings, {
        method: String(params.method ?? 'POST'),
        url: String(params.url ?? ''),
        headers: String(params.headers ?? '{}'),
        body: String(params.body ?? '{}'),
        input: inputs.payload ?? '',
        signal,
      });
      reportLive();
      return { outputs: { text }, text };
    }
    case 'character-card': {
      reportLive();
      const character = [
        `角色：${String(params.name ?? '未命名')}`,
        `外形与服装：${String(params.appearance ?? '')}`,
        `性格与气质：${String(params.personality ?? '')}`,
        `声音设定：${String(params.voice ?? '')}`,
      ].join('\n');
      const reference = asImage(inputs.image);
      return {
        outputs: { text: character, image: reference },
        images: reference ? [reference] : undefined,
        text: character,
        meta: { type: 'character-card', name: params.name },
      };
    }
    case 'storyboard-script': {
      reportLive();
      const premise = asText(inputs.premise) || '雨夜的天台，两个人擦肩而过。';
      const character = asText(inputs.character);
      const shots = Math.max(2, Math.min(12, Number(params.shots ?? 4)));
      const style = String(params.style ?? '');
      const genre = String(params.genre ?? '');
      const lines = Array.from({ length: shots }, (_, index) => {
        const n = index + 1;
        return `镜头 ${n}｜${index === 0 ? '建立场景' : index === shots - 1 ? '情绪落点' : '推进动作'}：${premise}`;
      });
      const script = [
        `# 分镜脚本（${genre} · ${shots} 镜）`,
        `统一画风：${style}`,
        character ? `角色参考：${character.split('\n')[0]}` : '',
        ...lines,
        params.notes ? `创作要求：${String(params.notes)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      return {
        outputs: { script },
        text: script,
        meta: { shots, genre, style, generator: '本地结构模板' },
      };
    }
    case 'shot-prompt': {
      reportLive();
      const script = asText(inputs.script);
      const character = asText(inputs.character);
      const shotSize = String(params.shotSize ?? 'medium');
      const camera = String(params.camera ?? 'static');
      const prompt = [
        script,
        character,
        `镜号 ${params.shotNumber ?? 1}`,
        `景别 ${shotSize}`,
        `机位 ${camera}`,
        String(params.lighting ?? ''),
        String(params.mood ?? ''),
        'cinematic composition, consistent character design, detailed environment',
      ]
        .filter(Boolean)
        .join(', ');
      return {
        outputs: { prompt },
        text: prompt,
        meta: { shot: params.shotNumber, shotSize, camera },
      };
    }
    case 'tts-voice': {
      const text = asText(inputs.text);
      if (!text.trim()) throw new ApiError('缺少台词文本。');
      const duration = Math.max(1, text.length / 5);
      reportSimulated();
      log('TTS 配音节点为结构预览：音频接口尚未接入，已返回时长占位。', 'warn');
      const audio: AudioAsset = {
        duration,
        simulated: true,
        label: `${String(params.voice ?? 'voice')} · ${String(params.emotion ?? 'neutral')}`,
      };
      return {
        outputs: { audio },
        audio: [audio],
        text,
        simulated: true,
        meta: { provider: '结构预览', voice: params.voice, speed: params.speed },
      };
    }
    case 'music-gen': {
      reportSimulated();
      const duration = Number(params.duration ?? 30);
      const audio: AudioAsset = {
        duration,
        simulated: true,
        label: `${String(params.genre ?? 'cinematic')} · ${Number(params.bpm ?? 72)} BPM`,
      };
      log('BGM 生成节点为结构预览：音乐 API 尚未接入。', 'warn');
      return {
        outputs: { audio },
        audio: [audio],
        simulated: true,
        meta: { provider: '结构预览', genre: params.genre, duration },
      };
    }
    case 'audio-load': {
      reportLive();
      const src = String(params.url ?? '').trim();
      if (!src) throw new ApiError('请先填写音频 URL。');
      const audio: AudioAsset = {
        src,
        duration: Number(params.duration ?? 0),
        label: String(params.label ?? '音频'),
      };
      return { outputs: { audio }, audio: [audio], text: audio.label };
    }
    case 'load-video': {
      reportLive();
      const src = String(params.url ?? '').trim();
      const duration = Number(params.duration ?? 4);
      if (src) {
        const video: VideoAsset = {
          src,
          width: 1280,
          height: 720,
          duration,
          fps: 24,
          provider: 'URL',
        };
        return { outputs: { video }, videos: [video], text: src };
      }
      const { video, poster } = makeSimulatedVideo(
        '视频素材占位',
        832,
        1216,
        duration,
        16,
        1,
      );
      reportSimulated();
      log('未填写视频 URL，返回结构预览。', 'warn');
      return { outputs: { video }, videos: [video], images: [poster], simulated: true };
    }
    case 'video-latent': {
      reportLive();
      const latent = {
        width: Number(params.width ?? 832),
        height: Number(params.height ?? 1216),
        frames: Number(params.frames ?? 33),
        fps: Number(params.fps ?? 16),
        batch: 1,
        kind: 'video',
      };
      return {
        outputs: { latent },
        text: `${latent.width} × ${latent.height} · ${latent.frames}f @ ${latent.fps}fps`,
        meta: latent,
      };
    }
    case 'wan-image-to-video':
    case 'wan-text-to-video': {
      const latent = asLatent(inputs.latent);
      const reference = asImage(inputs.image);
      const prompt =
        asText(inputs.prompt) ||
        String(params.prompt ?? '') ||
        'cinematic camera movement, consistent character';
      if (type === 'wan-image-to-video' && !reference) {
        throw new ApiError('Wan 图生视频需要首帧图片输入，或先使用图片载入/生成节点。');
      }
      progress(20, '准备视频结构预览…');
      const width = latent.width || 832;
      const height = latent.height || 1216;
      const duration = Number(params.duration ?? 5);
      const fps = Number(params.fps ?? 16);
      const seed = asNumber(inputs.seed) || Number(params.seed ?? 1);
      const { video, poster } = makeSimulatedVideo(
        prompt,
        width,
        height,
        duration,
        fps,
        seed,
        'Wan 结构预览',
      );
      reportSimulated();
      log('Wan 视频节点当前返回结构预览；真实生成需要配置视频 API 或 ComfyUI 工作流。', 'warn');
      return {
        outputs: { video },
        videos: [video],
        images: reference ? [reference, poster] : [poster],
        text: prompt,
        simulated: true,
        meta: { provider: 'Wan 结构预览', width, height, duration, fps, seed },
      };
    }
    case 'video-sampler': {
      if (!inputs.model) throw new ApiError('缺少模型输入。');
      if (!inputs.latent) throw new ApiError('缺少视频 Latent 输入。');
      const latent = asLatent(inputs.latent);
      const prompt = asText(inputs.positive) || 'untitled video';
      const seed = asNumber(inputs.seed) || Number(params.seed ?? 1);
      const width = latent.width || 832;
      const height = latent.height || 1216;
      const fps = latent.fps || Number(params.fps ?? 16);
      const { video, poster } = makeSimulatedVideo(
        prompt,
        width,
        height,
        latent.frames ? latent.frames / fps : 4,
        fps,
        seed,
        '视频采样器模拟',
      );
      reportSimulated();
      log('视频采样器为结构模拟；真实采样需要在 ComfyUI 中运行。', 'warn');
      return {
        outputs: { video },
        videos: [video],
        images: [poster],
        simulated: true,
        meta: { steps: params.steps, cfg: params.cfg, sampler: params.sampler, seed },
      };
    }
    case 'video-combine': {
      const inputVideo = asVideo(inputs.video);
      if (!inputVideo) throw new ApiError('缺少视频输入。');
      const audio = asAudio(inputs.audio);
      const output: VideoAsset = {
        ...inputVideo,
        width: inputVideo.width,
        height: inputVideo.height,
        duration: inputVideo.duration,
        fps: Number(params.fps ?? inputVideo.fps ?? 24),
        provider: '视频合成结构预览',
        simulated: true,
        filename: `combined.${String(params.format ?? 'mp4')}`,
      };
      reportSimulated();
      log(
        audio
          ? '视频合成结构预览：已接收音频，真实合成需要 ffmpeg / 视频服务。'
          : '视频合成结构预览：真实合成需要 ffmpeg / 视频服务。',
        'warn',
      );
      return {
        outputs: { video: output },
        videos: [output],
        images: output.poster ? [{ src: output.poster, alt: '视频合成预览' }] : undefined,
        simulated: true,
        meta: { fps: output.fps, format: params.format, codec: params.codec, crf: params.crf },
      };
    }
    case 'save-video': {
      const inputVideo = asVideo(inputs.video);
      if (!inputVideo) throw new ApiError('缺少视频输入。');
      const output: VideoAsset = {
        ...inputVideo,
        filename: `${String(params.filename ?? 'comfyui-video')}.${String(params.format ?? 'mp4')}`,
        mimeType: 'video/mp4',
      };
      reportSimulated();
      log('保存视频为结构节点：真实视频落盘需要视频服务或 ffmpeg。', 'warn');
      return {
        outputs: {},
        videos: [output],
        images: output.poster ? [{ src: output.poster, alt: '视频输出预览' }] : undefined,
        simulated: true,
        meta: { filename: output.filename, provider: output.provider },
      };
    }
    case 'video-output': {
      const inputVideo = asVideo(inputs.video);
      if (!inputVideo) throw new ApiError('缺少视频输入。');
      reportLive();
      return {
        outputs: {},
        videos: [inputVideo],
        images: inputVideo.poster
          ? [{ src: inputVideo.poster, alt: '视频首帧', simulated: inputVideo.simulated }]
          : undefined,
        meta: {
          duration: inputVideo.duration,
          fps: inputVideo.fps,
          size: `${inputVideo.width} × ${inputVideo.height}`,
          simulated: inputVideo.simulated,
        },
      };
    }
    case 'video-api': {
      const prompt = asText(inputs.prompt) || String(params.prompt ?? '');
      if (!prompt.trim()) throw new ApiError('请填写视频提示词。');
      const seed = asNumber(inputs.seed) || Number(params.seed ?? 1);
      const aspect = String(params.aspect ?? '9:16');
      const resolution = String(params.resolution ?? '720p');
      const longEdge = resolution === '1080p' ? 1920 : resolution === '480p' ? 854 : 1280;
      const dimensions =
        aspect === '16:9'
          ? { width: longEdge, height: Math.round((longEdge * 9) / 16) }
          : aspect === '1:1'
            ? { width: Math.round(longEdge * 0.75), height: Math.round(longEdge * 0.75) }
            : { width: Math.round((longEdge * 9) / 16), height: longEdge };
      const configured =
        settings.videoProvider !== 'none' &&
        Boolean(settings.videoApiKey.trim()) &&
        Boolean(settings.videoBaseUrl.trim()) &&
        Boolean(settings.videoModel.trim());
      if (mode === 'live' && configured) {
        progress(15, '提交视频生成任务…');
        const reference = asImage(inputs.image);
        const result = await generateVideoViaApi(
          settings,
          {
            prompt,
            negativePrompt: asText(inputs.negative) || String(params.negative ?? ''),
            imageUrl: reference?.src,
            width: dimensions.width,
            height: dimensions.height,
            duration: Number(params.duration ?? 5),
            fps: 24,
            seed,
            aspect,
            resolution,
            extraJson: String(params.requestJson ?? '{}'),
          },
          signal,
        );
        progress(92, '视频任务完成，准备预览…');
        const video: VideoAsset = {
          src: result.videoUrl,
          poster: result.poster,
          width: dimensions.width,
          height: dimensions.height,
          duration: Number(params.duration ?? 5),
          fps: 24,
          provider: result.provider,
          simulated: false,
        };
        reportLive();
        log(`视频 API 完成：${result.provider}`, 'success');
        return {
          outputs: { video },
          videos: [video],
          text: prompt,
          meta: {
            provider: result.provider,
            aspect,
            resolution,
            width: dimensions.width,
            height: dimensions.height,
          },
        };
      }
      if (mode === 'live' && settings.videoProvider !== 'none' && !configured) {
        throw new ApiError(
          '视频 API 配置不完整：请到设置 → 视频 API 填写 Key、Base URL 和模型，或把服务类型改为“未配置”以使用模拟预览。',
        );
      }
      const { video, poster } = makeSimulatedVideo(
        prompt,
        dimensions.width,
        dimensions.height,
        Number(params.duration ?? 5),
        24,
        seed,
        settings.videoProvider === 'none' ? '视频 API 结构预览' : '视频 API 未出网',
      );
      reportSimulated();
      log(
        settings.videoProvider === 'none'
          ? '视频 API 未配置：已返回带 SIMULATION 标记的结构预览。'
          : '当前为模拟模式：已返回结构预览，未调用视频 API。',
        'warn',
      );
      return {
        outputs: { video },
        videos: [video],
        images: [poster],
        simulated: true,
        text: prompt,
        meta: { provider: '视频 API 结构预览', aspect, duration: params.duration },
      };
    }
    case 'vae-loader': {
      reportLive();
      const vae = { name: String(params.model ?? 'wan-vae'), kind: 'vae' };
      return { outputs: { vae }, text: String(vae.name), meta: vae };
    }
    case 'vae-decode': {
      const latent = asLatent(inputs.latent);
      if (!inputs.vae) throw new ApiError('缺少 VAE 输入。');
      const poster = makeMockImage('VAE decode preview', latent.width, latent.height, 77, 2);
      reportSimulated();
      log('VAE 解码为结构预览；真实解码需要 ComfyUI。', 'warn');
      return {
        outputs: { image: poster },
        images: [poster],
        simulated: true,
        meta: { provider: 'VAE 结构预览', width: latent.width, height: latent.height },
      };
    }
    case 'ipadapter':
    case 'controlnet-apply': {
      if (!inputs.model) throw new ApiError('缺少模型输入。');
      if (!asImage(inputs.image)) throw new ApiError(type === 'ipadapter' ? '缺少角色参考图。' : '缺少控制图。');
      reportSimulated();
      log(
        type === 'ipadapter'
          ? 'IP-Adapter 为结构节点；真实角色一致性需要 ComfyUI + IP-Adapter。'
          : 'ControlNet 为结构节点；真实控制需要 ComfyUI + ControlNet。',
        'warn',
      );
      return {
        outputs: {
          model: {
            ...(typeof inputs.model === 'object' ? inputs.model : { base: inputs.model }),
            ...(type === 'ipadapter'
              ? { ipadapter: params.preset, weight: params.weight }
              : { controlnet: params.type, strength: params.strength }),
            structural: true,
          },
        },
        simulated: true,
        meta: { type, params },
      };
    }
    case 'face-lock': {
      const image = asImage(inputs.image);
      if (!image) throw new ApiError('缺少图像输入。');
      reportSimulated();
      log('角色面部锁定为结构预览；真实一致性需要人脸模型 / ComfyUI。', 'warn');
      return {
        outputs: { image },
        images: [image],
        simulated: true,
        meta: { mode: params.mode, strength: params.strength, provider: '结构预览' },
      };
    }
    case 'note':
    case 'group':
      return { outputs: {} };
    default:
      throw new ApiError(`节点类型「${type}」没有可用的执行器。`);
  }
}

/* ------------------------------------------------------------------ *
 *  Engine
 * ------------------------------------------------------------------ */

export async function runExecution(options: EngineOptions): Promise<EngineOutcome> {
  const { nodes, edges, settings, target, signal, callbacks, priorResults } = options;
  const targetIds = resolveTargets(nodes, edges, target);
  const warnings = validateGraph(nodes, edges, targetIds);
  const errors = warnings.filter((issue) => issue.severity === 'error');
  if (errors.length) {
    errors.forEach((issue) => callbacks.onLog({ level: 'error', message: issue.message, nodeId: issue.nodeId }));
    return {
      ok: false,
      stopped: false,
      error: errors[0].message,
      errorNodeId: errors[0].nodeId,
      completed: 0,
      total: targetIds.size,
      simulated: 0,
      live: 0,
    };
  }

  const { order } = topologicalOrder(nodes, edges);
  const orderSet = new Set(order);
  const runnable = order.filter(
    (nodeId) =>
      targetIds.has(nodeId) &&
      orderSet.has(nodeId) &&
      nodes.find((node) => node.id === nodeId)?.data.defType !== 'note' &&
      nodes.find((node) => node.id === nodeId)?.data.defType !== 'group',
  );

  if (!runnable.length) {
    return {
      ok: false,
      stopped: false,
      error: '没有可执行的节点。',
      completed: 0,
      total: 0,
      simulated: 0,
      live: 0,
    };
  }

  const results = new Map<string, NodeResult>();
  let simulated = 0;
  let live = 0;
  let completed = 0;
  let currentRunningNodeId: string | undefined;

  runnable.forEach((nodeId) => callbacks.onNodeStatus(nodeId, 'queued'));
  callbacks.onProgress(0, runnable.length);

  const checkAbort = () => {
    if (signal.aborted) {
      throw new DOMException('已停止执行', 'AbortError');
    }
  };

  for (const nodeId of runnable) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    if (signal.aborted) {
      if (currentRunningNodeId) callbacks.onNodeStatus(currentRunningNodeId, 'skipped');
      return {
        ok: false,
        stopped: true,
        completed,
        total: runnable.length,
        simulated,
        live,
      };
    }

    const definition = getNodeDefinition(node.data.defType);
    const incomingEdges = edges.filter((edge) => edge.target === nodeId);
    const inputs: Record<string, unknown> = {};
    let missingUpstream = '';
    for (const edge of incomingEdges) {
      const sourceResult = results.get(edge.source) ?? priorResults?.get(edge.source);
      const sourcePortId = edge.sourceHandle ?? edge.data?.sourcePort ?? '';
      if (!sourceResult) {
        const sourceNode = nodes.find((candidate) => candidate.id === edge.source);
        missingUpstream = `上游节点「${sourceNode?.data.label ?? edge.source}」没有可用结果，请先运行完整工作流。`;
        continue;
      }
      inputs[edge.targetHandle ?? edge.data?.targetPort ?? ''] =
        sourceResult.outputs[sourcePortId];
    }
    const requiredMissing = definition.inputs.find(
      (port) => port.required && inputs[port.id] === undefined,
    );
    if (missingUpstream || requiredMissing) {
      const message = missingUpstream || `节点「${node.data.label}」缺少必填输入「${requiredMissing?.label}」。`;
      callbacks.onNodeStatus(nodeId, 'error', { error: message });
      callbacks.onLog({ level: 'error', message, nodeId });
      return {
        ok: false,
        stopped: false,
        error: message,
        errorNodeId: nodeId,
        completed,
        total: runnable.length,
        simulated,
        live,
      };
    }

    const mode: 'live' | 'mock' = shouldUseLive(node, settings) ? 'live' : 'mock';
    const cacheKeyValue = cacheKey(node, inputs, mode, settings);
    const cached = settings.cacheEnabled ? nodeCache.get(cacheKeyValue) : undefined;
    if (cached) {
      results.set(nodeId, cached);
      const wasSimulated = Boolean(cached.simulated);
      if (wasSimulated) simulated += 1;
      else live += 1;
      completed += 1;
      callbacks.onNodeStatus(nodeId, 'success', {
        result: cached,
        cached: true,
        simulated: wasSimulated,
        error: undefined,
        durationMs: 0,
      });
      callbacks.onLog({ level: 'info', message: `命中缓存：${node.data.label}`, nodeId });
      callbacks.onProgress(completed, runnable.length, node);
      continue;
    }

    currentRunningNodeId = nodeId;
    const startedAt = performance.now();
    callbacks.onNodeStatus(nodeId, 'running', {
      error: undefined,
      result: undefined,
      cached: false,
      simulated: false,
      durationMs: undefined,
    });
    callbacks.onNodeProgress?.(nodeId, 2, '准备执行');
    callbacks.onLog({ level: 'info', message: `执行 ${node.data.label}…`, nodeId });

    let nodeSimulated = false;
    let nodeLive = false;
    const runtime: ExecutionRuntime = {
      params: node.data.params,
      inputs,
      settings,
      mode,
      signal,
      nodeId,
      nodeLabel: node.data.label,
      log: (message, level = 'info') => callbacks.onLog({ level, message, nodeId }),
      reportSimulated: () => {
        if (!nodeSimulated) {
          nodeSimulated = true;
          simulated += 1;
          callbacks.onSimulated(nodeId);
        }
      },
      reportLive: () => {
        if (!nodeLive) {
          nodeLive = true;
          live += 1;
          callbacks.onLive(nodeId);
        }
      },
      progress: (value, message) =>
        callbacks.onNodeProgress?.(nodeId, Math.max(0, Math.min(100, value)), message),
    };

    try {
      checkAbort();
      const result = await executeNode(runtime, node);
      checkAbort();
      const durationMs = performance.now() - startedAt;
      if (result.simulated) {
        runtime.reportSimulated();
      } else if (!nodeSimulated) {
        runtime.reportLive();
      }
      if (!nodeSimulated && !nodeLive) runtime.reportLive();
      results.set(nodeId, result);
      if (settings.cacheEnabled) {
        nodeCache.set(cacheKeyValue, result);
        if (nodeCache.size > MAX_CACHE_ENTRIES) {
          const oldestKey = nodeCache.keys().next().value;
          if (oldestKey) nodeCache.delete(oldestKey);
        }
      }
      completed += 1;
      callbacks.onNodeStatus(nodeId, 'success', {
        result,
        durationMs,
        cached: false,
        simulated: Boolean(result.simulated),
        error: undefined,
      });
      callbacks.onNodeProgress?.(nodeId, 100);
      callbacks.onLog({
        level: 'success',
        message: `${node.data.label} 完成 · ${Math.round(durationMs)} ms`,
        nodeId,
      });
      callbacks.onProgress(completed, runnable.length, node);
    } catch (error) {
      const aborted =
        signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError');
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '未知错误';
      if (aborted) {
        callbacks.onNodeStatus(nodeId, 'skipped');
        callbacks.onLog({ level: 'warn', message: '执行已停止。', nodeId });
        return {
          ok: false,
          stopped: true,
          completed,
          total: runnable.length,
          simulated,
          live,
        };
      }
      callbacks.onNodeStatus(nodeId, 'error', {
        error: message,
        durationMs: performance.now() - startedAt,
      });
      callbacks.onLog({ level: 'error', message, nodeId });
      return {
        ok: false,
        stopped: false,
        error: message,
        errorNodeId: nodeId,
        completed,
        total: runnable.length,
        simulated,
        live,
      };
    } finally {
      currentRunningNodeId = undefined;
    }
  }

  return {
    ok: true,
    stopped: false,
    completed,
    total: runnable.length,
    simulated,
    live,
  };
}
