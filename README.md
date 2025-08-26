# Wi‑Fi Strength & Speed (React + Tailwind)

A modern, accessible, no-backend Wi‑Fi strength and speed indicator inspired by fast.com. Built with React, Vite, Tailwind, and Framer Motion.

## Features
- Clean mobile‑first UI with animated metrics and progress
- Wi‑Fi bars and circular capacity gauge
- Download Mbps, Ping ms, and quality classification
- Download Mbps, Upload Mbps, Ping ms, and quality classification
- Uses Network Information API when available
- Lightweight ping test to `/favicon.ico`
- Optional real download test via `speedTestUrl` (streaming fetch)
- Accessible (aria, high contrast, respects reduced motion)

## Getting Started

1. Install dependencies
```bash
npm i
```

2. Start dev server
```bash
npm run dev
```

3. Build for production
```bash
npm run build && npm run preview
```

### Configure a real speed test file (recommended)

By default the app uses Cloudflare's test endpoint (≈100MB):

- Default URL in `src/App.jsx`: `https://speed.cloudflare.com/__down?bytes=104857600`

To override, create a `.env` file:

```
VITE_SPEED_TEST_URL=https://speed.cloudflare.com/__down?bytes=209715200
```

Tips:
- Use 50–200MB for better accuracy.
- Ensure CORS is allowed and caching is disabled.
- Larger and longer tests yield steadier results.

### Enable real upload testing (optional)

By default upload is simulated. To run a real upload test, point to an endpoint that accepts POST uploads and allows CORS:

```
VITE_UPLOAD_TEST_URL=https://your-api.example.com/upload-test
```

Notes:
- The endpoint should accept arbitrary binary POST bodies and ideally discard them server-side.
- Streaming upload is used for ~3.5s; throughput is computed client-side.
- Many public endpoints throttle or block large uploads; for reliable results, host your own endpoint or CDN worker.

## Component API

```jsx
<WifiStrength
  onComplete={(metrics) => { console.log(metrics) }}
  speedTestUrl="https://example.com/large-file.bin"
  uploadTestUrl="https://example.com/upload-endpoint"
/>
```
- `onComplete(metrics)` — callback with final results
- `speedTestUrl?` — optional URL to a large file or CDN object for real download test; otherwise simulated with `navigator.connection.downlink` as a hint.
- `uploadTestUrl?` — optional URL that accepts POST for real upload test; otherwise simulated.

## Notes
- Network Information API is not supported in all browsers; the app degrades gracefully.
- For accurate download measurements, provide a `speedTestUrl` served with CORS enabled and cache disabled.
