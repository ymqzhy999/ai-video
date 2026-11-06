import type { ImageAsset } from '../types/studio';
import { downloadBlob, safeFilename } from './format';
import { saveImageToGallery, type FileDelivery } from './files';

const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;
const MAX_EDGE = 1600;

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片载入失败，可能是格式不支持或跨域限制。'));
    image.src = src;
  });
}

function canvasToAsset(
  canvas: HTMLCanvasElement,
  mime = 'image/png',
  quality = 0.92,
  extra: Partial<ImageAsset> = {},
): ImageAsset {
  return {
    src: canvas.toDataURL(mime, quality),
    width: canvas.width,
    height: canvas.height,
    mime,
    ...extra,
  };
}

export async function readImageFile(file: File): Promise<ImageAsset> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('图片超过 14 MB，请压缩后再试。');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });
  const image = await loadImageElement(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale >= 1) {
    return {
      src: dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      mime: file.type,
      filename: file.name,
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前设备无法处理图片。');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvasToAsset(canvas, mime, 0.9, { filename: file.name });
}

export async function scaleImage(
  source: ImageAsset | string,
  width: number,
  height: number,
  fit: 'stretch' | 'contain' | 'cover',
): Promise<ImageAsset> {
  const src = typeof source === 'string' ? source : source.src;
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建画布。');
  context.fillStyle = '#0b0d10';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (fit === 'stretch') {
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = canvas.width / canvas.height;
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    if ((fit === 'cover' && sourceRatio > targetRatio) || (fit === 'contain' && sourceRatio < targetRatio)) {
      drawHeight = canvas.height;
      drawWidth = drawHeight * sourceRatio;
    } else {
      drawWidth = canvas.width;
      drawHeight = drawWidth / sourceRatio;
    }
    context.drawImage(
      image,
      (canvas.width - drawWidth) / 2,
      (canvas.height - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  }
  return canvasToAsset(canvas, 'image/png');
}

function ratioValue(ratio: string): number {
  const [width, height] = ratio.split(':').map(Number);
  return width && height ? width / height : 1;
}

export async function cropImage(
  source: ImageAsset | string,
  ratio: string,
  zoomPercent: number,
  offsetXPercent: number,
  offsetYPercent: number,
): Promise<ImageAsset> {
  const src = typeof source === 'string' ? source : source.src;
  const image = await loadImageElement(src);
  const targetRatio = ratioValue(ratio);
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const zoom = Math.max(1, zoomPercent / 100);

  let cropWidth = image.naturalWidth;
  let cropHeight = image.naturalHeight;
  if (sourceRatio > targetRatio) {
    cropWidth = image.naturalHeight * targetRatio;
  } else {
    cropHeight = image.naturalWidth / targetRatio;
  }
  cropWidth /= zoom;
  cropHeight /= zoom;

  const freeX = image.naturalWidth - cropWidth;
  const freeY = image.naturalHeight - cropHeight;
  const cropX = Math.min(freeX, Math.max(0, freeX / 2 + (freeX / 2) * (offsetXPercent / 100)));
  const cropY = Math.min(freeY, Math.max(0, freeY / 2 + (freeY / 2) * (offsetYPercent / 100)));

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建画布。');
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
  return canvasToAsset(canvas, 'image/png');
}

export async function adjustImage(
  source: ImageAsset | string,
  options: {
    brightness: number;
    contrast: number;
    saturation: number;
    grayscale: boolean;
  },
): Promise<ImageAsset> {
  const src = typeof source === 'string' ? source : source.src;
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('无法创建画布。');
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = frame.data;
  const brightness = options.brightness / 100;
  const contrast = options.contrast / 100;
  const saturation = options.saturation / 100;

  for (let index = 0; index < pixels.length; index += 4) {
    let red = pixels[index];
    let green = pixels[index + 1];
    let blue = pixels[index + 2];
    red = (red - 128) * contrast + 128;
    green = (green - 128) * contrast + 128;
    blue = (blue - 128) * contrast + 128;
    red *= brightness;
    green *= brightness;
    blue *= brightness;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    red = luminance + (red - luminance) * saturation;
    green = luminance + (green - luminance) * saturation;
    blue = luminance + (blue - luminance) * saturation;
    if (options.grayscale) {
      red = luminance;
      green = luminance;
      blue = luminance;
    }
    pixels[index] = Math.max(0, Math.min(255, red));
    pixels[index + 1] = Math.max(0, Math.min(255, green));
    pixels[index + 2] = Math.max(0, Math.min(255, blue));
  }
  context.putImageData(frame, 0, 0);
  return canvasToAsset(canvas, 'image/png');
}

export function normalizeAgnesSize(width: number, height: number): {
  width: number;
  height: number;
  label: string;
} {
  const ratio = width / Math.max(1, height);
  if (ratio > 1.15) return { width: 1024, height: 768, label: '1024 × 768' };
  if (ratio < 0.72) return { width: 1024, height: 1536, label: '1024 × 1536' };
  if (ratio < 0.92) return { width: 768, height: 1024, label: '768 × 1024' };
  return { width: 1024, height: 1024, label: '1024 × 1024' };
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_PALETTES = [
  ['#171129', '#3f2a67', '#8b7dff', '#f5a623'],
  ['#0d1b1e', '#134e4a', '#38d6d0', '#b07cff'],
  ['#1c0f16', '#4a1d35', '#f472b6', '#f5a623'],
  ['#111a24', '#1e3a5f', '#5b9dff', '#4ade80'],
];

export function makeMockImage(
  prompt: string,
  width: number,
  height: number,
  seed: number,
  variant = 0,
): ImageAsset {
  const canvasWidth = Math.max(256, Math.min(2048, Math.round(width)));
  const canvasHeight = Math.max(256, Math.min(2048, Math.round(height)));
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建模拟画布。');

  const random = mulberry32(seed + variant * 9973);
  const palette = MOCK_PALETTES[Math.floor(random() * MOCK_PALETTES.length)];
  const background = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  background.addColorStop(0, palette[0]);
  background.addColorStop(0.55, palette[1]);
  background.addColorStop(1, palette[0]);
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let index = 0; index < 8; index += 1) {
    const radius = 80 + random() * canvasWidth * 0.42;
    const x = random() * canvasWidth;
    const y = random() * canvasHeight;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `${palette[index % 2 === 0 ? 2 : 3]}55`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.translate(canvasWidth * 0.5, canvasHeight * 0.46);
  for (let index = 0; index < 6; index += 1) {
    context.save();
    context.rotate((random() - 0.5) * 1.8);
    context.strokeStyle = `${palette[(index + 1) % palette.length]}99`;
    context.lineWidth = 1 + random() * 2;
    context.beginPath();
    const startX = (random() - 0.5) * canvasWidth * 0.9;
    const startY = (random() - 0.5) * canvasHeight * 0.6;
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      startX + 80,
      startY - 100,
      startX + 180,
      startY + 140,
      startX + 320,
      startY + 20,
    );
    context.stroke();
    context.restore();
  }
  context.restore();

  context.save();
  context.globalAlpha = 0.12;
  for (let index = 0; index < 1800; index += 1) {
    context.fillStyle = index % 2 ? '#ffffff' : '#000000';
    context.fillRect(random() * canvasWidth, random() * canvasHeight, 1.3, 1.3);
  }
  context.restore();

  context.strokeStyle = 'rgba(255,255,255,.18)';
  context.lineWidth = 1;
  context.strokeRect(22.5, 22.5, canvasWidth - 45, canvasHeight - 45);

  context.fillStyle = 'rgba(8,9,12,.72)';
  const labelWidth = Math.min(280, canvasWidth - 64);
  context.fillRect(32, 32, labelWidth, 42);
  context.fillStyle = '#f5a623';
  context.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText('SIMULATION · 模拟输出', 48, 58);

  context.fillStyle = 'rgba(8,9,12,.75)';
  const promptBoxHeight = 102;
  context.fillRect(32, canvasHeight - 32 - promptBoxHeight, canvasWidth - 64, promptBoxHeight);
  context.fillStyle = 'rgba(255,255,255,.52)';
  context.font = '500 11px -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText('PROMPT PREVIEW', 48, canvasHeight - 110);
  context.fillStyle = 'rgba(255,255,255,.82)';
  context.font = '400 14px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  wrapCanvasText(context, prompt || '未填写提示词', 48, canvasHeight - 86, canvasWidth - 96, 22, 2);

  return {
    src: canvas.toDataURL('image/jpeg', 0.86),
    width: canvasWidth,
    height: canvasHeight,
    mime: 'image/jpeg',
    simulated: true,
    alt: '模拟生成结果（非真实 AI 图像）',
  };
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let lineIndex = 0;
  for (let index = 0; index < words.length; index += 1) {
    const testLine = line ? `${line} ${words[index]}` : words[index];
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y + lineIndex * lineHeight);
      line = words[index];
      lineIndex += 1;
      if (lineIndex >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }
  if (lineIndex < maxLines) {
    context.fillText(line + (lineIndex === maxLines - 1 ? '…' : ''), x, y + lineIndex * lineHeight);
  }
}

export async function downloadImage(asset: ImageAsset, filename: string, format: string): Promise<FileDelivery | null> {
  const extension = format === 'jpeg' ? 'jpg' : format;
  const name = `${safeFilename(filename, 'comfyui-output')}.${extension}`;
  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  try {
    const image = await loadImageElement(asset.src);
    const width = Math.max(1, Math.round(asset.width ?? image.naturalWidth));
    const height = Math.max(1, Math.round(asset.height ?? image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas unavailable');
    if (mime === 'image/jpeg') {
      context.fillStyle = '#0a0c10';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, format === 'png' ? undefined : 0.94),
    );
    if (!blob) throw new Error('image encoding failed');
    return await saveImageToGallery(blob, name, mime);
  } catch {
    try {
      if (asset.src.startsWith('data:')) {
        const response = await fetch(asset.src);
        const blob = await response.blob();
        return await saveImageToGallery(blob, name, mime);
      }
      const response = await fetch(asset.src, { mode: 'cors' });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      return await saveImageToGallery(blob, name, mime);
    } catch {
      window.open(asset.src, '_blank', 'noopener,noreferrer');
      return null;
    }
  }
}
