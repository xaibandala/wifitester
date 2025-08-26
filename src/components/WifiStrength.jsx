import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }
function getPercentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a,b)=>a-b)
  const idx = clamp(Math.floor((p/100) * (sorted.length - 1)), 0, sorted.length - 1)
  return sorted[idx]
}

function classifyQuality({ downlink = 0, rtt = 0, pingMs = 0 }) {
  // Prefer measured ping; fall back to rtt. Combine with downlink.
  const ping = pingMs || rtt || 0
  const score = (clamp(downlink, 0, 100) / 100) * 0.6 + (clamp(200 - ping, 0, 200) / 200) * 0.4
  const pct = Math.round(score * 100)
  let label = 'Poor', color = 'poor'
  if (pct >= 80) { label = 'Excellent'; color = 'good' }
  else if (pct >= 60) { label = 'Good'; color = 'good' }
  else if (pct >= 40) { label = 'Fair'; color = 'fair' }
  else { label = 'Poor'; color = 'poor' }
  return { pct, label, color }
}

async function pingTest(url = '/favicon.ico', count = 5) {
  const results = []
  for (let i = 0; i < count; i++) {
    const start = performance.now()
    try {
      await fetch(`${url}?_=${Date.now()}-${i}`, { cache: 'no-store', mode: 'no-cors' })
      const end = performance.now()
      results.push(end - start)
    } catch (_) {
      results.push(1000)
    }
  }
  results.sort((a,b)=>a-b)
  const median = results[Math.floor(results.length/2)]
  const avg = results.reduce((a,b)=>a+b,0)/results.length
  return { median, avg }
}

async function downloadTest(url, maxSeconds = 10, parallel = 6, warmupSec = 2, bucketMs = 250, percentile = 'p95') {
  if (!url) return { mbps: 0, seconds: 0, bytes: 0, ended: true }
  const start = performance.now()
  const deadline = start + maxSeconds * 1000
  let totalBytes = 0
  const buckets = new Map()
  const makeStream = async (idx) => {
    const ctrl = new AbortController()
    const u = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}-${idx}`
    try {
      const res = await fetch(u, { cache: 'no-store', signal: ctrl.signal })
      const reader = res.body?.getReader()
      if (!reader) return
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        const now = performance.now()
        if (!document.hidden) {
          const bucket = Math.floor((now - start) / bucketMs)
          buckets.set(bucket, (buckets.get(bucket) || 0) + value.byteLength)
        }
        if (now >= deadline) { try { ctrl.abort() } catch {} ; break }
      }
    } catch (_) { /* ignore */ }
  }
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, (_, i) => makeStream(i)))
  const seconds = Math.max((performance.now() - start) / 1000, 0.2)
  // Compute per-bucket Mbps, excluding warmup
  const warmupBuckets = Math.floor((warmupSec * 1000) / bucketMs)
  const rates = []
  for (const [b, bytes] of buckets) {
    if (b >= warmupBuckets) {
      const mbpsB = (bytes * 8) / 1e6 / (bucketMs / 1000)
      rates.push(mbpsB)
    }
  }
  let mbps = 0
  if (rates.length) {
    if (percentile === 'peak') mbps = Math.max(...rates)
    else mbps = getPercentile(rates, 95)
  } else {
    mbps = (totalBytes * 8) / 1e6 / seconds
  }
  return { mbps: Math.max(0, mbps), seconds, bytes: totalBytes, ended: true }
}

// Attempt a streaming upload using ReadableStream body for ~maxSeconds with optional parallelism
async function uploadTest(url, maxSeconds = 10, parallel = 4, warmupSec = 2, bucketMs = 250, percentile = 'p95') {
  if (!url) return { mbps: 0, seconds: 0, bytes: 0, ended: true }
  const start = performance.now()
  const deadline = start + maxSeconds * 1000
  let totalBytes = 0
  const buckets = new Map()
  const chunkSize = 64 * 1024
  const makeBody = () => new ReadableStream({
    pull(controller) {
      const now = performance.now()
      if (now >= deadline) { controller.close(); return }
      const chunk = new Uint8Array(chunkSize)
      controller.enqueue(chunk)
      totalBytes += chunk.byteLength
      if (!document.hidden) {
        const bucket = Math.floor((now - start) / bucketMs)
        buckets.set(bucket, (buckets.get(bucket) || 0) + chunk.byteLength)
      }
    }
  })
  const send = async (idx) => {
    try {
      await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}-${idx}`,
        { method: 'POST', body: makeBody(), headers: { 'Content-Type': 'application/octet-stream' }, cache: 'no-store', keepalive: false })
    } catch (_) { /* ignore */ }
  }
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, (_, i) => send(i)))
  const seconds = Math.max((performance.now() - start) / 1000, 0.2)
  const warmupBuckets = Math.floor((warmupSec * 1000) / bucketMs)
  const rates = []
  for (const [b, bytes] of buckets) {
    if (b >= warmupBuckets) {
      const mbpsB = (bytes * 8) / 1e6 / (bucketMs / 1000)
      rates.push(mbpsB)
    }
  }
  let mbps = 0
  if (rates.length) {
    if (percentile === 'peak') mbps = Math.max(...rates)
    else mbps = getPercentile(rates, 95)
  } else {
    mbps = (totalBytes * 8) / 1e6 / seconds
  }
  return { mbps: Math.max(0, mbps), seconds, bytes: totalBytes, ended: true }
}

