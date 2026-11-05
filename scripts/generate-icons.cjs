#!/usr/bin/env node
/**
 * Generate the app icon, splash screens and PWA icons without native image
 * dependencies. Pure JS raster -> PNG encoder (zlib).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');

/* ----------------------------- PNG encoder ----------------------------- */

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------------- Raster tools ---------------------------- */

function createCanvas(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function blendPixel(canvas, x, y, [r, g, b], alpha = 1) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const index = (y * canvas.width + x) * 4;
  const data = canvas.data;
  const a = Math.min(1, alpha);
  const dstA = data[index + 3] / 255;
  const outA = a + dstA * (1 - a);
  data[index] = Math.round((r * a + data[index] * dstA * (1 - a)) / (outA || 1));
  data[index + 1] = Math.round((g * a + data[index + 1] * dstA * (1 - a)) / (outA || 1));
  data[index + 2] = Math.round((b * a + data[index + 2] * dstA * (1 - a)) / (outA || 1));
  data[index + 3] = Math.round(outA * 255);
}

function drawDisc(canvas, cx, cy, radius, color, alpha = 1) {
  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + radius + 1));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const coverage = Math.max(0, Math.min(1, radius + 0.6 - distance));
      if (coverage > 0) blendPixel(canvas, x, y, color, alpha * coverage);
    }
  }
}

function drawGlow(canvas, cx, cy, radius, color, strength = 0.5) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius;
      if (distance >= 1) continue;
      const falloff = (1 - distance) ** 2.2;
      blendPixel(canvas, x, y, color, falloff * strength);
    }
  }
}

function drawSegment(canvas, x1, y1, x2, y2, width, color, alpha = 1) {
  const radius = width / 2;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 1));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(x1, x2) + radius + 1));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 1));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(y1, y2) + radius + 1));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / lengthSq));
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      const distance = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      const coverage = Math.max(0, Math.min(1, radius + 0.5 - distance));
      if (coverage > 0) blendPixel(canvas, x, y, color, alpha * coverage);
    }
  }
}

function drawRing(canvas, cx, cy, radius, thickness, color, alpha = 1) {
  const extent = radius + thickness / 2 + 2;
  const minX = Math.max(0, Math.floor(cx - extent));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + extent));
  const minY = Math.max(0, Math.floor(cy - extent));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + extent));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const edge = Math.max(0, Math.min(1, thickness / 2 + 0.5 - Math.abs(distance - radius)));
      if (edge > 0) blendPixel(canvas, x, y, color, alpha * edge);
    }
  }
}

function bezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

function drawBezier(canvas, p0, p1, p2, p3, width, color, alpha) {
  let previous = p0;
  for (let index = 1; index <= 140; index += 1) {
    const point = bezier(p0, p1, p2, p3, index / 140);
    drawSegment(canvas, previous.x, previous.y, point.x, point.y, width, color, alpha);
    previous = point;
  }
}

/* ----------------------------- Background ------------------------------ */

function renderBackground(canvas, splash = false) {
  const { width, height } = canvas;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      const distance = Math.hypot(nx - 0.5, ny - 0.44);
      const glow = Math.max(0, 1 - distance / 0.68) ** 2.1;
      const bottom = Math.min(1, ny * 0.4 + 0.2);
      let r = 10 + glow * 19 - bottom * 3;
      let g = 12 + glow * 15 - bottom * 3;
      let b = 17 + glow * 34 - bottom * 4;
      const index = (y * width + x) * 4;
      canvas.data[index] = Math.max(0, Math.min(255, Math.round(r)));
      canvas.data[index + 1] = Math.max(0, Math.min(255, Math.round(g)));
      canvas.data[index + 2] = Math.max(0, Math.min(255, Math.round(b)));
      canvas.data[index + 3] = 255;
    }
  }

  // Dot grid (subtle technical texture)
  const step = splash ? Math.round(width / 44) : Math.round(width / 30);
  const dotRadius = Math.max(1, width / 900);
  for (let y = step; y < height; y += step) {
    for (let x = step; x < width; x += step) {
      drawDisc(canvas, x, y, dotRadius, [148, 137, 255], 0.1);
    }
  }

  // Outer inset line
  const inset = width * (splash ? 0.16 : 0.075);
  const line = Math.max(1, width / 800);
  for (let x = inset; x < width - inset; x += 1) {
    blendPixel(canvas, x, inset, [255, 255, 255], 0.025 * line);
    blendPixel(canvas, x, height - inset, [255, 255, 255], 0.025 * line);
  }
  for (let y = inset; y < height - inset; y += 1) {
    blendPixel(canvas, inset, y, [255, 255, 255], 0.025 * line);
    blendPixel(canvas, width - inset, y, [255, 255, 255], 0.025 * line);
  }
}

