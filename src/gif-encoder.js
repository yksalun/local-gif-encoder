/**
 * local-gif-encoder — Zero-dependency browser & Node.js GIF89a encoder.
 * Encodes RGBA frames (Uint8ClampedArray / Uint8Array) entirely on-device
 * with 6x6x6 + grayscale 256-color quantization, optional Floyd-Steinberg
 * dithering, standard variable-width LZW compression, and NETSCAPE2.0 looping.
 *
 * MIT License — built as a clean standalone demo for local-first media tools.
 */

const PALETTE_SIZE = 256;

/**
 * Build a fixed 256-color palette:
 * - Indices 0..215: 6x6x6 uniform RGB color cube (216 colors)
 * - Indices 216..255: 40-step grayscale ramp (fills neutral tones cleanly)
 */
export function buildDefaultPalette() {
  const palette = new Uint8Array(PALETTE_SIZE * 3);
  let offset = 0;
  const levels = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette[offset++] = levels[r];
        palette[offset++] = levels[g];
        palette[offset++] = levels[b];
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const v = Math.round((i / 39) * 255);
    palette[offset++] = v;
    palette[offset++] = v;
    palette[offset++] = v;
  }
  return palette;
}

/**
 * Map an RGB triplet to the nearest color index in our 256-color palette.
 */
function nearestPaletteIndex(r, g, b, palette) {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));

  // Fast candidate in 6x6x6 cube
  const ri = Math.round(cr / 51);
  const gi = Math.round(cg / 51);
  const bi = Math.round(cb / 51);
  let bestIdx = ri * 36 + gi * 6 + bi;
  let dr = cr - palette[bestIdx * 3];
  let dg = cg - palette[bestIdx * 3 + 1];
  let db = cb - palette[bestIdx * 3 + 2];
  let bestDist = dr * dr + dg * dg + db * db;

  // Also check nearest grayscale ramp entry for subtle neutrals
  if (Math.max(cr, cg, cb) - Math.min(cr, cg, cb) < 28) {
    const lum = Math.round(0.299 * cr + 0.587 * cg + 0.114 * cb);
    const grayIdx = 216 + Math.round((lum / 255) * 39);
    const gr = cr - palette[grayIdx * 3];
    const gg = cg - palette[grayIdx * 3 + 1];
    const gb = cb - palette[grayIdx * 3 + 2];
    const grayDist = gr * gr + gg * gg + gb * gb;
    if (grayDist < bestDist) {
      bestIdx = grayIdx;
    }
  }
  return bestIdx;
}

/**
 * Quantize RGBA pixels into 8-bit palette indices, with optional Floyd-Steinberg dithering.
 */
export function quantizeFrame(rgba, width, height, palette, dither = true) {
  const count = width * height;
  const indices = new Uint8Array(count);
  if (!dither) {
    for (let i = 0; i < count; i++) {
      const p = i * 4;
      indices[i] = nearestPaletteIndex(rgba[p], rgba[p + 1], rgba[p + 2], palette);
    }
    return indices;
  }

  const buf = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const a = rgba[p + 3] / 255;
    // Composite over dark neutral backdrop (#121212) for transparent pixels
    buf[i * 3] = rgba[p] * a + 18 * (1 - a);
    buf[i * 3 + 1] = rgba[p + 1] * a + 18 * (1 - a);
    buf[i * 3 + 2] = rgba[p + 2] * a + 18 * (1 - a);
  }

  const spread = (x, y, er, eg, eb, weight) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const k = (y * width + x) * 3;
    buf[k] += er * weight;
    buf[k + 1] += eg * weight;
    buf[k + 2] += eb * weight;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const k = i * 3;
      const idx = nearestPaletteIndex(buf[k], buf[k + 1], buf[k + 2], palette);
      indices[i] = idx;
      const er = buf[k] - palette[idx * 3];
      const eg = buf[k + 1] - palette[idx * 3 + 1];
      const eb = buf[k + 2] - palette[idx * 3 + 2];
      spread(x + 1, y, er, eg, eb, 7 / 16);
      spread(x - 1, y + 1, er, eg, eb, 3 / 16);
      spread(x, y + 1, er, eg, eb, 5 / 16);
      spread(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return indices;
}

