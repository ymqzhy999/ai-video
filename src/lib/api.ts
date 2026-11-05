import type { AppSettings, ImageAsset } from '../types/studio';
import { normalizeAgnesSize, scaleImage } from './image';

export class ApiError extends Error {
  status?: number;
  details?: string;

  constructor(message: string, status?: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function hasAgnesKey(settings: AppSettings): boolean {
  return Boolean(settings.agnesApiKey.trim());
}

export function hasDeepSeekKey(settings: AppSettings): boolean {
  return Boolean(settings.deepseekApiKey.trim());
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(new Error('请求超时')), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (parentSignal?.aborted) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }
    throw new ApiError(
      '网络请求失败。Web 端可能被 CORS 拦截；可在设置中启用 FastAPI 后端代理，或在 iOS App 中直接请求。',
      undefined,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

async function parseError(response: Response): Promise<ApiError> {
  let details = '';
  try {
    const text = await response.text();
    details = text.slice(0, 800);
  } catch {
    details = response.statusText;
  }
  let message = details;
  try {
    const parsed = JSON.parse(details);
    message =
      parsed?.error?.message ??
      parsed?.message ??
      parsed?.error ??
      parsed?.detail ??
      details;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch {
    /* keep text */
  }
  return new ApiError(
    `API 返回 ${response.status}${message ? `：${message}` : ''}`,
    response.status,
    details,
  );
}

/* ------------------------------------------------------------------ *
 * DeepSeek
 * ------------------------------------------------------------------ */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function deepseekChat(
  settings: AppSettings,
  messages: ChatMessage[],
  options: {
    signal?: AbortSignal;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  if (!hasDeepSeekKey(settings)) {
    throw new ApiError('尚未配置 DeepSeek API Key。');
  }
  const payload = {
    model: settings.deepseekModel || 'deepseek-chat',
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 700,
    stream: false,
  };
  const timeout = options.timeoutMs ?? settings.requestTimeoutMs;
  const url = settings.useBackendProxy
    ? `${trimTrailingSlash(settings.backendBaseUrl)}/api/ai/deepseek`
    : `${trimTrailingSlash(settings.deepseekBaseUrl)}/chat/completions`;

  const response = settings.useBackendProxy
    ? await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.deepseekApiKey,
          },
          body: JSON.stringify({ baseUrl: settings.deepseekBaseUrl, payload }),
        },
        timeout,
        options.signal,
      )
    : await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.deepseekApiKey}`,
          },
          body: JSON.stringify(payload),
        },
        timeout,
        options.signal,
      );

  if (!response.ok) throw await parseError(response);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new ApiError('DeepSeek 返回了空内容。', undefined, JSON.stringify(data).slice(0, 500));
  }
  return content.trim().replace(/^["'“”]+|["'“”]+$/g, '');
}

export async function refinePromptWithDeepSeek(
  settings: AppSettings,
  prompt: string,
  instruction: string,
  language: 'en' | 'zh',
  signal?: AbortSignal,
): Promise<string> {
  const system =
    language === 'en'
      ? 'You are a senior prompt engineer for text-to-image diffusion models. Follow the user instruction exactly. Return only the final prompt, no preamble, no quotes.'
      : '你是资深 AI 图像提示词工程师。严格遵循用户指令，只输出最终提示词，不要解释、不要引号。';
  return deepseekChat(
    settings,
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `${instruction}\n\nOriginal prompt:\n${prompt}`,
      },
    ],
    { signal, maxTokens: 650, temperature: 0.65 },
  );
}

export async function testDeepSeekConnection(settings: AppSettings): Promise<string> {
  const content = await deepseekChat(
    settings,
    [{ role: 'user', content: 'Reply with exactly: CONNECTED' }],
    { maxTokens: 12, temperature: 0, timeoutMs: 30000 },
  );
  return content;
}

/* ------------------------------------------------------------------ *
 * Agnes
 * ------------------------------------------------------------------ */

interface AgnesOptions {
  prompt: string;
  negativePrompt?: string;
  image?: ImageAsset | string | null;
  width: number;
  height: number;
  count: number;
  seed?: number;
  signal?: AbortSignal;
  onProgress?: (message: string, completed: number, total: number) => void;
}

export async function generateAgnesImages(
  settings: AppSettings,
  options: AgnesOptions,
): Promise<ImageAsset[]> {
  if (!hasAgnesKey(settings)) {
    throw new ApiError('尚未配置 Agnes API Key。');
  }
  const size = normalizeAgnesSize(options.width, options.height);
  const count = Math.max(1, Math.min(4, Math.round(options.count)));
  const images: ImageAsset[] = [];
  const reference =
    typeof options.image === 'string' ? options.image : options.image?.src ?? undefined;
  const prompt = options.negativePrompt
    ? `${options.prompt}\n\nNegative prompt: ${options.negativePrompt}`
    : options.prompt;

  for (let index = 0; index < count; index += 1) {
    if (options.signal?.aborted) throw new DOMException('已停止执行', 'AbortError');
    options.onProgress?.(`正在请求第 ${index + 1}/${count} 张图像…`, index, count);
    const payload: Record<string, unknown> = {
      model: settings.agnesModel || 'agnes-image-2.0-flash',
      prompt,
      size: `${size.width}x${size.height}`,
      return_base64: true,
      extra_body: { response_format: 'b64_json' },
    };
    if (reference) {
      payload.extra_body = {
        ...(payload.extra_body as Record<string, unknown>),
        image: [reference],
      };
    }
    const url = settings.useBackendProxy
      ? `${trimTrailingSlash(settings.backendBaseUrl)}/api/ai/agnes`
      : `${trimTrailingSlash(settings.agnesBaseUrl)}/images/generations`;
    const response = settings.useBackendProxy
      ? await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': settings.agnesApiKey,
            },
            body: JSON.stringify({ baseUrl: settings.agnesBaseUrl, payload }),
          },
          settings.requestTimeoutMs,
          options.signal,
        )
      : await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${settings.agnesApiKey}`,
            },
            body: JSON.stringify(payload),
          },
          settings.requestTimeoutMs,
          options.signal,
        );
    if (!response.ok) throw await parseError(response);
    const data = await response.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    if (!items.length) {
      throw new ApiError('Agnes 未返回图像。', undefined, JSON.stringify(data).slice(0, 600));
    }
    for (const [itemIndex, item] of items.entries()) {
      let src = item?.url as string | undefined;
      if (!src && item?.b64_json) {
        src = `data:image/png;base64,${item.b64_json}`;
      }
      if (!src) continue;
      images.push({
        src,
        width: size.width,
        height: size.height,
        mime: 'image/png',
        alt: `Agnes 生成图像 ${images.length + 1}`,
        revisedPrompt: typeof item?.revised_prompt === 'string' ? item.revised_prompt : undefined,
        filename: `agnes-${Date.now()}-${index + itemIndex}`,
        simulated: false,
      });
    }
    if (!images.length) {
      throw new ApiError('Agnes 响应中没有可用的图像地址。');
    }
    options.onProgress?.(`第 ${index + 1}/${count} 张完成`, index + 1, count);
  }

  // Agnes may return a smaller output than requested (for example 832×1248
  // for a 1024×1536 request). Normalize the files locally so downloads and
  // downstream nodes always receive the dimensions configured in the node.
  const targetWidth = Math.max(256, Math.min(2048, Math.round(options.width)));
  const targetHeight = Math.max(256, Math.min(2048, Math.round(options.height)));
  if (images.length) {
    options.onProgress?.(
      `正在调整输出尺寸至 ${targetWidth} × ${targetHeight}…`,
      count,
      count,
    );
    for (let index = 0; index < images.length; index += 1) {
      try {
        const resized = await scaleImage(images[index], targetWidth, targetHeight, 'cover');
        images[index] = {
          ...images[index],
          ...resized,
          alt: images[index].alt,
          filename: images[index].filename,
          revisedPrompt: images[index].revisedPrompt,
          simulated: false,
        };
      } catch {
        // If the upstream image is CORS-protected, keep it rather than failing
        // the whole generation. The generated metadata still records the
        // intended export size.
      }
      options.onProgress?.(
        `输出尺寸 ${index + 1}/${images.length} 已完成`,
        count,
        count,
      );
    }
  }
  return images;
}

