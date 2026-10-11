import { useEffect, useMemo, useState } from 'react'
import { getHealth, getHistory, postCompare, postRecommend } from './lib/api'
import Header from './components/Header'
import WorkloadPanel from './components/WorkloadPanel'
import RecommendationPanel from './components/RecommendationPanel'
import MetricCards from './components/MetricCards'
import ResultsPanel from './components/ResultsPanel'
import Pipeline from './components/Pipeline'
import HistoryPanel from './components/HistoryPanel'
import ShapeGrid from './components/ShapeGrid'

function initialTheme() {
  try {
    const saved = localStorage.getItem('smartipc-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function App() {
  const [form, setForm] = useState({ bytes: 1024, messages: 1000, warmup: 100, rate: 0 })
  const [recommendation, setRecommendation] = useState(null)
  const [comparison, setComparison] = useState([])
  const [history, setHistory] = useState([])
  const [busy, setBusy] = useState(null) // null | 'recommend' | 'compare'
  const [error, setError] = useState('')
  const [health, setHealth] = useState(null)
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('smartipc-theme', theme) } catch {}
  }, [theme])

  const refreshHistory = () => getHistory().then(setHistory)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ benchmark_ready: false }))
    refreshHistory().catch(e => setError(e.message))
  }, [])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const run = async (kind, task) => {
    setBusy(kind)
    setError('')
    try {
      await task()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const recommend = () => run('recommend', async () => setRecommendation(await postRecommend(form)))

  const runComparison = () => run('compare', async () => {
    setComparison([])
    setComparison(await postCompare(form))
    await refreshHistory()
    setRecommendation(await postRecommend(form).catch(() => null))
  })

  const bestThroughput = useMemo(
    () => comparison.length ? comparison.reduce((a, b) => (a.throughput_mbps > b.throughput_mbps ? a : b)) : null,
    [comparison],
  )
  const bestLatency = useMemo(
    () => comparison.length ? comparison.reduce((a, b) => (a.avg_latency_us < b.avg_latency_us ? a : b)) : null,
    [comparison],
  )
  const rateLimited = Number(form.rate) > 0

  return (
    <>
    <div className="background" aria-hidden="true">
      <ShapeGrid
        direction="diagonal"
        speed={0.5}
        squareSize={40}
        shape="square"
        borderColor={theme === 'light' ? '#d4d4d8' : '#2F293A'}
        hoverFillColor={theme === 'light' ? '#e9e3fb' : '#2a2338'}
        hoverTrailAmount={0}
      />
      <div className="aurora"><span /><span /><span /></div>
    </div>
    <div className="app">
      <Header health={health} theme={theme} onToggleTheme={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))} />

      <main className="content">
        {error && (
          <div className="alert" role="alert">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}

        <section className="intro">
          <span className="intro-pill"><span className="dot" />Operating systems research prototype</span>
          <h1>Pick the right IPC, <span>backed by measurements.</span></h1>
          <p>Benchmark pipes, shared memory, message queues and Unix sockets on this machine, then let the decision engine match your workload to the fastest one.</p>
        </section>

        <div className="hero">
          <WorkloadPanel
            form={form}
            onChange={update}
            onPreset={preset => setForm(preset)}
            onRecommend={recommend}
            onCompare={runComparison}
            busy={busy}
          />
          <RecommendationPanel recommendation={recommendation} busy={!!busy} />
        </div>

        <MetricCards
          bestThroughput={bestThroughput}
          bestLatency={bestLatency}
          historyCount={history.length}
          rateLimited={rateLimited}
        />

        {busy === 'compare' && !comparison.length && (
          <section className="card running">
            <div className="running-bars">{[0, 1, 2, 3].map(i => <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />)}</div>
            <p>Benchmarking pipe, shared memory, message queue and Unix socket…</p>
          </section>
        )}

        {comparison.length > 0 && <ResultsPanel comparison={comparison} form={form} rateLimited={rateLimited} />}

        <div className="lower">
          <Pipeline />
          <HistoryPanel history={history} onRefresh={() => refreshHistory().catch(e => setError(e.message))} />
        </div>
      </main>

      <footer className="footer">
        <span>SmartIPC · user-space Linux research prototype</span>
        <span>C++17 benchmark · FastAPI · React + Vite</span>
      </footer>
    </div>
    </>
  )
}