/**
 * Standard GIF variable-width LZW encoder (minCodeSize = 8 for 256-color palettes).
 */
function lzwEncode(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;

  const bytes = [];
  let bitBuf = 0;
  let bitCount = 0;

  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuf & 0xff);
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  // Use a flat Map keyed by (prefix << 8) | pixel for speed
  let dict = new Map();
  const reset = () => {
    dict = new Map();
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
  };

  emit(clearCode);
  if (indices.length > 0) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const hit = dict.get(key);
      if (hit !== undefined) {
        prefix = hit;
      } else {
        emit(prefix);
        if (nextCode < 4096) {
          dict.set(key, nextCode++);
          if (nextCode > 1 << codeSize && codeSize < 12) {
            codeSize++;
          }
        } else {
          emit(clearCode);
          reset();
        }
        prefix = k;
      }
    }
    emit(prefix);
  }
  emit(eoiCode);
  if (bitCount > 0) {
    bytes.push(bitBuf & 0xff);
  }
  return bytes;
}

function writeSubBlocks(out, data) {
  let pos = 0;
  while (pos < data.length) {
    const chunkLen = Math.min(255, data.length - pos);
    out.push(chunkLen);
    for (let i = 0; i < chunkLen; i++) {
      out.push(data[pos + i]);
    }
    pos += chunkLen;
  }
  out.push(0x00); // Block terminator
}

/**
 * Encode one or more RGBA frames into a binary GIF89a Uint8Array.
 *
 * @param {Array<{ rgba: Uint8ClampedArray | Uint8Array, delayMs?: number }>} frames
 * @param {{ width: number, height: number, defaultDelayMs?: number, loop?: number, dither?: boolean }} options
 * @returns {Uint8Array}
 */
export function encodeGif(frames, options) {
  const {
    width,
    height,
    defaultDelayMs = 500,
    loop = 0, // 0 = loop forever
    dither = true,
  } = options || {};

  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('encodeGif requires at least one frame.');
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('encodeGif requires positive integer width and height.');
  }

  const palette = buildDefaultPalette();
  const out = [];

  const pushU16 = (v) => {
    out.push(v & 0xff, (v >> 8) & 0xff);
  };

  // Header: GIF89a
  out.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // Logical Screen Descriptor
  pushU16(width);
  pushU16(height);
  out.push(0xf7); // Global Color Table flag=1, color res=7, sort=0, size=7 (256 colors)
  out.push(0x00); // Background color index
  out.push(0x00); // Pixel aspect ratio

  // Global Color Table (256 * 3 bytes)
  for (let i = 0; i < palette.length; i++) {
    out.push(palette[i]);
  }

  // NETSCAPE 2.0 Application Extension (looping)
  if (loop >= 0) {
    out.push(
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
      0x03, 0x01
    );
    pushU16(loop & 0xffff);
    out.push(0x00);
  }

  // Frames
  for (const frame of frames) {
    if (!frame?.rgba || frame.rgba.length !== width * height * 4) {
      throw new Error(`Each frame rgba buffer must have length width * height * 4 (${width * height * 4}).`);
    }
    const delayCs = Math.max(2, Math.round((frame.delayMs ?? defaultDelayMs) / 10));

    // Graphic Control Extension
    out.push(0x21, 0xf9, 0x04, 0x04); // dispose=1 (do not dispose), no transparency
    pushU16(delayCs);
    out.push(0x00, 0x00);

    // Image Descriptor
    out.push(0x2c);
    pushU16(0); // left
    pushU16(0); // top
    pushU16(width);
    pushU16(height);
    out.push(0x00); // no local color table, not interlaced

    // Image Data (LZW min code size = 8)
    const indices = quantizeFrame(frame.rgba, width, height, palette, dither);
    out.push(8);
    writeSubBlocks(out, lzwEncode(indices, 8));
  }

  // GIF Trailer
  out.push(0x3b);
  return new Uint8Array(out);
}
