import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import * as db from '@/lib/db'
import { Portrait } from '@/components/portrait'
import { TopBar } from '@/components/top-bar'
import { Icon, Waveform } from '@/components/icons'

function parseDuration(d) {
  if (!d) return 60
  const parts = d.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 60
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function TranscriptScreen() {
  const { id, interviewId } = useParams()
  const navigate = useNavigate()
  const { people, interviews, transcripts, updateInterview } = useData()

  const person = people.find((p) => p.id === id)
  const it = interviews.find((i) => i.id === interviewId)

  // Pull transcript from context; fall back to empty string.
  const transcript = transcripts[interviewId] ?? ''

  const total = useMemo(() => parseDuration(it?.duration), [it])
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const raf = useRef(null)
  const lastTick = useRef(null)

  // ── transcript polling ──────────────────────────────────────────────────
  // Poll Supabase every 3 s until a non-empty transcript arrives.
  // This handles the common case where the AI is still generating the
  // transcript when the user navigates here right after a session ends.
  useEffect(() => {
    if (!interviewId) return
    if (transcript) return // already have it; nothing to do

    let cancelled = false

    async function poll() {
      try {
        const text = await db.fetchInterviewTranscript(interviewId)
        if (cancelled) return
        if (text) {
          updateInterview(interviewId, { transcript: text })
        }
      } catch (err) {
        console.error('transcript poll error', err)
      }
    }

    // Fire once immediately, then every 3 s.
    poll()
    const timer = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [interviewId, transcript, updateInterview])

  useEffect(() => {
    if (!playing) {
      lastTick.current = null
      return
    }
    function step(now) {
      if (lastTick.current == null) lastTick.current = now
      const dt = (now - lastTick.current) / 1000
      lastTick.current = now
      setPosition((p) => {
        const next = p + dt
        if (next >= total) {
          setPlaying(false)
          return total
        }
        return next
      })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => raf.current && cancelAnimationFrame(raf.current)
  }, [playing, total])

  if (!person || !it) {
    return (
      <div className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif italic text-[16px] text-ink-2">Session not found.</p>
          <button
            onClick={() => navigate(`/person/${id}`)}
            className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-burgundy"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  function togglePlay() {
    if (position >= total) setPosition(0)
    setPlaying((p) => !p)
  }

  const progressPct = total ? Math.min(100, (position / total) * 100) : 0

  return (
    <div className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate(`/person/${id}`)} className="text-ink-2">
            <Icon.Back width="22" height="22" />
          </button>
        }
        title={`Session ${it.n}`}
        sub={it.date}
        right={
          <button onClick={() => setMenuOpen((v) => !v)} className="text-ink-2 relative">
            <Icon.More width="22" height="22" />
          </button>
        }
      />

      {menuOpen && (
        <MoreMenu
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: 'Share session',
              onClick: () => {
                setMenuOpen(false)
                setToast('Sharing is coming soon')
                setTimeout(() => setToast(''), 1500)
              },
            },
            {
              label: 'Export transcript',
              onClick: () => {
                setMenuOpen(false)
                const blob = new Blob([transcript], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${person.name.replace(/\s+/g, '-').toLowerCase()}-session-${it.n}.txt`
                a.click()
                URL.revokeObjectURL(url)
              },
            },
          ]}
        />
      )}

      <div className="px-4 pt-4">
        <div className="relative rounded-2xl overflow-hidden shadow-card">
          <Portrait person={person} ratio="16/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={togglePlay}
              className="h-14 w-14 rounded-full bg-paper-50/95 text-ink flex items-center justify-center shadow-photo"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Icon.Pause width="22" height="22" />
              ) : (
                <Icon.Play width="22" height="22" />
              )}
            </button>
          </div>
          <div className="absolute left-3 right-3 bottom-3 flex items-center gap-3">
            <span className="font-mono text-[10px] text-paper-50 tracking-[0.14em] bg-ink/45 px-2 py-0.5 rounded-full">
              {fmt(position)}
            </span>
            <div className="flex-1 h-1 rounded-full bg-paper-50/30 overflow-hidden">
              <div
                className="h-full bg-paper-50 transition-[width] duration-100 ease-linear"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="absolute top-3 left-3">
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 pb-2">
        <h2 className="font-serif text-[24px] leading-[1.1] text-ink">{it.date}</h2>
      </div>

      {/* Transcript body */}
      <div className="px-5 pb-32">
        {transcript ? (
          transcript.split('\n').filter(Boolean).map((para, i) => (
            <p key={i} className="font-serif text-[15px] leading-[1.65] text-ink-2 mb-4">
              {para}
            </p>
          ))
        ) : (
          <p className="font-serif italic text-[14px] text-ink-3">
            Transcript is being processed…
          </p>
        )}
      </div>



      {toast && (
        <div className="fixed top-16 left-0 right-0 flex justify-center pointer-events-none z-30">
          <div className="bg-ink/95 text-paper-50 rounded-full px-4 py-2 font-mono text-[10px] tracking-[0.18em] uppercase shadow-photo">
            {toast}
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
        <div className="mx-auto max-w-[430px] px-4 pb-5">
          <div className="pointer-events-auto bg-ink/95 text-paper-50 rounded-full px-3 py-2 flex items-center gap-3 backdrop-blur shadow-photo">
            <button
              onClick={togglePlay}
              className="h-9 w-9 rounded-full bg-paper-50 text-ink flex items-center justify-center"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <Icon.Pause width="14" height="14" />
              ) : (
                <Icon.Play width="14" height="14" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-serif text-[13px] truncate">{person.name}</div>
              <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-paper-50/55">
                Session {it.n} · {fmt(position)}
              </div>
            </div>
            {playing ? (
              <Waveform bars={10} color="#F1E6CE" />
            ) : (
              <div className="flex items-center gap-[3px] h-6">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span
                    key={i}
                    className="inline-block w-[3px] rounded-full bg-paper-50/50"
                    style={{ height: `${6 + ((i * 5) % 10)}px` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MoreMenu({ items, onClose }) {
  return (
    <div className="fixed inset-0 z-30" onClick={onClose}>
      <div
        className="absolute top-12 right-3 vellum-bg border border-paper-400 rounded-xl shadow-card overflow-hidden min-w-[180px]"
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => (
          <button
            key={i}
            onClick={it.onClick}
            className="block w-full text-left px-4 py-3 font-serif text-[15px] text-ink hover:bg-paper-100 border-b last:border-b-0 border-paper-400/60"
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
