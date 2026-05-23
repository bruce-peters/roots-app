export const Icon = {
  Plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Back: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  More: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  ),
  Mic: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
  Camera: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  Play: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  Pause: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <rect x="7" y="5" width="3.5" height="14" />
      <rect x="13.5" y="5" width="3.5" height="14" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12.5 10 17 19 7.5" />
    </svg>
  ),
  Clock: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  Heart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </svg>
  ),
  Star: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...p}>
      <path d="m12 3 2.6 5.6 6.2.8-4.6 4.3 1.2 6.1L12 17l-5.4 2.8 1.2-6.1L3.2 9.4l6.2-.8z" />
    </svg>
  ),
}

export function LiveDot({ className = '' }) {
  return (
    <span className={`relative inline-flex w-2 h-2 ${className}`}>
      <span className="absolute inset-0 rounded-full bg-burgundy animate-ping opacity-60" />
      <span className="absolute inset-0 rounded-full bg-burgundy" />
    </span>
  )
}

export function Waveform({ bars = 22, color = '#7A2E22' }) {
  return (
    <div className="flex items-center gap-[3px] h-6">
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="wave-bar inline-block w-[3px] rounded-full"
          style={{
            background: color,
            height: `${10 + ((i * 5) % 14)}px`,
            animationDelay: `${(i * 0.07) % 1.1}s`,
          }}
        />
      ))}
    </div>
  )
}

export function ChapterRule({ n, label }) {
  return (
    <div className="flex items-center gap-3 text-ink-3">
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase">{n}</span>
      <span className="flex-1 h-px bg-paper-400" />
      <span className="font-serif italic text-[13px]">{label}</span>
      <span className="flex-1 h-px bg-paper-400" />
    </div>
  )
}
