import type { AppSettings } from '../types/studio';
import { ApiError } from './api';

export interface VideoApiRequest {
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  seed: number;
  aspect: string;
  resolution: string;
  extraJson?: string;
}

export interface VideoApiResult {
  videoUrl: string;
  poster?: string;
  provider: string;
  raw: unknown;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function parseExtraJson(extraJson?: string): Record<string, unknown> {
  if (!extraJson?.trim()) return {};
  try {
    const value = JSON.parse(extraJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('必须是 JSON 对象');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    throw new ApiError(
      `视频高级参数不是合法的 JSON 对象：${error instanceof Error ? error.message : '解析失败'}`,
    );
  }
}

function isVideoUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && /\.(mp4|webm|mov|m3u8)(\?|#|$)/i.test(value);
}

function findUrl(value: unknown, kind: 'video' | 'image'): string | undefined {
  if (typeof value === 'string') {
    if (kind === 'video' ? isVideoUrl(value) : /^https?:\/\//i.test(value) && /\.(png|jpe?g|webp)(\?|#|$)/i.test(value)) {
      return value;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item, kind);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferred = [
      kind === 'video' ? 'video_url' : 'poster_url',
      kind === 'video' ? 'videoUrl' : 'posterUrl',
      kind === 'video' ? 'video' : 'poster',
      kind === 'video' ? 'output' : 'thumbnail',
      'url',
    ];
    for (const key of preferred) {
      if (key in record) {
        const found = findUrl(record[key], kind);
        if (found) return found;
      }
    }
    for (const child of Object.values(record)) {
      const found = findUrl(child, kind);
      if (found) return found;
    }
  }
  return undefined;
}

function authHeaders(provider: AppSettings['videoProvider'], key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: provider === 'fal' ? `Key ${key}` : `Bearer ${key}`,
  };
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 260);
    try {
      const parsed = JSON.parse(text);
      message =
        parsed?.error?.message ??
        parsed?.detail ??
        parsed?.message ??
        parsed?.error ??
        message;
    } catch {
      /* keep raw text */
    }
    throw new ApiError(`视频 API 请求失败（${response.status}）：${String(message)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError('视频 API 返回了无法解析的响应。');
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new ApiError('执行已停止。'));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new ApiError('执行已停止。'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

async function pollForVideo(
  fetchState: () => Promise<any>,
  signal: AbortSignal,
): Promise<any> {
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new ApiError('执行已停止。');
    const state = await fetchState();
    const status = String(
      state?.status ?? state?.state ?? state?.data?.status ?? '',
    ).toLowerCase();
    if (['failed', 'error', 'canceled', 'cancelled'].includes(status)) {
      throw new ApiError(
        `视频任务失败：${String(state?.error?.message ?? state?.error ?? state?.message ?? status)}`,
      );
    }
    if (
      findUrl(state, 'video') ||
      ['succeeded', 'success', 'completed', 'complete'].includes(status)
    ) {
      return state;
    }
    await sleep(2500, signal);
  }
  throw new ApiError('视频任务超时（8 分钟）。');
}

async function runFal(
  settings: AppSettings,
  request: VideoApiRequest,
  signal: AbortSignal,
): Promise<VideoApiResult> {
  const base = settings.videoBaseUrl.trim().replace(/\/+$/, '') || 'https://queue.fal.run';
  const model = settings.videoModel.trim();
  if (!model) throw new ApiError('请先在设置 → 视频 API 中填写 fal.ai 模型 ID。');
  const extra = parseExtraJson(request.extraJson);
  const input: Record<string, unknown> = {
    prompt: request.prompt,
    duration: String(request.duration),
    aspect_ratio: request.aspect,
    resolution: request.resolution,
    seed: request.seed,
    ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
    ...(request.imageUrl ? { image_url: request.imageUrl } : {}),
    ...extra,
  };
  const response = await fetch(joinUrl(base, model), {
    method: 'POST',
    headers: authHeaders('fal', settings.videoApiKey),
    body: JSON.stringify(input),
    signal,
  });
  const submitted = await readJson(response);
  const direct = findUrl(submitted, 'video');
  if (direct) {
    return {
      videoUrl: direct,
      poster: findUrl(submitted, 'image'),
      provider: 'fal.ai',
      raw: submitted,
    };
  }
  const statusUrl: string | undefined = submitted?.status_url;
  const responseUrl: string | undefined = submitted?.response_url;
  if (!statusUrl) {
    throw new ApiError('fal.ai 没有返回 status_url，无法继续轮询。');
  }
  const status = await pollStatus(statusUrl, 'fal', settings.videoApiKey, signal);
  const finalResponseUrl = responseUrl ?? status?.response_url;
  let finalData: any = status;
  if (finalResponseUrl) {
    const finalResponse = await fetch(finalResponseUrl, {
      headers: authHeaders('fal', settings.videoApiKey),
      signal,
    });
    finalData = await readJson(finalResponse);
  }
  const videoUrl = findUrl(finalData, 'video');
  if (!videoUrl) throw new ApiError('fal.ai 任务完成，但没有找到视频 URL。');
  return {
    videoUrl,
    poster: findUrl(finalData, 'image'),
    provider: 'fal.ai',
    raw: finalData,
  };
}

async function pollStatus(
  url: string,
  provider: AppSettings['videoProvider'],
  key: string,
  signal: AbortSignal,
): Promise<any> {
  return pollForVideo(async () => {
    const response = await fetch(url, {
      headers: authHeaders(provider, key),
      signal,
    });
    return readJson(response);
  }, signal);
}

async function runReplicate(
  settings: AppSettings,
  request: VideoApiRequest,
  signal: AbortSignal,
): Promise<VideoApiResult> {
  const base = settings.videoBaseUrl.trim().replace(/\/+$/, '') || 'https://api.replicate.com';
  const model = settings.videoModel.trim();
  if (!model) throw new ApiError('请先在设置 → 视频 API 中填写 Replicate 模型路径。');
  const extra = parseExtraJson(request.extraJson);
  const input: Record<string, unknown> = {
    prompt: request.prompt,
    duration: request.duration,
    aspect_ratio: request.aspect,
    resolution: request.resolution,
    seed: request.seed,
    ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
    ...(request.imageUrl ? { image: request.imageUrl } : {}),
    ...extra,
  };
  const response = await fetch(joinUrl(base, `v1/models/${model}/predictions`), {
    method: 'POST',
    headers: authHeaders('replicate', settings.videoApiKey),
    body: JSON.stringify({ input }),
    signal,
  });
  const submitted = await readJson(response);
  const direct = findUrl(submitted, 'video');
  if (direct) {
    return {
      videoUrl: direct,
      poster: findUrl(submitted, 'image'),
      provider: 'Replicate',
      raw: submitted,
    };
  }
  const getUrl: string | undefined = submitted?.urls?.get;
  if (!getUrl) throw new ApiError('Replicate 没有返回轮询 URL。');
  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new ApiError('执行已停止。');
    const pollResponse = await fetch(getUrl, {
      headers: authHeaders('replicate', settings.videoApiKey),
      signal,
    });
    const state = await readJson(pollResponse);
    const status = String(state?.status ?? '').toLowerCase();
    const videoUrl = findUrl(state, 'video');
    if (videoUrl) {
      return {
        videoUrl,
        poster: findUrl(state, 'image'),
        provider: 'Replicate',
        raw: state,
      };
    }
    if (status === 'failed' || status === 'canceled') {
      throw new ApiError(`Replicate 任务失败：${String(state?.error ?? status)}`);
    }
    if (status === 'succeeded') {
      throw new ApiError('Replicate 任务完成，但没有找到视频 URL。');
    }
    await sleep(2500, signal);
  }
  throw new ApiError('Replicate 视频任务超时。');
}

async function runCustom(
  settings: AppSettings,
  request: VideoApiRequest,
  signal: AbortSignal,
): Promise<VideoApiResult> {
  const base = settings.videoBaseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new ApiError('请先在设置 → 视频 API 中填写自定义接口 Base URL。');
  const extra = parseExtraJson(request.extraJson);
  const endpoint = /\/generate$/i.test(base) ? base : joinUrl(base, 'generate');
  const body = {
    model: settings.videoModel.trim() || 'video-model',
    prompt: request.prompt,
    negative_prompt: request.negativePrompt,
    image_url: request.imageUrl,
    width: request.width,
    height: request.height,
    duration: request.duration,
    fps: request.fps,
    seed: request.seed,
    aspect_ratio: request.aspect,
    resolution: request.resolution,
    ...extra,
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders('custom', settings.videoApiKey),
    body: JSON.stringify(body),
    signal,
  });
  const submitted = await readJson(response);
  const direct = findUrl(submitted, 'video');
  if (direct) {
    return {
      videoUrl: direct,
      poster: findUrl(submitted, 'image'),
      provider: '自定义视频 API',
      raw: submitted,
    };
  }
  const id = submitted?.id ?? submitted?.task_id ?? submitted?.job_id;
  const statusUrl =
    submitted?.status_url ??
    (id ? joinUrl(base, `status/${encodeURIComponent(String(id))}`) : undefined);
  if (!statusUrl) throw new ApiError('自定义接口没有返回视频 URL、任务 id 或 status_url。');
  const final = await pollStatus(statusUrl, 'custom', settings.videoApiKey, signal);
  const videoUrl = findUrl(final, 'video');
  if (!videoUrl) throw new ApiError('视频任务完成，但没有找到视频 URL。');
  return {
    videoUrl,
    poster: findUrl(final, 'image'),
    provider: '自定义视频 API',
    raw: final,
  };
}

export async function generateVideoViaApi(
  settings: AppSettings,
  request: VideoApiRequest,
  signal: AbortSignal,
): Promise<VideoApiResult> {
  if (!settings.videoApiKey.trim()) {
    throw new ApiError('视频 API Key 为空，请先到设置 → 视频 API 填写。');
  }
  switch (settings.videoProvider) {
    case 'fal':
      return runFal(settings, request, signal);
    case 'replicate':
      return runReplicate(settings, request, signal);
    case 'custom':
      return runCustom(settings, request, signal);
    default:
      throw new ApiError('未选择视频服务类型。');
  }
}
