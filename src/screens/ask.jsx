import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import * as db from '@/lib/db'
import { TopBar } from '@/components/top-bar'
import { PageTransition } from '@/components/page-transition'
import { Icon } from '@/components/icons'
import { MBadge as Badge } from '@/components/mantle'
import { cn } from '@/lib/utils'

// Map a citation source → a place in the app the user can tap into.
// Returns { to, state } for react-router or null when there's nowhere to go.
function navTargetFor(source) {
  if (!source) return null
  if (source.kind === 'transcript' && source.interview_id) {
    return {
      to: `/person/${source.person_id}/interview/${source.interview_id}`,
      state: source.start_sec != null ? { seekTo: Math.floor(source.start_sec) } : undefined,
    }
  }
  if (source.kind === 'memory' && source.ref_id) {
    return { to: `/person/${source.person_id}/memory/${source.ref_id}` }
  }
  if (source.kind === 'timeline' && source.ref_id) {
    return { to: `/person/${source.person_id}/timeline/${source.ref_id}` }
  }
  return { to: `/person/${source.person_id}` }
}

function fmtTime(sec) {
  if (sec == null) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function sourceLabel(s) {
  if (s.kind === 'transcript') {
    const t = fmtTime(s.start_sec)
    return t ? `Session · ${t}` : 'Session'
  }
  if (s.kind === 'memory') return s.title || 'Memory'
  if (s.kind === 'timeline') return s.year ? `${s.year} · ${s.title ?? ''}`.trim() : (s.title || 'Timeline')
  return 'Source'
}

// Split assistant text on [cN] tags so we can render citation chips inline.
function renderWithCitations(text, sources, onTapSource) {
  if (!text) return null
  const parts = []
  const re = /\[c(\d+)\]/g
  let last = 0
  let match
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={`t${key++}`}>{text.slice(last, match.index)}</span>)
    const n = Number(match[1])
    const s = sources.find((x) => x.n === n)
    parts.push(
      <button
        key={`c${key++}`}
        type="button"
        onClick={() => s && onTapSource(s)}
        className="inline-flex items-center align-baseline mx-0.5 px-1.5 py-[1px] rounded-full bg-rose/15 border border-rose/40 font-mono text-[9px] tracking-[0.1em] uppercase text-burgundy hover:bg-rose/25 transition"
        title={s ? sourceLabel(s) : `Source ${n}`}
      >
        c{n}
      </button>
    )
    last = re.lastIndex
  }
  if (last < text.length) parts.push(<span key={`t${key++}`}>{text.slice(last)}</span>)
  return parts
}