export async function testAgnesKey(settings: AppSettings): Promise<string> {
  if (!settings.agnesApiKey.trim()) throw new ApiError('请先填写 Agnes API Key。');
  const url = settings.useBackendProxy
    ? `${trimTrailingSlash(settings.backendBaseUrl)}/api/ai/agnes/check`
    : `${trimTrailingSlash(settings.agnesBaseUrl)}/images/generations`;
  const response = settings.useBackendProxy
    ? await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.agnesApiKey,
          },
          body: JSON.stringify({ baseUrl: settings.agnesBaseUrl }),
        },
        15000,
      )
    : await fetchWithTimeout(
        url,
        {
          method: 'OPTIONS',
          headers: {
            Authorization: `Bearer ${settings.agnesApiKey}`,
            'Access-Control-Request-Method': 'POST',
          },
        },
        12000,
      );
  if (settings.useBackendProxy) {
    if (!response.ok) throw await parseError(response);
    return '后端代理可用';
  }
  if (response.status >= 500) throw await parseError(response);
  return '密钥格式已填写，端点可访问（实际生成时验证权限）';
}

/* ------------------------------------------------------------------ *
 * ComfyUI
 * ------------------------------------------------------------------ */

interface ComfyResult {
  images: ImageAsset[];
  raw: Record<string, unknown>;
  promptId: string;
}