function renderMark(canvas, scale = 1, splash = false) {
  const size = Math.min(canvas.width, canvas.height);
  const cx = canvas.width * 0.5;
  const cy = canvas.height * (splash ? 0.5 : 0.48);
  const unit = size * (splash ? 0.3 : 0.39) * scale;
  const nodeA = { x: cx - unit * 0.72, y: cy - unit * 0.62 };
  const nodeB = { x: cx + unit * 0.02, y: cy + unit * 0.02 };
  const nodeC = { x: cx + unit * 0.73, y: cy + unit * 0.65 };

  // Ambient rings
  drawRing(canvas, cx, cy, unit * 1.95, Math.max(1, size / 900), [139, 125, 255], 0.09);
  drawRing(canvas, cx, cy, unit * 1.55, Math.max(1, size / 1100), [139, 125, 255], 0.055);

  // Glows
  drawGlow(canvas, nodeA.x, nodeA.y, unit * 1.05, [245, 166, 35], 0.28);
  drawGlow(canvas, nodeB.x, nodeB.y, unit * 1.1, [139, 125, 255], 0.32);
  drawGlow(canvas, nodeC.x, nodeC.y, unit * 1.05, [139, 125, 255], 0.24);

  const lineWidth = Math.max(2, unit * 0.105);
  // Wide soft under-stroke
  drawBezier(
    canvas,
    nodeA,
    { x: cx + unit * 0.55, y: cy - unit * 0.7 },
    { x: cx - unit * 0.5, y: cy + unit * 0.75 },
    nodeC,
    lineWidth * 3.4,
    [100, 86, 226],
    0.18,
  );
  drawBezier(
    canvas,
    nodeA,
    { x: cx + unit * 0.55, y: cy - unit * 0.7 },
    { x: cx - unit * 0.5, y: cy + unit * 0.75 },
    nodeC,
    lineWidth,
    [154, 142, 255],
    0.9,
  );
  drawBezier(
    canvas,
    nodeA,
    { x: cx + unit * 0.55, y: cy - unit * 0.7 },
    { x: cx - unit * 0.5, y: cy + unit * 0.75 },
    nodeC,
    lineWidth * 0.25,
    [226, 221, 255],
    0.8,
  );

  // Outer ring nodes with dark core and bright centers
  const outerRadius = unit * 0.285;
  drawDisc(canvas, nodeA.x, nodeA.y, outerRadius, [20, 18, 27], 1);
  drawRing(canvas, nodeA.x, nodeA.y, outerRadius - lineWidth * 0.5, lineWidth, [245, 166, 35], 0.96);
  drawDisc(canvas, nodeA.x, nodeA.y, outerRadius * 0.28, [255, 205, 120], 0.95);

  drawDisc(canvas, nodeB.x, nodeB.y, outerRadius * 0.7, [17, 16, 26], 1);
  drawRing(canvas, nodeB.x, nodeB.y, outerRadius * 0.7 - lineWidth * 0.5, lineWidth * 0.82, [167, 156, 255], 0.7);
  drawDisc(canvas, nodeB.x, nodeB.y, outerRadius * 0.14, [235, 231, 255], 0.9);

  drawDisc(canvas, nodeC.x, nodeC.y, outerRadius, [20, 18, 27], 1);
  drawRing(canvas, nodeC.x, nodeC.y, outerRadius - lineWidth * 0.5, lineWidth, [139, 125, 255], 0.96);
  drawDisc(canvas, nodeC.x, nodeC.y, outerRadius * 0.28, [201, 193, 255], 0.95);

  // Tiny specular dots on outer nodes
  drawDisc(canvas, nodeA.x - outerRadius * 0.35, nodeA.y - outerRadius * 0.35, lineWidth * 0.32, [255, 240, 214], 0.8);
  drawDisc(canvas, nodeC.x - outerRadius * 0.35, nodeC.y - outerRadius * 0.35, lineWidth * 0.32, [237, 233, 255], 0.8);
}

/* ------------------------------- Resize -------------------------------- */

function downsample(source, factor) {
  const width = source.width / factor;
  const height = source.height / factor;
  const output = createCanvas(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const index = ((y * factor + sy) * source.width + (x * factor + sx)) * 4;
          r += source.data[index];
          g += source.data[index + 1];
          b += source.data[index + 2];
          a += source.data[index + 3];
        }
      }
      const count = factor * factor;
      const out = (y * width + x) * 4;
      output.data[out] = Math.round(r / count);
      output.data[out + 1] = Math.round(g / count);
      output.data[out + 2] = Math.round(b / count);
      output.data[out + 3] = Math.round(a / count);
    }
  }
  return output;
}

