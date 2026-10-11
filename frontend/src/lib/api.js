import { API } from './constants'

async function request(path, options) {
  const res = await fetch(`${API}${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Request to ${path} failed (${res.status})`)
  return data
}

const post = body => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const getHealth = () => request('/health')
export const getHistory = (limit = 100) => request(`/history?limit=${limit}`).then(d => d.results || [])
export const postRecommend = form =>
  request('/recommend', post({ bytes: Number(form.bytes), rate: Number(form.rate), processes: 2 }))
export const postCompare = form =>
  request('/compare', post({
    bytes: Number(form.bytes),
    messages: Number(form.messages),
    warmup: Number(form.warmup),
    rate: Number(form.rate),
    processes: 2,
  })).then(d => d.results || [])