export async function runComfyWorkflow(
  settings: AppSettings,
  workflowJson: string,
  options: {
    signal?: AbortSignal;
    timeoutMs: number;
    onProgress?: (value: number, message: string) => void;
  },
): Promise<ComfyResult> {
  if (!settings.comfyBaseUrl.trim()) {
    throw new ApiError('未配置 ComfyUI 服务地址，请前往「设置 → API 接入」填写。');
  }
  let workflow: Record<string, unknown>;
  try {
    workflow = JSON.parse(workflowJson);
  } catch {
    throw new ApiError('ComfyUI 工作流不是合法 JSON。');
  }
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    throw new ApiError('ComfyUI 工作流必须是 API 格式的 JSON 对象。');
  }
  if (!Object.keys(workflow).length) {
    throw new ApiError('ComfyUI 工作流为空，请粘贴 API 格式工作流。');
  }
  const base = trimTrailingSlash(settings.comfyBaseUrl);
  const clientId = crypto.randomUUID();
  const timeout = Math.max(10, options.timeoutMs) * 1000;
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(new Error('ComfyUI 任务超时')), timeout);

  let socket: WebSocket | null = null;
  try {
    const response = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      signal: controller.signal,
    });
    if (!response.ok) throw await parseError(response);
    const submission = await response.json();
    if (submission?.node_errors && Object.keys(submission.node_errors).length) {
      throw new ApiError('ComfyUI 校验失败。', undefined, JSON.stringify(submission.node_errors));
    }
    const promptId = String(submission?.prompt_id ?? '');
    if (!promptId) throw new ApiError('ComfyUI 未返回 prompt_id。');
    options.onProgress?.(12, `任务已提交 · ${promptId.slice(0, 8)}`);

    try {
      const websocketUrl = `${base.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`;
      socket = new WebSocket(websocketUrl);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message?.type === 'progress' && message.data?.max) {
            const value = 15 + Math.round((message.data.value / message.data.max) * 65);
            options.onProgress?.(
              Math.min(80, value),
              `采样中 ${message.data.value}/${message.data.max}`,
            );
          }
          if (message?.type === 'executing' && message.data?.node === null) {
            options.onProgress?.(88, '节点执行完成，读取结果…');
          }
        } catch {
          /* ignore malformed socket frames */
        }
      };
    } catch {
      /* WebSocket is optional; polling below is the fallback */
    }

    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (controller.signal.aborted) throw new DOMException('已停止执行', 'AbortError');
      await new Promise((resolve) => window.setTimeout(resolve, 1300));
      const historyResponse = await fetch(`${base}/history/${encodeURIComponent(promptId)}`, {
        signal: controller.signal,
      });
      if (!historyResponse.ok) continue;
      const history = await historyResponse.json();
      const entry = history?.[promptId];
      if (!entry) {
        options.onProgress?.(25, '等待 ComfyUI 队列…');
        continue;
      }
      if (entry.status?.status_str === 'error') {
        throw new ApiError('ComfyUI 执行失败。', undefined, JSON.stringify(entry.status).slice(0, 800));
      }
      const images: ImageAsset[] = [];
      Object.values(entry.outputs ?? {}).forEach((output) => {
        const record = output as { images?: Array<Record<string, unknown>> };
        (record.images ?? []).forEach((image) => {
          if (typeof image.filename !== 'string') return;
          const params = new URLSearchParams({
            filename: image.filename,
            subfolder: typeof image.subfolder === 'string' ? image.subfolder : '',
            type: typeof image.type === 'string' ? image.type : 'output',
          });
          images.push({
            src: `${base}/view?${params.toString()}`,
            alt: image.filename,
            filename: image.filename,
            simulated: false,
          });
        });
      });
      options.onProgress?.(100, 'ComfyUI 输出已获取');
      return { images, raw: entry, promptId };
    }
    throw new ApiError(`ComfyUI 任务在 ${Math.round(timeout / 1000)} 秒内未完成。`);
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    socket?.close();
  }
}

/* ------------------------------------------------------------------ *
 * Custom API + backend
 * ------------------------------------------------------------------ */

export async function callCustomApi(
  settings: AppSettings,
  options: {
    method: string;
    url: string;
    headers: string;
    body: string;
    input?: unknown;
    signal?: AbortSignal;
  },
): Promise<string> {
  if (!/^https?:\/\//i.test(options.url)) {
    throw new ApiError('URL 必须以 http:// 或 https:// 开头。');
  }
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    if (options.headers.trim()) headers = { ...headers, ...JSON.parse(options.headers) };
  } catch {
    throw new ApiError('请求头不是合法 JSON。');
  }
  let body: string | undefined;
  if (options.method !== 'GET') {
    const interpolated = options.body.replaceAll(
      '{{input}}',
      typeof options.input === 'string' ? options.input : JSON.stringify(options.input ?? ''),
    );
    try {
      JSON.parse(interpolated);
    } catch {
      throw new ApiError('请求体不是合法 JSON。');
    }
    body = interpolated;
  }
  const response = await fetchWithTimeout(
    options.url,
    {
      method: options.method,
      headers,
      body,
    },
    settings.requestTimeoutMs,
    options.signal,
  );
  if (!response.ok) throw await parseError(response);
  return await response.text();
}

export async function checkBackend(settings: AppSettings): Promise<boolean> {
  if (!settings.backendBaseUrl.trim()) return false;
  try {
    const response = await fetchWithTimeout(
      `${trimTrailingSlash(settings.backendBaseUrl)}/api/health`,
      { method: 'GET' },
      5000,
    );
    return response.ok;
  } catch {
    return false;
  }
}
