import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { encodeGif, buildDefaultPalette } from '../src/gif-encoder.js';

function solidFrame(width, height, r, g, b, delayMs = 250) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { rgba, delayMs };
}

test('palette has 256 RGB colors (768 bytes)', () => {
  const pal = buildDefaultPalette();
  assert.equal(pal.length, 256 * 3);
});

test('encodeGif creates a valid multi-frame GIF89a binary', () => {
  const frames = [
    solidFrame(16, 12, 231, 186, 150, 200),
    solidFrame(16, 12, 51, 153, 204, 300),
    solidFrame(16, 12, 102, 204, 102, 400),
  ];
  const gif = encodeGif(frames, { width: 16, height: 12, loop: 0, dither: true });
  const header = Buffer.from(gif.slice(0, 6)).toString('ascii');
  assert.equal(header, 'GIF89a');
  assert.equal(gif[6] | (gif[7] << 8), 16);
  assert.equal(gif[8] | (gif[9] << 8), 12);
  assert.equal(gif[gif.length - 1], 0x3b);
  assert(gif.length > 800);
  // Write a sample file for optional external decoder check
  writeFileSync(new URL('./sample-output.gif', import.meta.url), gif);
});

test('encodeGif rejects empty frames or mismatched buffer size', () => {
  assert.throws(() => encodeGif([], { width: 8, height: 8 }));
  assert.throws(() =>
    encodeGif([{ rgba: new Uint8Array(10) }], { width: 8, height: 8 })
  );
});
