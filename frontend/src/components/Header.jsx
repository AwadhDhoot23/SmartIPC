export default function Header({ health, theme, onToggleTheme }) {
  const ready = health?.benchmark_ready
  const status = health === null ? 'Connecting…' : ready ? 'Engine ready' : 'Build benchmark engine'
  return (
    <header className="topbar">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="8" cy="16" r="4" />
            <circle cx="24" cy="16" r="4" />
            <path d="M12 13h8M20 19h-8" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Smart<span>IPC</span></div>
          <div className="brand-tag">Adaptive IPC via dynamic workload analysis</div>
        </div>
      </div>
      <div className="topbar-actions">
        <div className={`status-pill ${health === null ? 'pending' : ready ? 'ready' : 'warn'}`}>
          <span className="dot" />
          {status}
        </div>
        <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle colour theme" title="Toggle theme">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
      </div>
    </header>
  )
}
