import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'
const METHODS = ['pipe', 'shared_memory', 'message_queue', 'unix_socket']

const labels = {
  pipe: 'Pipe',
  shared_memory: 'Shared Memory',
  message_queue: 'Message Queue',
  unix_socket: 'Unix Socket',
}

function formatNumber(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function prettyBytes(n) {
  if (n >= 1024 * 1024) return `${formatNumber(n / (1024 * 1024), 1)} MiB`
  if (n >= 1024) return `${formatNumber(n / 1024, 1)} KiB`
  return `${n} B`
}

function App() {
  const [form, setForm] = useState({ bytes: 1024, messages: 1000, warmup: 100, rate: 0 })
  const [recommendation, setRecommendation] = useState(null)
  const [comparison, setComparison] = useState([])
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)

  const refreshHistory = async () => {
    const res = await fetch(`${API}/history?limit=100`)
    if (!res.ok) throw new Error('Unable to load benchmark history')
    const data = await res.json()
    setHistory(data.results || [])
  }

  useEffect(() => {
    Promise.all([
      fetch(`${API}/health`).then(r => r.json()).then(setHealth),
      refreshHistory(),
    ]).catch(e => setError(e.message))
  }, [])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const recommend = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`${API}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytes: Number(form.bytes), rate: Number(form.rate), processes: 2 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Recommendation failed')
      setRecommendation(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const runComparison = async () => {
    setBusy(true)
    setError('')
    setComparison([])
    try {
      const res = await fetch(`${API}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bytes: Number(form.bytes),
          messages: Number(form.messages),
          warmup: Number(form.warmup),
          rate: Number(form.rate),
          processes: 2,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Comparison failed')
      setComparison(data.results || [])
      await refreshHistory()
      const recRes = await fetch(`${API}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bytes: Number(form.bytes), rate: Number(form.rate), processes: 2 }),
      })
      if (recRes.ok) setRecommendation(await recRes.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const bestThroughput = useMemo(() => {
    if (!comparison.length) return null
    return comparison.reduce((a, b) => a.throughput_mbps > b.throughput_mbps ? a : b)
  }, [comparison])

  const bestLatency = useMemo(() => {
    if (!comparison.length) return null
    return comparison.reduce((a, b) => a.avg_latency_us < b.avg_latency_us ? a : b)
  }, [comparison])

  const isRateLimited = Number(form.rate) > 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">OPERATING SYSTEMS RESEARCH PROTOTYPE</div>
          <h1>Smart<span>IPC</span></h1>
          <p>Adaptive Inter-Process Communication using Dynamic Workload Analysis</p>
        </div>
        <div className={`health-pill ${health?.benchmark_ready ? 'ready' : 'warn'}`}>
          <span className="dot" />
          {health?.benchmark_ready ? 'Benchmark engine ready' : 'Build benchmark engine'}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <main>
        <section className="hero-grid">
          <div className="panel workload-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">01 / WORKLOAD</div>
                <h2>Define the communication pattern</h2>
              </div>
              <span className="topology-tag">2-process ping-pong</span>
            </div>

            <div className="form-grid">
              <Field label="Payload size" hint="Bytes per logical message">
                <input type="number" min="1" max="16777216" value={form.bytes} onChange={e => update('bytes', e.target.value)} />
                <div className="field-hint">{prettyBytes(Number(form.bytes) || 0)}</div>
              </Field>
              <Field label="Messages" hint="Timed round trips">
                <input type="number" min="1" max="100000" value={form.messages} onChange={e => update('messages', e.target.value)} />
              </Field>
              <Field label="Warmup" hint="Excluded from results">
                <input type="number" min="0" max="10000" value={form.warmup} onChange={e => update('warmup', e.target.value)} />
              </Field>
              <Field label="Target rate" hint="0 = run as fast as possible">
                <input type="number" min="0" max="1000000" value={form.rate} onChange={e => update('rate', e.target.value)} />
                <div className="field-hint">{Number(form.rate) ? `${formatNumber(form.rate, 0)} msg/s` : 'maximum-rate mode'}</div>
              </Field>
            </div>

            <div className="action-row">
              <button className="button secondary" onClick={recommend} disabled={busy}>Recommend IPC</button>
              <button className="button primary" onClick={runComparison} disabled={busy}>
                {busy ? 'Running benchmarks…' : 'Run all 4 benchmarks'}
              </button>
            </div>
          </div>

          <div className="panel recommendation-panel">
            <div className="eyebrow">02 / DECISION ENGINE</div>
            <h2>Smart recommendation</h2>
            {recommendation ? (
              <>
                <div className="recommendation-name">{labels[recommendation.recommended_ipc]}</div>

                {recommendation.dominant_metric && (
                  <div className="dominant-chip">
                    Leading metric:&nbsp;<strong>{{
                      throughput_mbps: 'Throughput',
                      avg_latency_us: 'Avg latency',
                      p95_latency_us: 'P95 latency',
                      cpu_percent: 'CPU efficiency',
                      peak_rss_mb: 'Memory footprint',
                    }[recommendation.dominant_metric] || recommendation.dominant_metric}</strong>
                  </div>
                )}

                <div className="confidence-row">
                  <div className="confidence-track"><div style={{ width: `${Math.min(100, recommendation.confidence * 100)}%` }} /></div>
                  <span>
                    {recommendation.confidence >= 0.85
                      ? 'High confidence'
                      : recommendation.confidence >= 0.65
                        ? 'Moderate confidence'
                        : 'Low confidence'}
                  </span>
                </div>
                <div className="confidence-note">
                  Evidence strength: {formatNumber(recommendation.confidence * 100, 0)} / 100
                </div>
                <div className="recommendation-meta">
                  {recommendation.mode === 'fallback'
                    ? 'Heuristic fallback — run benchmarks for data-driven results'
                    : 'Profile-based decision · repeated trials averaged before matching'}
                </div>
                <p className="muted">{recommendation.explanation}</p>
                <div className="score-list">
                  {Object.entries(recommendation.final_scores || {}).sort((a, b) => b[1] - a[1]).map(([ipc, score]) => (
                    <div className="score-row" key={ipc}>
                      <span>{labels[ipc]}</span>
                      <div className="score-track"><div style={{ width: `${Math.max(4, score * 100)}%` }} /></div>
                      <strong>{formatNumber(score * 100, 0)}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-symbol">◎</div>
                <p>Run a comparison or click "Recommend IPC".</p>
                <span>The engine uses locally measured profiles — not textbook assumptions.</span>
                <span className="diversity-hint">
                  💡 Try: 64 B (Pipe wins) · 64 KB (Shared Memory wins) · 1 KB + rate=500 (Unix Socket wins)
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="metric-grid">
          <MetricCard
            title="Best throughput — current run"
            value={bestThroughput ? `${formatNumber(bestThroughput.throughput_mbps)} MB/s` : '—'}
            subtitle={bestThroughput ? labels[bestThroughput.ipc] : 'Awaiting run'}
          />
          <MetricCard
            title="Lowest avg latency — current run"
            value={bestLatency ? `${formatNumber(bestLatency.avg_latency_us)} μs` : '—'}
            subtitle={bestLatency ? labels[bestLatency.ipc] : 'Awaiting run'}
          />
          <MetricCard
            title="Observations stored"
            value={history.length}
            subtitle="Local benchmark runs"
          />
          <MetricCard
            title="Scoring model"
            value={isRateLimited ? '45 / 30 / 15 / 10' : '40 / 30 / 20 / 10'}
            subtitle={isRateLimited ? 'Avg latency / P95 / CPU / RAM' : 'Throughput / latency / CPU / RAM'}
          />
        </section>

        {comparison.length > 0 && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">03 / RESULTS</div>
                <h2>Measured IPC comparison</h2>
              </div>
              <span className="muted">{prettyBytes(Number(form.bytes))} · {formatNumber(form.messages, 0)} messages</span>
            </div>

            <div className="charts-grid">
              <BarChart title="Average latency (μs)" values={comparison} metric="avg_latency_us" lowerIsBetter />
              <BarChart
                title={isRateLimited
                  ? 'Observed throughput — pacing limited (MB/s)'
                  : 'Throughput (MB/s)'}
                values={comparison}
                metric="throughput_mbps"
              />
              <BarChart title="Aggregate CPU — parent + child (%)" values={comparison} metric="cpu_percent" lowerIsBetter />
              <BarChart title="Peak RSS — max process (MB)" values={comparison} metric="peak_rss_mb" lowerIsBetter />
            </div>
            <div className="results-note">
              CPU is the sum of parent + child process utilisation over the measured interval —
              values above 100% are normal on multi-core systems.
              Peak RSS is the <em>larger</em> of the two processes (not the sum), avoiding
              double-counting of shared library pages.
            </div>

            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>IPC</th>
                  <th>Avg latency</th>
                  <th>P50</th>
                  <th>P95</th>
                  <th>Throughput</th>
                  <th>CPU (aggregate)</th>
                  <th>Peak RSS</th>
                </tr></thead>
                <tbody>
                  {comparison.map(row => <tr key={row.ipc}>
                    <td className="ipc-cell">{labels[row.ipc]}</td>
                    <td>{formatNumber(row.avg_latency_us)} μs</td>
                    <td>{formatNumber(row.p50_latency_us)} μs</td>
                    <td>{formatNumber(row.p95_latency_us)} μs</td>
                    <td>{formatNumber(row.throughput_mbps)} MB/s</td>
                    <td>{formatNumber(row.cpu_percent)}%</td>
                    <td>{formatNumber(row.peak_rss_mb)} MB</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="panel architecture-panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">04 / SYSTEM</div>
              <h2>How SmartIPC works</h2>
            </div>
          </div>
          <div className="architecture">
            <ArchitectureStep n="A" title="Workload" text="Payload size + target rate + process topology" />
            <Arrow />
            <ArchitectureStep n="B" title="Benchmark" text="Pipe · Shared Memory · Message Queue · Unix Socket" />
            <Arrow />
            <ArchitectureStep n="C" title="Profile" text="Latency · throughput · CPU · memory" />
            <Arrow />
            <ArchitectureStep n="D" title="Decision" text="Nearest profiles → noise-resistant normalisation → dual-regime weighted score" />
          </div>
        </section>

        <section className="panel history-panel">
          <div className="section-heading">
            <div>
              <div className="eyebrow">05 / HISTORY</div>
              <h2>Recent observations</h2>
            </div>
            <button className="text-button" onClick={() => refreshHistory().catch(e => setError(e.message))}>Refresh</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>IPC</th><th>Payload</th><th>Rate</th><th>Latency</th><th>Throughput</th><th>Load</th></tr></thead>
              <tbody>
                {history.slice(0, 12).map(row => <tr key={row.id}>
                  <td>#{row.id}</td><td className="ipc-cell">{labels[row.ipc]}</td><td>{prettyBytes(row.bytes)}</td>
                  <td>{row.requested_rate ? `${formatNumber(row.requested_rate, 0)} msg/s` : 'max'}</td>
                  <td>{formatNumber(row.avg_latency_us)} μs</td><td>{formatNumber(row.throughput_mbps)} MB/s</td><td>{formatNumber(row.load_1m)}</td>
                </tr>)}
                {!history.length && <tr><td colSpan="7" className="empty-table">No observations yet. Run your first comparison.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer>
        <span>SmartIPC v1.2.1 · User-space Linux research prototype</span>
        <span>Benchmark: C++17 · API: FastAPI · UI: React + Vite</span>
      </footer>
    </div>
  )
}

function Field({ label, hint, children }) {
  return <label className="field"><div className="field-label">{label}</div>{children}<div className="field-hint">{hint}</div></label>
}

function MetricCard({ title, value, subtitle }) {
  return <div className="metric-card"><div className="eyebrow">{title}</div><div className="metric-value">{value}</div><div className="metric-subtitle">{subtitle}</div></div>
}

function BarChart({ title, values, metric, lowerIsBetter = false }) {
  const max = Math.max(...values.map(v => Number(v[metric]) || 0), 1)
  const best = lowerIsBetter ? Math.min(...values.map(v => Number(v[metric]))) : Math.max(...values.map(v => Number(v[metric])))
  return <div className="chart-card">
    <h3>{title}</h3>
    <div className="bars">
      {values.map(v => {
        const val = Number(v[metric]) || 0
        const width = `${Math.max(5, (val / max) * 100)}%`
        const isBest = Math.abs(val - best) < 1e-9
        return <div className="bar-row" key={v.ipc}>
          <div className="bar-label">{labels[v.ipc]}</div>
          <div className="bar-track"><div className={`bar-fill ${isBest ? 'best' : ''}`} style={{ width }} /></div>
          <div className="bar-value">{formatNumber(val)}</div>
        </div>
      })}
    </div>
  </div>
}

function ArchitectureStep({ n, title, text }) {
  return <div className="arch-step"><div className="arch-number">{n}</div><strong>{title}</strong><span>{text}</span></div>
}

function Arrow() { return <div className="arch-arrow">→</div> }

createRoot(document.getElementById('root')).render(<App />)
