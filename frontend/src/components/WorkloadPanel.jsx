import { PRESETS } from '../lib/constants'
import { formatNumber, prettyBytes } from '../lib/format'

export default function WorkloadPanel({ form, onChange, onPreset, onRecommend, onCompare, busy }) {
  const activePreset = PRESETS.find(p => Object.entries(p.form).every(([k, v]) => Number(form[k]) === v))
  return (
    <section className="card workload">
      <CardHeading step="01" title="Workload" subtitle="Describe the communication pattern to test">
        <span className="tag">2-process ping-pong</span>
      </CardHeading>

      <div className="presets">
        {PRESETS.map(p => (
          <button
            key={p.name}
            className={`preset ${activePreset === p ? 'active' : ''}`}
            onClick={() => onPreset(p.form)}
            disabled={!!busy}
          >
            <strong>{p.name}</strong>
            <span>{prettyBytes(p.form.bytes)}{p.form.rate ? ` · ${p.form.rate}/s` : ''} — {p.hint}</span>
          </button>
        ))}
      </div>

      <div className="form-grid">
        <Field label="Payload size" unit="bytes" hint={prettyBytes(Number(form.bytes) || 0)}>
          <input type="number" min="1" max="16777216" value={form.bytes} onChange={e => onChange('bytes', e.target.value)} />
        </Field>
        <Field label="Messages" unit="round trips" hint="Timed round trips">
          <input type="number" min="1" max="100000" value={form.messages} onChange={e => onChange('messages', e.target.value)} />
        </Field>
        <Field label="Warmup" unit="msgs" hint="Excluded from results">
          <input type="number" min="0" max="10000" value={form.warmup} onChange={e => onChange('warmup', e.target.value)} />
        </Field>
        <Field label="Target rate" unit="msg/s" hint={Number(form.rate) ? `${formatNumber(form.rate, 0)} msg/s paced` : '0 = maximum-rate mode'}>
          <input type="number" min="0" max="1000000" value={form.rate} onChange={e => onChange('rate', e.target.value)} />
        </Field>
      </div>

      <div className="actions">
        <button className="btn ghost" onClick={onRecommend} disabled={!!busy}>
          {busy === 'recommend' && <Spinner />}Recommend only
        </button>
        <button className="btn primary" onClick={onCompare} disabled={!!busy}>
          {busy === 'compare' ? <><Spinner />Running benchmarks…</> : 'Run all 4 benchmarks'}
        </button>
      </div>
    </section>
  )
}

function Field({ label, unit, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-wrap">
        {children}
        <span className="input-unit">{unit}</span>
      </span>
      <span className="field-hint">{hint}</span>
    </label>
  )
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

export function CardHeading({ step, title, subtitle, children }) {
  return (
    <div className="card-heading">
      <div>
        <div className="eyebrow"><span className="step">{step}</span>{title}</div>
        {subtitle && <h2>{subtitle}</h2>}
      </div>
      {children}
    </div>
  )
}
