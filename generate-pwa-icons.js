const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = __dirname;
const BG = [245, 239, 229, 255];
const PANEL = [239, 229, 216, 255];
const ACCENT = [181, 92, 51, 255];
const ACCENT_SOFT = [181, 92, 51, 42];
const TEXT = [47, 36, 26, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filename, width, height, draw) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const [r, g, b, a] = draw(x, y, width, height);
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = a;
    }
  }

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ]);

  fs.writeFileSync(path.join(OUT_DIR, filename), png);
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insideCircle(x, y, cx, cy, radius) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function drawIcon(x, y, width, height) {
  let color = BG;

  const inset = width * 0.11;
  const panelLeft = inset;
  const panelTop = inset;
  const panelRight = width - inset;
  const panelBottom = height - inset;
  const panelRadius = width * 0.14;

  if (insideRoundedRect(x, y, panelLeft, panelTop, panelRight, panelBottom, panelRadius)) {
    color = PANEL;
  }

  const accentCx = width * 0.76;
  const accentCy = height * 0.24;
  const accentRadius = width * 0.145;
  if (insideCircle(x, y, accentCx, accentCy, accentRadius)) {
    color = ACCENT_SOFT;
  }

  const stemLeft = width * 0.28;
  const stemRight = width * 0.36;
  const stemTop = height * 0.25;
  const stemBottom = height * 0.73;
  if (x >= stemLeft && x <= stemRight && y >= stemTop && y <= stemBottom) {
    color = TEXT;
  }

  const diagA = { x: width * 0.34, y: height * 0.26 };
  const diagB = { x: width * 0.58, y: height * 0.58 };
  const thickness = width * 0.05;
  const lengthSq = (diagB.x - diagA.x) ** 2 + (diagB.y - diagA.y) ** 2;
  const t = ((x - diagA.x) * (diagB.x - diagA.x) + (y - diagA.y) * (diagB.y - diagA.y)) / lengthSq;
  if (t >= 0 && t <= 1) {
    const px = diagA.x + t * (diagB.x - diagA.x);
    const py = diagA.y + t * (diagB.y - diagA.y);
    if ((x - px) ** 2 + (y - py) ** 2 <= thickness ** 2) {
      color = TEXT;
    }
  }

  const archCx = width * 0.48;
  const archCy = height * 0.38;
  const archOuter = width * 0.13;
  const archInner = width * 0.08;
  const dx = x - archCx;
  const dy = y - archCy;
  const distSq = dx * dx + dy * dy;
  if (distSq <= archOuter * archOuter && distSq >= archInner * archInner && x >= archCx) {
    color = ACCENT;
  }

  return color;
}

[
  ["icon-180.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512]
].forEach(([filename, size]) => {
  writePng(filename, size, size, drawIcon);
});

