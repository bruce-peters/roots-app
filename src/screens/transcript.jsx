import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useData, useMemoriesFor } from '@/lib/data-context'
import * as db from '@/lib/db'
import { cn } from '@/lib/utils'
import { PageTransition } from '@/components/page-transition'
import { Portrait } from '@/components/portrait'
import { TopBar } from '@/components/top-bar'
import { Icon, Waveform } from '@/components/icons'

// ── paragraph grouping ────────────────────────────────────────────────────────

const PAUSE_THRESHOLD = 0.65
const MAX_PARA = 28

function buildParagraphs(words) {
  if (!words.length) return []
  const result = []
  let current = []
  for (let i = 0; i < words.length; i++) {
    if (current.length > 0) {
      const gap = words[i].start - words[i - 1].end
      if (gap > PAUSE_THRESHOLD || current.length >= MAX_PARA) {
        result.push(current)
        current = []
      }
    }
    current.push({ ...words[i], idx: i })
  }
  if (current.length) result.push(current)
  return result
}

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
  const { state: navState } = useLocation()
  const { people, interviews, transcripts, updateInterview } = useData()

  const person = people.find((p) => p.id === id)
  const it = interviews.find((i) => i.id === interviewId)

  const personMemories = useMemoriesFor(id)
  const sessionMemories = useMemo(
    () => personMemories.filter((m) => m.sourceInterviewId === interviewId && m.clips?.length),
    [personMemories, interviewId]
  )

  const transcript = transcripts[interviewId] ?? ''
  const transcriptWords = it?.transcriptWords ?? []
  const paragraphs = useMemo(() => buildParagraphs(transcriptWords), [transcriptWords])

  const parsedDuration = useMemo(() => parseDuration(it?.duration), [it])
  const [videoDuration, setVideoDuration] = useState(null)
  const total = videoDuration ?? parsedDuration

  const [position, setPosition] = useState(() => navState?.seekTo ?? 0)
  const [playing, setPlaying] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')

  const videoRef = useRef(null)
  const pendingSeek = useRef(navState?.seekTo ?? null)

  const raf = useRef(null)
  const lastTick = useRef(null)

  const activeWordIdx = useMemo(() => {
    if (!transcriptWords.length || position <= 0) return -1
    let lo = 0, hi = transcriptWords.length - 1, result = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (transcriptWords[mid].start <= position) {
        result = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return result
  }, [transcriptWords, position])

  const activeRef = useRef(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeWordIdx])

  useEffect(() => {
    if (!interviewId) return
    if (transcript && transcriptWords.length) return

    let cancelled = false

    async function poll() {
      try {
        const { text, words } = await db.fetchInterviewTranscript(interviewId)
        if (cancelled) return
        const patch = {}
        if (text) patch.transcript = text
        if (words.length) patch.transcriptWords = words
        if (Object.keys(patch).length) updateInterview(interviewId, patch)
      } catch (err) {
        console.error('transcript poll error', err)
      }
    }

    poll()
    const timer = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [interviewId, transcript, transcriptWords.length, updateInterview])

  useEffect(() => {
    if (!interviewId) return
    if (it?.video) return

    let cancelled = false

    async function poll() {
      try {
        const url = await db.fetchInterviewVideo(interviewId)
        if (cancelled) return
        if (url) updateInterview(interviewId, { video: url })
      } catch (err) {
        console.error('video poll error', err)
      }
    }

    poll()
    const timer = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [interviewId, it?.video, updateInterview])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !it?.video) return

    function onTimeUpdate() { setPosition(video.currentTime) }
    function onLoadedMetadata() {
      setVideoDuration(video.duration)
      if (pendingSeek.current != null) {
        video.currentTime = pendingSeek.current
        pendingSeek.current = null
      }
    }
    function onPlay() { setPlaying(true) }
    function onPause() { setPlaying(false) }
    function onEnded() { setPlaying(false); setPosition(video.duration) }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
    }
  }, [it?.video])

  useEffect(() => {
    if (it?.video) return
    if (!playing) { lastTick.current = null; return }
    function step(now) {
      if (lastTick.current == null) lastTick.current = now
      const dt = (now - lastTick.current) / 1000
      lastTick.current = now
      setPosition((p) => {
        const next = p + dt
        if (next >= total) { setPlaying(false); return total }
        return next
      })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => raf.current && cancelAnimationFrame(raf.current)
  }, [playing, total, it?.video])

  if (!person || !it) {
    return (
      <PageTransition className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif italic text-[16px] text-ink-2">Session not found.</p>
          <button
            onClick={() => navigate(`/person/${id}`)}
            className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-burgundy"
          >
            Go back
          </button>
        </div>
      </PageTransition>
    )
  }

  function togglePlay() {
    const video = videoRef.current
    if (video && it.video) {
      if (video.ended || video.currentTime >= (videoDuration ?? parsedDuration)) {
        video.currentTime = 0
      }
      video.paused ? video.play() : video.pause()
    } else {
      if (position >= total) setPosition(0)
      setPlaying((p) => !p)
    }
  }

  function seekTo(pct) {
    const newPos = pct * total
    setPosition(newPos)
    if (videoRef.current && it?.video) {
      videoRef.current.currentTime = newPos
    }
  }

  function seekToSeconds(secs) {
    setPosition(secs)
    if (videoRef.current && it?.video) {
      videoRef.current.currentTime = secs
    }
  }

  const progressPct = total ? Math.min(100, (position / total) * 100) : 0

  // ── Shared video player element ──────────────────────────────────────────────
  function VideoPanel() {
    return (
      <div className="relative rounded-2xl overflow-hidden shadow-photo">
        {it.video ? (
          <video
            ref={videoRef}
            src={it.video}
            preload="auto"
            playsInline
            style={{
              display: 'block',
              width: '100%',
              aspectRatio: '16/10',
              objectFit: 'cover',
              filter: 'sepia(0.35)',
            }}
          />
        ) : (
          <Portrait person={person} ratio="16/10" />
        )}

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
          <div
            className="flex-1 h-1 rounded-full bg-paper-50/30 overflow-hidden cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seekTo((e.clientX - rect.left) / rect.width)
            }}
          >
            <div
              className="h-full bg-paper-50 transition-[width] duration-100 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageTransition className="paper-bg min-h-screen flex flex-col">
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

      {/* ── Two-column layout: stacked on mobile, side-by-side on desktop ── */}
      <div className="flex flex-col md:flex-row md:flex-1">

        {/* ── Left col: video + date + memory clips (desktop sticky panel) ── */}
        <div className="md:w-[360px] md:shrink-0 md:sticky md:top-[52px] md:self-start md:max-h-[calc(100vh-100px)] md:overflow-y-auto md:border-r md:border-paper-400/60 md:flex md:flex-col">

          {/* Video: sticky on mobile, part of sticky left col on desktop */}
          <div className="sticky top-[52px] z-20 md:static md:z-auto self-stretch w-full px-4 pt-4 pb-3 md:px-5 md:pt-5">
            <VideoPanel />
          </div>

          {/* Date heading */}
          <div className="px-5 pt-2 pb-2 md:pt-0">
            <h2 className="font-serif text-[22px] leading-[1.1] text-ink">{it.date}</h2>
          </div>

          {/* Memory clip strip */}
          {sessionMemories.length > 0 && (
            <div className="px-5 pb-4">
              <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-3 mb-2">
                Memories · {sessionMemories.length}
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-col md:overflow-x-visible">
                {sessionMemories.map((m) => (
                  <MemoryClipChip key={m.id} memory={m} fmt={fmt} onSeek={seekToSeconds} />
                ))}
              </div>
            </div>
          )}

          {/* Desktop mini-player inside left col */}
          <div className="hidden md:block mt-auto px-5 pb-5 pt-4 border-t border-paper-400/60">
            <div className="bg-ink/95 text-paper-50 rounded-full px-3 py-2 flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="h-9 w-9 rounded-full bg-paper-50 text-ink flex items-center justify-center shrink-0"
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
                <Waveform bars={8} color="#F1E6CE" />
              ) : (
                <div className="flex items-center gap-[3px] h-6">
                  {Array.from({ length: 8 }).map((_, i) => (
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

        {/* ── Right col: transcript ── */}
        <div className="flex-1 min-w-0 px-5 pb-32 md:pb-8 md:px-6 md:pt-5">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, pi) => (
              <div key={pi} className="mb-6">
                <button
                  onClick={() => seekToSeconds(para[0].start)}
                  className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-3 mb-1.5 hover:text-burgundy transition-colors"
                >
                  {fmt(para[0].start)}
                </button>
                <p className="font-serif text-[15px] leading-[1.7] text-ink-2">
                  {para.map((w) => {
                    const isActive = w.idx === activeWordIdx
                    return (
                      <span key={w.idx}>
                        <span
                          ref={isActive ? activeRef : null}
                          onClick={() => seekToSeconds(w.start)}
                          className={cn(
                            'cursor-pointer rounded px-[2px] -mx-[2px] transition-colors duration-75',
                            isActive
                              ? 'bg-burgundy/20 text-ink'
                              : 'hover:bg-paper-200/80'
                          )}
                        >
                          {w.word.trim()}
                        </span>
                        {' '}
                      </span>
                    )
                  })}
                </p>
              </div>
            ))
          ) : transcript ? (
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
      </div>

      {toast && (
        <div className="fixed top-16 left-0 right-0 flex justify-center pointer-events-none z-30">
          <div className="bg-ink/95 text-paper-50 rounded-full px-4 py-2 font-mono text-[10px] tracking-[0.18em] uppercase shadow-photo">
            {toast}
          </div>
        </div>
      )}

      {/* ── Mobile-only floating mini player ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 pointer-events-none">
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
    </PageTransition>
  )
}

function MemoryClipChip({ memory, fmt, onSeek }) {
  const clips = memory.clips ?? []
  const firstStart = clips[0]?.start
  return (
    <button
      type="button"
      onClick={() => firstStart != null && onSeek(firstStart)}
      disabled={firstStart == null}
      className="shrink-0 text-left vellum-bg border border-paper-400 rounded-xl px-3 py-2.5 min-w-[140px] max-w-[200px] md:min-w-0 md:max-w-none md:w-full hover:bg-paper-100 transition-colors disabled:cursor-default"
    >
      <p className="font-serif text-[13px] text-ink leading-snug line-clamp-2">
        {memory.title}
      </p>
      {clips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {clips.map((clip, i) => (
            <span
              key={i}
              className="font-mono text-[9px] tracking-[0.12em] uppercase text-burgundy bg-burgundy/10 rounded-full px-2 py-0.5"
            >
              {fmt(clip.start)}
            </span>
          ))}
        </div>
      )}
    </button>
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
