export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

export const METHODS = ['pipe', 'shared_memory', 'message_queue', 'unix_socket']

export const labels = {
  pipe: 'Pipe',
  shared_memory: 'Shared Memory',
  message_queue: 'Message Queue',
  unix_socket: 'Unix Socket',
}

export const descriptions = {
  pipe: 'Anonymous pipe between parent and child',
  shared_memory: 'POSIX shm + named semaphores',
  message_queue: 'System V queue, chunked payloads',
  unix_socket: 'Unix-domain stream socketpair',
}

export const metricLabels = {
  throughput_mbps: 'Throughput',
  avg_latency_us: 'Avg latency',
  p95_latency_us: 'P95 latency',
  cpu_percent: 'CPU efficiency',
  peak_rss_mb: 'Memory footprint',
}

export const PRESETS = [
  { name: 'Tiny messages', hint: 'Pipe tends to win', form: { bytes: 64, messages: 1000, warmup: 100, rate: 0 } },
  { name: 'Bulk transfer', hint: 'Shared memory tends to win', form: { bytes: 65536, messages: 1000, warmup: 100, rate: 0 } },
  { name: 'Paced stream', hint: 'Unix socket tends to win', form: { bytes: 1024, messages: 1000, warmup: 100, rate: 500 } },
]
