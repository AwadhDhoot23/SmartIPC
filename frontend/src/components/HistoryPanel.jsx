import { formatNumber, prettyBytes } from '../lib/format'
import { CardHeading } from './WorkloadPanel'
import { MethodBadge } from './ResultsPanel'

export default function HistoryPanel({ history, onRefresh }) {
  return (
    <section className="card">
      <CardHeading step="05" title="History" subtitle="Recent observations">
        <button className="btn ghost small" onClick={onRefresh}>Refresh</button>
      </CardHeading>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>IPC</th><th className="num">Payload</th><th className="num">Rate</th>
              <th className="num">Latency</th><th className="num">Throughput</th><th className="num">Load</th>
            </tr>
          </thead>
          <tbody>
            {history.slice(0, 12).map(row => (
              <tr key={row.id}>
                <td className="dim">#{row.id}</td>
                <td><MethodBadge ipc={row.ipc} /></td>
                <td className="num">{prettyBytes(row.bytes)}</td>
                <td className="num">{row.requested_rate ? `${formatNumber(row.requested_rate, 0)}/s` : 'max'}</td>
                <td className="num">{formatNumber(row.avg_latency_us)} <small>μs</small></td>
                <td className="num">{formatNumber(row.throughput_mbps)} <small>MB/s</small></td>
                <td className="num">{formatNumber(row.load_1m)}</td>
              </tr>
            ))}
            {!history.length && (
              <tr><td colSpan="7" className="empty-row">No observations yet. Run your first comparison.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
