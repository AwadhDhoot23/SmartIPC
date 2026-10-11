import { labels, descriptions, metricLabels } from '../lib/constants'
import { formatNumber } from '../lib/format'
import { CardHeading } from './WorkloadPanel'

export default function RecommendationPanel({ recommendation, busy }) {
  if (!recommendation) {
    return (
      <section className="card recommendation">
        <CardHeading step="02" title="Decision engine" />
        <div className={`empty ${busy ? 'loading' : ''}`}>
          <div className="empty-orb" />
          <p>{busy ? 'Analysing workload…' : 'No recommendation yet'}</p>
          <span>Pick a preset or run a comparison. The engine uses profiles measured on this machine, not textbook assumptions.</span>
        </div>
      </section>
    )
  }

  const { recommended_ipc: ipc, confidence = 0, dominant_metric, mode, explanation, final_scores = {} } = recommendation
  const level = confidence >= 0.85 ? 'High' : confidence >= 0.65 ? 'Moderate' : 'Low'
  const scores = Object.entries(final_scores).sort((a, b) => b[1] - a[1])

  return (
    <section className={`card recommendation m-${ipc}`}>
      <CardHeading step="02" title="Decision engine">
        <span className={`tag ${mode === 'fallback' ? 'tag-warn' : 'tag-ok'}`}>
          {mode === 'fallback' ? 'Heuristic' : 'Profile-based'}
        </span>
      </CardHeading>

      <div className="winner">
        <div className="winner-label">Recommended</div>
        <div className="winner-name">{labels[ipc] || ipc}</div>
        <div className="winner-desc">{descriptions[ipc]}</div>
      </div>

      <div className="confidence">
        <div className="confidence-head">
          <span>{level} confidence</span>
          <strong>{formatNumber(confidence * 100, 0)}<small>/100</small></strong>
        </div>
        <div className="track"><div className="fill accent" style={{ width: `${Math.min(100, confidence * 100)}%` }} /></div>
      </div>

      {dominant_metric && (
        <div className="chip">Leading metric · <strong>{metricLabels[dominant_metric] || dominant_metric}</strong></div>
      )}

      {explanation && <p className="explanation">{explanation}</p>}
      {mode === 'fallback' && <p className="note">Run benchmarks to get a data-driven decision.</p>}

      <div className="scores">
        {scores.map(([m, score]) => (
          <div className={`score m-${m}`} key={m}>
            <span className="score-name"><i className="swatch" />{labels[m] || m}</span>
            <div className="track"><div className="fill" style={{ width: `${Math.max(3, score * 100)}%` }} /></div>
            <strong>{formatNumber(score * 100, 0)}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}
