import { labels } from '../lib/constants'
import { formatNumber, prettyBytes } from '../lib/format'
import { CardHeading } from './WorkloadPanel'

export default function ResultsPanel({ comparison, form, rateLimited }) {
  return (
    <section className="card">
      <CardHeading step="03" title="Results" subtitle="Measured IPC comparison">
        <span className="tag">{prettyBytes(Number(form.bytes))} · {formatNumber(form.messages, 0)} msgs</span>
      </CardHeading>

      <div className="charts">
        <BarChart title="Average latency" unit="μs" values={comparison} metric="avg_latency_us" lowerIsBetter />
        <BarChart
          title={rateLimited ? 'Throughput (pacing-limited)' : 'Throughput'}
          unit="MB/s"
          values={comparison}
          metric="throughput_mbps"
        />
        <BarChart title="CPU, parent + child" unit="%" values={comparison} metric="cpu_percent" lowerIsBetter />
        <BarChart title="Peak RSS, max process" unit="MB" values={comparison} metric="peak_rss_mb" lowerIsBetter />
      </div>

      <p className="note boxed">
        CPU is the sum of parent and child utilisation over the measured interval, so values above 100% are normal on
        multi-core systems. Peak RSS is the <em>larger</em> of the two processes (not the sum), avoiding double-counting
        of shared library pages.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>IPC</th><th className="num">Avg latency</th><th className="num">P50</th><th className="num">P95</th>
              <th className="num">Throughput</th><th className="num">CPU</th><th className="num">Peak RSS</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(row => (
              <tr key={row.ipc}>
                <td><MethodBadge ipc={row.ipc} /></td>
                <td className="num">{formatNumber(row.avg_latency_us)} <small>μs</small></td>
                <td className="num">{formatNumber(row.p50_latency_us)} <small>μs</small></td>
                <td className="num">{formatNumber(row.p95_latency_us)} <small>μs</small></td>
                <td className="num">{formatNumber(row.throughput_mbps)} <small>MB/s</small></td>
                <td className="num">{formatNumber(row.cpu_percent)} <small>%</small></td>
                <td className="num">{formatNumber(row.peak_rss_mb)} <small>MB</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function MethodBadge({ ipc }) {
  return <span className={`badge m-${ipc}`}><i className="swatch" />{labels[ipc] || ipc}</span>
}

function BarChart({ title, unit, values, metric, lowerIsBetter = false }) {
  const nums = values.map(v => Number(v[metric]) || 0)
  const max = Math.max(...nums, 1e-9)
  const best = lowerIsBetter ? Math.min(...nums) : Math.max(...nums)
  return (
    <div className="chart">
      <div className="chart-head">
        <h3>{title}</h3>
        <span>{unit} · {lowerIsBetter ? 'lower is better' : 'higher is better'}</span>
      </div>
      <div className="bars">
        {values.map((v, i) => {
          const val = nums[i]
          const isBest = Math.abs(val - best) < 1e-9
          return (
            <div className={`bar m-${v.ipc} ${isBest ? 'best' : ''}`} key={v.ipc}>
              <span className="bar-label">{labels[v.ipc]}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(2, (val / max) * 100)}%` }} /></div>
              <span className="bar-value">{formatNumber(val)}{isBest && <b className="best-mark">★</b>}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