function useAnimatedNumber(value, duration = 800) {
  const [display, setDisplay] = useState(value)
  const raf = useRef(null)
  const start = useRef(0)
  const from = useRef(value)
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) { setDisplay(value); return }
    from.current = display
    start.current = performance.now()
    const tick = (t) => {
      const p = clamp((t - start.current) / duration, 0, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from.current + (value - from.current) * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return display
}

export default function WifiStrength({ onComplete, speedTestUrl, uploadTestUrl, durationSec = 10, parallelStreams = 6, passes = 2, warmupSec = 2, bucketMs = 250, percentile = 'p95' }) {
  const [isTesting, setIsTesting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [downloadMbps, setDownloadMbps] = useState(0)
  const [uploadMbps, setUploadMbps] = useState(0)
  const [pingMs, setPingMs] = useState(0)
  const [capacityPct, setCapacityPct] = useState(0)
  const [info, setInfo] = useState({ effectiveType: undefined, downlink: 0, rtt: 0 })
  const [provider, setProvider] = useState({ name: undefined, ip: undefined })

  const animatedMbps = useAnimatedNumber(downloadMbps)
  const animatedUpload = useAnimatedNumber(uploadMbps)
  const animatedPing = useAnimatedNumber(pingMs)
  const animatedCapacity = useAnimatedNumber(capacityPct)

  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (conn) {
      const handler = () => setInfo({ effectiveType: conn.effectiveType, downlink: conn.downlink || 0, rtt: conn.rtt || 0 })
      handler()
      conn.addEventListener?.('change', handler)
      return () => conn.removeEventListener?.('change', handler)
    }
  }, [])

  const quality = useMemo(() => classifyQuality({ downlink: info.downlink * 10, rtt: info.rtt, pingMs }), [info.downlink, info.rtt, pingMs])

  // Determine test server host from provided URLs
  const serverHost = useMemo(() => {
    const urlStr = speedTestUrl || uploadTestUrl
    try {
      const host = new URL(urlStr).hostname
      if (host === 'localhost' || host === '127.0.0.1') return 'Local test server'
      return host
    } catch {
      return undefined
    }
  }, [speedTestUrl, uploadTestUrl])

  // Fetch ISP/provider name (best-effort, no key)
  useEffect(() => {
    let aborted = false
    async function getProvider() {
      try {
        // Try ipapi.co
        const r = await fetch('https://ipapi.co/json/', { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          if (!aborted) setProvider({ name: j.org || j.asn || j.org_name || j.company || undefined, ip: j.ip })
          return
        }
      } catch {}
      try {
        // Fallback to ipwho.is
        const r2 = await fetch('https://ipwho.is/', { cache: 'no-store' })
        if (r2.ok) {
          const j2 = await r2.json()
          if (!aborted) setProvider({ name: j2.connection?.isp || j2.connection?.org || j2.org || undefined, ip: j2.ip })
        }
      } catch {}
    }
    getProvider()
    return () => { aborted = true }
  }, [])

  const runTest = useCallback(async () => {
    if (isTesting) return
    setIsTesting(true)
    setProgress(0)
    setDownloadMbps(0)
    setUploadMbps(0)
    setPingMs(0)

    const steps = [
      { key: 'ping', weight: 0.25 },
      { key: 'download', weight: 0.35 },
      { key: 'upload', weight: 0.30 },
      { key: 'finalize', weight: 0.10 },
    ]
    let completed = 0
    const advance = (w) => { completed += w; setProgress(Math.round(completed * 100)) }

    // Ping
    const ping = await pingTest('/favicon.ico')
    setPingMs(Math.round(ping.median))
    advance(steps[0].weight)

    // Download
    if (speedTestUrl) {
      let best = 0
      for (let i = 0; i < Math.max(1, passes); i++) {
        const dl = await downloadTest(speedTestUrl, durationSec, parallelStreams, warmupSec, bucketMs, percentile)
        best = Math.max(best, dl.mbps)
      }
      setDownloadMbps(Math.round(best))
    } else {
      // Simulate using downlink hint
      const base = (info.downlink || 10) * Math.max(1, durationSec / 3.5) // slightly scale with duration
      await new Promise((res) => {
        const start = performance.now()
        const dur = Math.min(15000, Math.max(2000, durationSec * 900))
        const tick = () => {
          const p = clamp((performance.now() - start) / dur, 0, 1)
          setDownloadMbps(Math.round(base * (0.5 + p * 1.25)))
          if (p < 1) requestAnimationFrame(tick); else res()
        }
        requestAnimationFrame(tick)
      })
    }
    advance(steps[1].weight)

    // Upload
    if (uploadTestUrl) {
      let bestUp = 0
      for (let i = 0; i < Math.max(1, passes); i++) {
        const up = await uploadTest(uploadTestUrl, durationSec, Math.max(1, Math.floor(parallelStreams / 2)), warmupSec, bucketMs, percentile)
        bestUp = Math.max(bestUp, up.mbps)
      }
      setUploadMbps(Math.round(bestUp))
    } else {
      // Simulate upload as ~70% of download baseline
      const base = (info.downlink || 10) * 0.7 * Math.max(1, durationSec / 3.5)
      await new Promise((res) => {
        const start = performance.now()
        const dur = Math.min(12000, Math.max(1600, durationSec * 800))
        const tick = () => {
          const p = clamp((performance.now() - start) / dur, 0, 1)
          setUploadMbps(Math.round(base * (0.5 + p * 1.25)))
          if (p < 1) requestAnimationFrame(tick); else res()
        }
        requestAnimationFrame(tick)
      })
    }
    advance(steps[2].weight)

    // Capacity estimate from quality pct
    setCapacityPct(quality.pct)
    advance(steps[3].weight)

    setIsTesting(false)
    setProgress(100)
    const result = {
      downloadMbps, // note: may be one frame behind; recalc from state soon
      uploadMbps,
      pingMs,
      quality: quality.label,
      qualityPct: quality.pct,
      effectiveType: info.effectiveType,
      rtt: info.rtt,
      downlink: info.downlink,
      provider: provider.name,
      ip: provider.ip,
      serverHost,
      timestamp: new Date().toISOString(),
    }
    // Slight delay to ensure state is updated
    setTimeout(() => onComplete?.({ ...result, downloadMbps: Math.round(downloadMbps), uploadMbps: Math.round(uploadMbps), pingMs: Math.round(pingMs) }), 50)
  }, [info.downlink, info.effectiveType, info.rtt, isTesting, onComplete, pingMs, quality.label, quality.pct, speedTestUrl, uploadTestUrl, downloadMbps, uploadMbps])

  const barsFilled = Math.max(1, Math.ceil((animatedCapacity / 100) * 4))
  const barColor = quality.color === 'good' ? 'from-emerald-400 to-emerald-600' : quality.color === 'fair' ? 'from-amber-400 to-amber-600' : 'from-rose-400 to-rose-600'

  const circumference = 260
  const dash = circumference * (animatedCapacity / 100)

  return (
    <section aria-labelledby="title" aria-live="polite">
      <h2 id="title" className="sr-only">Wi‑Fi Strength Tester</h2>

      <div className="flex flex-col items-center gap-6">
        <div className="relative w-48 h-48 sm:w-56 sm:h-56">
          <svg viewBox="0 0 100 100" className="w-full h-full rotate-90 -scale-y-100">
            <circle cx="50" cy="50" r="41" stroke="currentColor" strokeWidth="10" className="text-slate-200/70 dark:text-slate-800/70" fill="none" />
            <circle cx="50" cy="50" r="41" strokeLinecap="round" strokeWidth="10" fill="none"
              className={`[transition:stroke-dasharray_0.4s_ease] drop-shadow ${quality.color === 'good' ? 'text-emerald-500 drop-shadow-[0_4px_12px_rgba(16,185,129,0.35)]' : quality.color === 'fair' ? 'text-amber-500 drop-shadow-[0_4px_12px_rgba(245,158,11,0.35)]' : 'text-rose-500 drop-shadow-[0_4px_12px_rgba(244,63,94,0.35)]'}`}
              stroke="currentColor" strokeDasharray={`${dash},999`} />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="metric-label">Capacity</div>
              <div className="metric-value">
                {Math.round(animatedCapacity)}<span className="text-base align-top ml-1">%</span>
              </div>
              <div className="text-sm subtle">{quality.label}</div>
            </div>
          </div>
        </div>

        <div className="flex items-end gap-2" aria-label="Signal strength" role="img">
          {[0,1,2,3].map(i => (
            <div key={i} className="w-5 sm:w-6 flex items-end" aria-hidden="true">
              <div className="w-full rounded-md bg-slate-200/70 dark:bg-slate-800/70 overflow-hidden border border-slate-200/60 dark:border-slate-800/60"
                   style={{ height: 10 + i*8 }}>
                <div className={`h-full bg-gradient-to-t ${barColor} transition-all duration-500`} style={{ height: i < barsFilled ? '100%' : '0%' }} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60">
            <div className="metric-label">Download</div>
            <div className="metric-value">
              {Math.round(animatedMbps)}<span className="text-base align-top ml-1">Mbps</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60">
            <div className="metric-label">Upload</div>
            <div className="metric-value">
              {Math.round(animatedUpload)}<span className="text-base align-top ml-1">Mbps</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800/60">
            <div className="metric-label">Ping</div>
            <div className="metric-value">
              {Math.round(animatedPing)}<span className="text-base align-top ml-1">ms</span>
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isTesting && (
            <motion.div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="w-full">
              <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div className={`h-full bg-gradient-to-r ${barColor}`} initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ ease: 'easeOut', duration: 0.3 }} />
              </div>
              <p className="subtle text-center mt-2 text-sm">Running quick test…</p>
            </motion.div>
          )}
        </AnimatePresence>

        <button type="button" onClick={runTest} disabled={isTesting}
          aria-busy={isTesting}
          className={`mt-2 ${isTesting ? 'btn-muted disabled:opacity-60' : 'btn-primary'}`}>
          {isTesting ? 'Testing…' : 'Run Quick Test'}
        </button>

        <p className="text-sm subtle text-center max-w-md">
          {quality.label === 'Excellent' && 'Great connection for streaming and video calls.'}
          {quality.label === 'Good' && 'Should handle HD streaming and most tasks well.'}
          {quality.label === 'Fair' && 'Okay for browsing and SD streaming; may struggle with HD.'}
          {quality.label === 'Poor' && 'Connection may be unstable. Try moving closer to your router.'}
        </p>

        <div className="text-xs subtle text-center mt-1">
          <span>ISP: {provider.name || 'Detecting…'}{provider.ip ? ` (${provider.ip})` : ''} · Server: {serverHost || '—'}</span>
        </div>
        <div className="text-xs subtle text-center">
          <span>Type: {info.effectiveType || 'n/a'} · RTT: {info.rtt || 'n/a'}ms · Downlink: {info.downlink || 'n/a'}Mbps</span>
        </div>
      </div>
    </section>
  )
}
