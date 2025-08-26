import React from 'react'
import WifiStrength from './components/WifiStrength'

export default function App() {
  const speedTestUrl = 'https://speed.cloudflare.com/__down?bytes=524288000'
  const uploadTestUrl = ''
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-b from-slate-100 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-xl">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold text-gradient">Wi‑Fi Strength & Speed</h1>
          <p className="subtle mt-1">Quickly check signal quality, ping, and download estimate.</p>
        </header>
        <div className="card p-5">
          <WifiStrength
            onComplete={(m) => console.log('Results', m)}
            speedTestUrl={speedTestUrl}
            uploadTestUrl={uploadTestUrl}
            durationSec={12}
            parallelStreams={8}
            passes={2}
            warmupSec={2}
            bucketMs={250}
            percentile="p95"
          />
        </div>
        <footer className="mt-4 text-center subtle text-xs">
          Inspired by fast.com · Runs fully in your browser
        </footer>
      </div>
    </main>
  )
}

