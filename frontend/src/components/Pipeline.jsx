import { CardHeading } from './WorkloadPanel'

const STEPS = [
  { title: 'Workload', text: 'Payload size, target rate and process topology' },
  { title: 'Benchmark', text: 'Pipe · Shared Memory · Message Queue · Unix Socket' },
  { title: 'Profile', text: 'Latency, throughput, CPU and memory per method' },
  { title: 'Decision', text: 'Nearest profiles → noise-resistant normalisation → dual-regime weighted score' },
]

export default function Pipeline() {
  return (
    <section className="card">
      <CardHeading step="04" title="System" subtitle="How SmartIPC decides" />
      <ol className="pipeline">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="pipeline-num">{String.fromCharCode(65 + i)}</span>
            <strong>{s.title}</strong>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