export default function AskScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { people, getChatMessages, setChatMessages, clearChat } = useData()

  const personId = id ?? null
  const person = personId ? people.find((p) => p.id === personId) : null
  const firstName = person ? person.name.split(' ')[0] : null

  const messages = getChatMessages(personId)
  const setMessages = (updater) => setChatMessages(personId, updater)

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  // One-time: if this person has no indexed chunks yet, kick off a reindex.
  useEffect(() => {
    if (!personId) return
    db.countChunksFor(personId).then((n) => {
      if (n === 0) db.reindexPerson(personId).catch(() => {})
    })
  }, [personId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  const suggestions = useMemo(() => {
    if (personId) {
      const n = firstName ?? 'them'
      return [
        `What did ${n} say about growing up?`,
        `Tell me about a memory that meant a lot to ${n}.`,
        `What stories about family come up most?`,
      ]
    }
    return [
      'Whose stories mention immigration?',
      'Find a memory about a wedding.',
      'What did anyone say about their childhood home?',
    ]
  }, [personId, firstName])

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    setError(null)
    setInput('')
    const nextMsgs = [...messages, { role: 'user', content }]
    setMessages(nextMsgs)
    setMessages((prev) => [...prev, { role: 'assistant', content: '', sources: [] }])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await db.streamChat({
        personId,
        messages: nextMsgs,
        signal: controller.signal,
        onSources: (sources) => {
          setMessages((prev) => {
            const copy = [...prev]
            copy[copy.length - 1] = { ...copy[copy.length - 1], sources }
            return copy
          })
        },
        onDelta: (delta) => {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { ...last, content: (last.content || '') + delta }
            return copy
          })
        },
      })
    } catch (e) {
      if (e.name !== 'AbortError') setError(String(e.message || e))
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function tapSource(s) {
    const target = navTargetFor(s)
    if (target) navigate(target.to, target.state ? { state: target.state } : undefined)
  }

  if (personId && !person) {
    return (
      <PageTransition className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <p className="font-serif italic text-[16px] text-ink-2">We can't find that person.</p>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate(-1)} className="text-ink-2" aria-label="Back">
            <Icon.Back width="22" height="22" />
          </button>
        }
        title={
          <span className="font-serif text-[15px] text-ink">
            {person ? (
              <>Ask <span className="italic text-burgundy">Sprout</span> about {firstName}</>
            ) : (
              <>Chat with <span className="italic text-burgundy">Sprout</span></>
            )}
          </span>
        }
        right={
          messages.length > 0 && (
            <button
              onClick={() => clearChat(personId)}
              className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3 hover:text-burgundy transition"
              aria-label="Clear chat"
            >
              Clear
            </button>
          )
        }
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-5 pt-2 pb-[140px] md:max-w-[720px] md:mx-auto md:w-full"
      >
        {messages.length === 0 && (
          <div className="pt-6">
            <p className="font-serif italic text-[15px] text-ink-3 leading-snug">
              {person
                ? `Ask Sprout anything about ${firstName}'s life — Sprout will cite the sessions and memories that back up what it says.`
                : `Ask Sprout anything about your relatives — Sprout will pull from across everyone's stories and cite the sources.`}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left rounded-2xl border border-paper-400 vellum-bg px-3.5 py-3 font-serif italic text-[14px] text-ink-2 hover:bg-paper-100 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5 pt-4">
          {messages.map((m, i) => (
            <Bubble key={i} message={m} sources={m.sources || []} onTapSource={tapSource} />
          ))}
          {streaming && (
            <div className="flex items-center gap-2 pl-3">
              <span className="h-1.5 w-1.5 rounded-full bg-burgundy animate-pulse" />
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3">
                thinking
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 font-serif italic text-[13px] text-burgundy">{error}</p>
        )}
      </div>

      <Composer
        value={input}
        onChange={setInput}
        onSubmit={() => send()}
        placeholder={person ? `Ask Sprout about ${firstName}…` : 'Ask Sprout about your relatives…'}
        disabled={streaming}
      />
    </PageTransition>
  )
}

function Bubble({ message, sources, onTapSource }) {
  if (message.role === 'user') {
    return (
      <div className="self-end max-w-[88%] rounded-2xl bg-ink text-paper-50 px-4 py-2.5 font-serif text-[15px] leading-snug ml-auto">
        {message.content}
      </div>
    )
  }
  return (
    <div className="max-w-[92%]">
      <div className="rounded-2xl vellum-bg border border-paper-400 px-4 py-3 pl-4 border-l-[3px] border-l-burgundy/50">
        <p className="font-serif italic text-[15px] text-ink-2 leading-relaxed whitespace-pre-wrap">
          {renderWithCitations(message.content || ' ', sources, onTapSource)}
        </p>
      </div>
      {sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.slice(0, 6).map((s) => (
            <button key={s.n} onClick={() => onTapSource(s)} className="shrink-0">
              <SourceChip source={s} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SourceChip({ source }) {
  const tone =
    source.kind === 'memory'   ? 'rose'   :
    source.kind === 'timeline' ? 'ochre'  :
                                 'ink'
  return (
    <Badge tone={tone}>
      <span className="mr-1 font-mono text-[9px] tracking-[0.12em] uppercase opacity-70">
        c{source.n}
      </span>
      <span className="font-serif italic text-[11px]">{sourceLabel(source)}</span>
    </Badge>
  )
}

function Composer({ value, onChange, onSubmit, placeholder, disabled }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
      <div className="mx-auto max-w-[430px] md:max-w-[720px] px-4 pb-5 pt-3 pointer-events-auto">
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit() }}
          className="flex items-center gap-2 vellum-bg rounded-full border border-paper-400 pl-4 pr-1 shadow-[0_10px_28px_-12px_rgba(43,31,21,.45)]"
        >
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-3 font-serif text-[15px] text-ink placeholder:text-ink-3/70 placeholder:italic outline-none"
          />
          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center transition shrink-0',
              disabled || !value.trim()
                ? 'bg-paper-300 text-ink-3'
                : 'bg-burgundy text-paper-50'
            )}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
