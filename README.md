# local-gif-encoder

A clean, zero-dependency JavaScript GIF89a encoder that turns RGBA buffers or HTML5 Canvas frames into animated GIFs completely on-device — no server uploads, no FFmpeg WASM download, and no watermarks.

- **Live interactive demo (GitHub Pages)**: [https://yksalun.github.io/local-gif-encoder/](https://yksalun.github.io/local-gif-encoder/)
- **Full watermark-free web studio**: [Liofx Photo to GIF Converter](https://liofx.com/photo-to-gif) (multi-photo transitions, reverse/ping-pong loops, custom canvas ratios, and [15 free on-device creative tools](https://liofx.com/free-tools))

## Features

- **Zero runtime dependencies** — plain ES module (~250 lines) running in modern browsers and Node.js 18+.
- **256-color hybrid palette** — 6×6×6 RGB cube (216 colors) + 40-step neutral grayscale ramp.
- **Optional Floyd-Steinberg dithering** for cleaner tonal transitions on photographic frames.
- **Standard GIF89a LZW compression** with dynamic code width (9–12 bits), clear-code resets, and `NETSCAPE2.0` looping extension.
- **Privacy-first** — user photos never leave browser RAM.

## Quick Usage

```js
import { encodeGif } from './src/gif-encoder.js';

// Supply one or more RGBA Uint8ClampedArray / Uint8Array frames of identical width x height
const gifBytes = encodeGif(
  [
    { rgba: frame1ImageData.data, delayMs: 400 },
    { rgba: frame2ImageData.data, delayMs: 400 },
  ],
  {
    width: 360,
    height: 240,
    loop: 0,      // 0 = loop forever
    dither: true, // Floyd-Steinberg error diffusion
  }
);

// Browser download
const url = URL.createObjectURL(new Blob([gifBytes], { type: 'image/gif' }));
```

## API

### `encodeGif(frames, options): Uint8Array`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `width` | `number` | required | Frame width in pixels |
| `height` | `number` | required | Frame height in pixels |
| `defaultDelayMs` | `number` | `500` | Fallback per-frame duration in milliseconds |
| `loop` | `number` | `0` | Repeat count (`0` = infinite loop, `-1` = omit NETSCAPE2.0 block) |
| `dither` | `boolean` | `true` | Enable Floyd-Steinberg error diffusion |

Each item in `frames` is `{ rgba: Uint8ClampedArray | Uint8Array, delayMs?: number }` with `rgba.length === width * height * 4`.

## Running Tests

```bash
npm test
```

## License

MIT