function resizeBilinear(source, targetWidth, targetHeight) {
  const output = createCanvas(targetWidth, targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = (y / (targetHeight - 1)) * (source.height - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(source.height - 1, y0 + 1);
    const wy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = (x / (targetWidth - 1)) * (source.width - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(source.width - 1, x0 + 1);
      const wx = sx - x0;
      const out = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const p00 = source.data[(y0 * source.width + x0) * 4 + channel];
        const p10 = source.data[(y0 * source.width + x1) * 4 + channel];
        const p01 = source.data[(y1 * source.width + x0) * 4 + channel];
        const p11 = source.data[(y1 * source.width + x1) * 4 + channel];
        const top = p00 + (p10 - p00) * wx;
        const bottom = p01 + (p11 - p01) * wx;
        output.data[out + channel] = Math.round(top + (bottom - top) * wy);
      }
    }
  }
  return output;
}

/* -------------------------------- Build -------------------------------- */

function writePng(canvas, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(canvas.width, canvas.height, canvas.data));
  console.log('wrote', path.relative(root, file), `${canvas.width}x${canvas.height}`);
}

function generateIcon() {
  const scale = 2;
  const base = createCanvas(1024 * scale, 1024 * scale);
  renderBackground(base);
  renderMark(base, 1, false);
  return downsample(base, scale);
}

const icon = generateIcon();

writePng(icon, path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
writePng(icon, path.join(root, 'public/icons/icon-1024.png'));
writePng(resizeBilinear(icon, 512, 512), path.join(root, 'public/icons/icon-512.png'));
writePng(resizeBilinear(icon, 192, 192), path.join(root, 'public/icons/icon-192.png'));
writePng(resizeBilinear(icon, 180, 180), path.join(root, 'public/icons/icon-180.png'));

// Splash: draw at 1366 and upscale to 2732 for a soft high-res look.
const splashBase = createCanvas(1366, 1366);
renderBackground(splashBase, true);
renderMark(splashBase, 1, true);
const splash = resizeBilinear(splashBase, 2732, 2732);
const splashDir = path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset');
writePng(splash, path.join(splashDir, 'splash-2732x2732.png'));
writePng(splash, path.join(splashDir, 'splash-2732x2732-1.png'));
writePng(splash, path.join(splashDir, 'splash-2732x2732-2.png'));


// Android launcher icons + splash screens.
const androidRoot = path.join(root, 'android/app/src/main/res');
if (fs.existsSync(androidRoot)) {
  const mipmaps = {
    'mipmap-mdpi': { icon: 48, foreground: 108 },
    'mipmap-hdpi': { icon: 72, foreground: 162 },
    'mipmap-xhdpi': { icon: 96, foreground: 216 },
    'mipmap-xxhdpi': { icon: 144, foreground: 324 },
    'mipmap-xxxhdpi': { icon: 192, foreground: 432 },
  };
  Object.entries(mipmaps).forEach(([folder, sizes]) => {
    const dir = path.join(androidRoot, folder);
    if (!fs.existsSync(dir)) return;
    writePng(resizeBilinear(icon, sizes.icon, sizes.icon), path.join(dir, 'ic_launcher.png'));
    writePng(resizeBilinear(icon, sizes.icon, sizes.icon), path.join(dir, 'ic_launcher_round.png'));
    writePng(resizeBilinear(icon, sizes.foreground, sizes.foreground), path.join(dir, 'ic_launcher_foreground.png'));
  });

  const splashSizes = [
    ['drawable', 480, 320],
    ['drawable-land-mdpi', 480, 320],
    ['drawable-land-hdpi', 800, 480],
    ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960],
    ['drawable-land-xxxhdpi', 1920, 1280],
    ['drawable-port-mdpi', 320, 480],
    ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600],
    ['drawable-port-xxxhdpi', 1280, 1920],
  ];
  splashSizes.forEach(([folder, width, height]) => {
    const dir = path.join(androidRoot, folder);
    if (!fs.existsSync(dir)) return;
    const canvas = createCanvas(width, height);
    renderBackground(canvas, true);
    renderMark(canvas, 1, true);
    writePng(canvas, path.join(dir, 'splash.png'));
  });
}

// Brand SVG used by the web favicon.
const brandSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0" stop-color="#1a1730"/>
      <stop offset="1" stop-color="#090b0f"/>
    </radialGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5a623"/>
      <stop offset="1" stop-color="#8b7dff"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bg)"/>
  <circle cx="32" cy="32" r="24" fill="none" stroke="#8b7dff" stroke-opacity=".12"/>
  <path d="M20 22 C 36 18, 26 44, 44 42" fill="none" stroke="url(#line)" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
  <circle cx="20" cy="22" r="7" fill="#141220" stroke="#f5a623" stroke-width="2.6"/>
  <circle cx="20" cy="22" r="1.7" fill="#ffd285"/>
  <circle cx="44" cy="42" r="7" fill="#141220" stroke="#8b7dff" stroke-width="2.6"/>
  <circle cx="44" cy="42" r="1.7" fill="#d8d3ff"/>
  <circle cx="32" cy="31" r="3.2" fill="#141220" stroke="#a79cff" stroke-width="2"/>
</svg>`;
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/brand.svg'), brandSvg);
console.log('wrote public/brand.svg');
