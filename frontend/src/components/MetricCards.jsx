import { labels } from '../lib/constants'
import { formatNumber } from '../lib/format'

export default function MetricCards({ bestThroughput, bestLatency, historyCount, rateLimited }) {
  return (
    <section className="metrics">
      <Metric
        title="Best throughput"
        value={bestThroughput ? formatNumber(bestThroughput.throughput_mbps) : '—'}
        unit={bestThroughput ? 'MB/s' : ''}
        sub={bestThroughput ? labels[bestThroughput.ipc] : 'Awaiting run'}
        ipc={bestThroughput?.ipc}
      />
      <Metric
        title="Lowest avg latency"
        value={bestLatency ? formatNumber(bestLatency.avg_latency_us) : '—'}
        unit={bestLatency ? 'μs' : ''}
        sub={bestLatency ? labels[bestLatency.ipc] : 'Awaiting run'}
        ipc={bestLatency?.ipc}
      />
      <Metric title="Observations stored" value={formatNumber(historyCount, 0)} sub="Local benchmark runs" />
      <Metric
        title={rateLimited ? 'Scoring · paced regime' : 'Scoring · max-rate regime'}
        value={rateLimited ? '45/30/15/10' : '40/30/20/10'}
        sub={rateLimited ? 'Avg lat · P95 · CPU · RAM' : 'Throughput · latency · CPU · RAM'}
      />
    </section>
  )
}

function Metric({ title, value, unit, sub, ipc }) {
  return (
    <div className={`metric ${ipc ? `m-${ipc}` : ''}`}>
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}{unit && <small>{unit}</small>}</div>
      <div className="metric-sub">{ipc && <i className="swatch" />}{sub}</div>
    </div>
  )
}
