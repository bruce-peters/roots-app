import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { MButton as Button, MBadge as Badge } from '@/components/mantle'
import { TopBar } from '@/components/top-bar'
import { PageTransition } from '@/components/page-transition'
import { Icon } from '@/components/icons'

function fmtTime(secs) {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Clip player that only shows and plays the videoStart → videoEnd window.
// No native controls — custom play/pause overlay + a progress bar scoped to the clip.
// 1 second of padding is added before and after the clip bounds.
function ClipPlayer({ src, start, end }) {
  const paddedStart = Math.max(0, start - 1)
  const paddedEnd = end + 1

  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(paddedStart)
  const clipDuration = paddedEnd - paddedStart

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    function onLoadedMetadata() {
      el.currentTime = paddedStart
    }
    function onTimeUpdate() {
      setPosition(el.currentTime)
      if (el.currentTime >= paddedEnd) {
        el.pause()
        el.currentTime = paddedStart
      }
    }
    function onPlay()  { setPlaying(true) }
    function onPause() { setPlaying(false) }
    function onEnded() { setPlaying(false); if (el) el.currentTime = paddedStart }

    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)

    // If metadata already loaded (e.g. cached), seek immediately
    if (el.readyState >= 1) el.currentTime = paddedStart

    return () => {
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
    }
  }, [src, paddedStart, paddedEnd])

  function toggle() {
    const el = videoRef.current
    if (!el) return
    if (el.paused) {
      if (el.currentTime >= paddedEnd) el.currentTime = paddedStart
      el.play()
    } else {
      el.pause()
    }
  }

  const elapsed = Math.max(0, Math.min(position, paddedEnd) - paddedStart)
  const progressPct = clipDuration > 0 ? (elapsed / clipDuration) * 100 : 0

  return (
    <div className="mt-5 rounded-2xl overflow-hidden border border-paper-400 bg-ink">
      {/* Video constrained to the clip — no native controls */}
      <div className="relative w-full" style={{ aspectRatio: '16/10' }}>
        <video
          ref={videoRef}
          src={`${src}#t=${paddedStart},${paddedEnd}`}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: 'sepia(0.35)' }}
          preload="auto"
          playsInline
        />
        {/* Play / pause overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={toggle}
            className="h-12 w-12 rounded-full bg-paper-50/90 text-ink flex items-center justify-center shadow-photo"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Icon.Pause width="18" height="18" /> : <Icon.Play width="18" height="18" />}
          </button>
        </div>
        {/* Clip-scoped progress bar + timestamps */}
        <div className="absolute left-3 right-3 bottom-3 flex items-center gap-2">
          <span className="font-mono text-[9px] text-paper-50 tracking-[0.12em] bg-ink/50 px-1.5 py-0.5 rounded-full shrink-0">
            {fmtTime(elapsed)}
          </span>
          <div
            className="flex-1 h-1 rounded-full bg-paper-50/30 overflow-hidden cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              const el = videoRef.current
              if (el) el.currentTime = paddedStart + pct * clipDuration
            }}
          >
            <div
              className="h-full bg-paper-50 transition-[width] duration-75 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="font-mono text-[9px] text-paper-50/60 tracking-[0.12em] shrink-0">
            {fmtTime(clipDuration)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function MemoryDetailScreen() {
  const { id, memoryId } = useParams()
  const navigate = useNavigate()
  const { people, memories, interviews, updateMemory, deleteMemory } = useData()

  const person = people.find((p) => p.id === id)
  const memory = memories.find((m) => m.id === memoryId)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() =>
    memory
      ? {
          title: memory.title,
          snippet: memory.snippet,
          tags: memory.tags.join(', '),
          year: memory.year ?? '',
        }
      : { title: '', snippet: '', tags: '', year: '' }
  )
  const [confirming, setConfirming] = useState(false)

  if (!person || !memory) {
    return (
      <PageTransition className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif italic text-[16px] text-ink-2">Memory not found.</p>
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

  const source = memory.sourceInterviewId
    ? interviews.find((it) => it.id === memory.sourceInterviewId)
    : null

  function save() {
    updateMemory(memory.id, {
      title: draft.title.trim() || 'Untitled memory',
      snippet: draft.snippet,
      tags: draft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      year: draft.year === '' ? null : Number(draft.year),
    })
    setEditing(false)
  }

  function remove() {
    deleteMemory(memory.id)
    navigate(`/person/${person.id}`, { replace: true })
  }

  return (
    <PageTransition className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate(`/person/${id}`)} className="text-ink-2">
            <Icon.Back width="22" height="22" />
          </button>
        }
        title="Memory"
        sub={memory.year ? String(memory.year) : ''}
        right={
          !editing && (
            <button
              onClick={() => setEditing(true)}
              className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-2"
            >
              edit
            </button>
          )
        }
      />

      <div className="px-5 pt-5 pb-32 md:max-w-[680px] md:mx-auto md:w-full">
        {editing ? (
          <div className="flex flex-col gap-4">
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="form-input"
              />
            </Field>
            <Field label="Quote / story">
              <textarea
                value={draft.snippet}
                onChange={(e) => setDraft({ ...draft, snippet: e.target.value })}
                className="form-input"
                rows={6}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Year">
                <input
                  type="number"
                  value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                  className="form-input"
                  placeholder="1952"
                />
              </Field>
              <Field label="Tags (comma)">
                <input
                  value={draft.tags}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                  className="form-input"
                  placeholder="family, journey"
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-2">
              <Button className="flex-1" onClick={save}>
                Save
              </Button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3"
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-3">
              {person.name}
              {memory.year ? ` · ${memory.year}` : ''}
            </div>
            <h1 className="font-serif text-[28px] leading-[1.1] text-ink mt-1">
              {memory.title}
            </h1>

            {source?.video && memory.clips?.length > 0 && (
              <ClipPlayer
                src={source.video}
                start={memory.clips[0].start}
                end={memory.clips[0].end}
              />
            )}

            <div className="mt-5 pl-4 border-l-2 border-burgundy/45">
              <p className="font-serif italic text-[18px] text-ink-2 leading-[1.5]">
                {memory.snippet}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {memory.tags.map((t) => (
                <Badge key={t} tone="ochre">
                  {t}
                </Badge>
              ))}
            </div>

            {source && (
              <div className="mt-8 rounded-2xl border border-paper-400 bg-paper-50/70 p-4">
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3">
                  From session
                </div>
                <div className="font-serif text-[17px] text-ink mt-1">
                  Session {source.n} · {source.date}
                </div>
                {memory.clips?.length > 0 && (
                  <button
                    onClick={() =>
                      navigate(`/person/${person.id}/interview/${source.id}`, {
                        state: { seekTo: memory.clips[0].start },
                      })
                    }
                    className="mt-3 w-full flex items-center gap-2.5 py-2.5 px-3.5 rounded-xl bg-ink text-paper-50"
                  >
                    <span className="h-7 w-7 rounded-full bg-burgundy flex items-center justify-center shrink-0">
                      <Icon.Play width="12" height="12" />
                    </span>
                    <span className="font-serif text-[14px]">See quote in interview</span>
                    <span className="font-mono text-[9px] tracking-[0.14em] text-paper-50/55 ml-auto shrink-0">
                      {fmtTime(memory.clips[0].start)}
                    </span>
                  </button>
                )}
              </div>
            )}

            <div className="mt-10">
              {confirming ? (
                <div className="rounded-2xl border border-burgundy/40 bg-paper-50 p-4">
                  <p className="font-serif italic text-[15px] text-ink-2">
                    Delete this memory? This can't be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button tone="burgundy" className="flex-1" onClick={remove}>
                      Delete
                    </Button>
                    <button
                      onClick={() => setConfirming(false)}
                      className="px-4 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3"
                    >
                      cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full font-mono text-[10px] tracking-[0.18em] uppercase text-burgundy py-3"
                >
                  Delete memory
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}
