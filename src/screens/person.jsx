import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useData,
  useMemoriesFor,
  useTimelineFor,
  useInterviewsFor,
} from '@/lib/data-context'
import { Card } from '@/components/ui/card'
import { MBadge as Badge, MButton as Button } from '@/components/mantle'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Portrait } from '@/components/portrait'
import { TopBar } from '@/components/top-bar'
import { Icon, ChapterRule } from '@/components/icons'
import PhotoUpload from '@/components/photo-upload'
import { cn } from '@/lib/utils'
import { PageTransition } from '@/components/page-transition'

function Stat({ n, label }) {
  return (
    <div>
      <div className="font-serif text-[20px] text-ink leading-none">{n}</div>
      <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3 mt-1">
        {label}
      </div>
    </div>
  )
}

function matches(haystack, q) {
  return haystack.toLowerCase().includes(q)
}

export default function PersonScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { people, deletePerson } = useData()
  const person = people.find((p) => p.id === id)
  const memories = useMemoriesFor(id)
  const timeline = useTimelineFor(id)
  const interviews = useInterviewsFor(id)

  const [skeleton, setSkeleton] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSkeleton(false), 240)
    return () => clearTimeout(t)
  }, [])

  if (!person) {
    return (
      <PageTransition className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif italic text-[16px] text-ink-2">We can't find that person.</p>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-burgundy"
          >
            Back home
          </button>
        </div>
      </PageTransition>
    )
  }

  if (skeleton) return <PersonSkeleton />

  const q = query.trim().toLowerCase()
  const filteredTimeline = q
    ? timeline.filter(
        (e) => matches(e.title, q) || matches(e.body, q) || String(e.year).includes(q)
      )
    : timeline
  const filteredMemories = q
    ? memories.filter(
        (m) =>
          matches(m.title, q) ||
          matches(m.snippet, q) ||
          m.tags.some((t) => matches(t, q))
      )
    : memories
  const filteredInterviews = q
    ? interviews.filter(
        (it) => matches(it.date, q)
      )
    : interviews

  const firstName = person.name.split(' ')[0]

  return (
    <PageTransition className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate('/')} className="text-ink-2">
            <Icon.Back width="22" height="22" />
          </button>
        }
        title=""
        right={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setSearchOpen((v) => !v)
                if (searchOpen) setQuery('')
              }}
              className={cn('text-ink-2', searchOpen && 'text-burgundy')}
              aria-label="Search"
            >
              <Icon.Search width="22" height="22" />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="text-ink-2"
              aria-label="More"
            >
              <Icon.More width="22" height="22" />
            </button>
          </div>
        }
        bordered={false}
      />

      {menuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute top-12 right-3 vellum-bg border border-paper-400 rounded-xl shadow-card overflow-hidden min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setMenuOpen(false)
                navigate('/new')
              }}
              className="block w-full text-left px-4 py-3 font-serif text-[15px] text-ink border-b border-paper-400/60 hover:bg-paper-100"
            >
              Start session
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                setConfirming(true)
              }}
              className="block w-full text-left px-4 py-3 font-serif text-[15px] text-burgundy hover:bg-paper-100"
            >
              Delete person
            </button>
          </div>
        </div>
      )}

      {/* ── Two-column layout: stacked on mobile, side-by-side on desktop ── */}
      <div className="flex flex-col md:flex-row md:flex-1">

        {/* ── Left col: portrait + info ── */}
        <div className="px-5 pb-3 md:w-[288px] md:shrink-0 md:px-6 md:pt-5 md:pb-6 md:flex md:flex-col md:gap-4 md:border-r md:border-paper-400/60 md:sticky md:top-[52px] md:self-start md:max-h-[calc(100vh-100px)] md:overflow-y-auto">

          <div className="relative rounded-2xl overflow-hidden shadow-photo group">
            {/* Mobile: wide cinematic ratio */}
            <div className="md:hidden">
              <Portrait person={person} ratio="16/10" />
            </div>
            {/* Desktop: portrait ratio */}
            <div className="hidden md:block">
              <Portrait person={person} ratio="3/4" />
            </div>
            <button
              onClick={() => setPhotoUploadOpen(true)}
              aria-label="Change portrait photo"
              className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-ink/70 backdrop-blur-sm flex items-center justify-center text-paper-50 opacity-80 hover:opacity-100 transition"
            >
              <Icon.Camera width="16" height="16" />
            </button>
          </div>

          <div className="pt-4 md:pt-0">
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-3">
              {person.relation || 'no relation set'} · b. {person.born}
            </div>
            <h1 className="font-serif text-[30px] leading-[1.05] text-ink mt-1 md:text-[26px]">
              {firstName}{' '}
              <span className="italic text-burgundy">
                {person.name.split(' ').slice(1).join(' ')}
              </span>
            </h1>
            {person.place && (
              <p className="font-serif italic text-[14px] text-ink-2 mt-1.5">{person.place}</p>
            )}

            <div className="mt-3 flex items-center gap-4">
              <Stat n={interviews.length} label="sessions" />
              <span className="h-6 w-px bg-paper-400" />
              <Stat n={memories.length} label="memories" />
            </div>
          </div>

          {/* Desktop-only CTAs */}
          <div className="hidden md:flex flex-col mt-auto gap-2">
            <button
              onClick={() => navigate('/connect', { state: { personId: person.id } })}
              className="h-12 px-4 rounded-full bg-ink text-paper-50 shadow-[0_8px_24px_-8px_rgba(43,31,21,.5)] flex items-center justify-center gap-2.5"
            >
              <span className="h-7 w-7 rounded-full bg-burgundy flex items-center justify-center">
                <Icon.Mic width="14" height="14" />
              </span>
              <span className="font-serif text-[15px]">New session with {firstName}</span>
            </button>
            <button
              onClick={() => navigate(`/person/${person.id}/ask`)}
              className="h-12 px-4 rounded-full border border-paper-400 bg-paper-50/60 text-ink-2 flex items-center justify-center gap-2.5 hover:bg-paper-50 transition"
            >
              <Icon.Chat width="16" height="16" />
              <span className="font-serif text-[15px]">Ask about {firstName}</span>
            </button>
          </div>
        </div>

        {/* ── Right col: search + tabs ── */}
        <div className="flex-1 min-w-0 px-5 mt-2 pb-32 md:pb-8 md:px-6 md:pt-4">
          {searchOpen && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timeline, memories, sessions…"
              className="form-input mb-4"
            />
          )}

          <Tabs defaultValue="timeline" className="w-full">
            <TabsList
              variant="line"
              className="w-full border-b border-paper-400 rounded-none p-0 h-auto bg-transparent"
            >
              <TabsTrigger
                value="timeline"
                className="flex-1 py-3.5 font-serif text-[15px] text-ink-3 data-[state=active]:text-ink rounded-none after:bg-burgundy data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Timeline
              </TabsTrigger>
              <TabsTrigger
                value="memories"
                className="flex-1 py-3.5 font-serif text-[15px] text-ink-3 data-[state=active]:text-ink rounded-none after:bg-burgundy data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Memories
                <span className="ml-1.5 font-mono text-[10px] align-top text-ink-4">
                  {memories.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="interviews"
                className="flex-1 py-3.5 font-serif text-[15px] text-ink-3 data-[state=active]:text-ink rounded-none after:bg-burgundy data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Sessions
                <span className="ml-1.5 font-mono text-[10px] align-top text-ink-4">
                  {interviews.length}
                </span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="pt-4">
              <TimelineTab entries={filteredTimeline} personId={person.id} hasAny={timeline.length > 0} />
            </TabsContent>
            <TabsContent value="memories" className="pt-4">
              <MemoriesTab memories={filteredMemories} personId={person.id} hasAny={memories.length > 0} />
            </TabsContent>
            <TabsContent value="interviews" className="pt-4">
              <InterviewsTab interviews={filteredInterviews} personId={person.id} hasAny={interviews.length > 0} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Mobile-only FAB ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 pointer-events-none">
        <div className="mx-auto max-w-[430px] px-5 pb-7 flex items-center justify-center gap-3">
          <button
            onClick={() => navigate('/connect', { state: { personId: person.id } })}
            className="pointer-events-auto h-14 px-5 rounded-full bg-ink text-paper-50 shadow-[0_10px_28px_-10px_rgba(43,31,21,.6)] flex items-center gap-2.5"
          >
            <span className="h-8 w-8 rounded-full bg-burgundy flex items-center justify-center">
              <Icon.Mic width="16" height="16" />
            </span>
            <span className="font-serif text-[15px]">
              New session with {firstName}
            </span>
          </button>
          <button
            onClick={() => navigate(`/person/${person.id}/ask`)}
            className="pointer-events-auto h-14 w-14 rounded-full bg-paper-50 border border-paper-400 shadow-card text-ink-2 flex items-center justify-center shrink-0"
            aria-label={`Ask about ${firstName}`}
          >
            <Icon.Chat width="20" height="20" />
          </button>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6 bg-ink/55 backdrop-blur-sm">
          <div className="w-full max-w-[360px] vellum-bg rounded-2xl border border-paper-400 p-5 shadow-photo">
            <div className="font-serif text-[20px] text-ink">Delete {person.name}?</div>
            <p className="font-serif italic text-[14px] text-ink-2 mt-2">
              Every memory, timeline entry, and session for them will be removed. This can't
              be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                tone="burgundy"
                className="flex-1"
                onClick={() => {
                  deletePerson(person.id)
                  navigate('/', { replace: true })
                }}
              >
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
        </div>
      )}

      {photoUploadOpen && (
        <PhotoUpload person={person} onClose={() => setPhotoUploadOpen(false)} />
      )}
    </PageTransition>
  )
}

function TimelineTab({ entries, personId, hasAny }) {
  if (!hasAny) {
    return (
      <EmptyState
        title="The timeline builds itself."
        body="As you save memories from a session, they'll pin themselves to a year here."
      />
    )
  }
  if (entries.length === 0) {
    return <EmptyState title="No matches in the timeline." body="" small />
  }
  const groups = entries.reduce((acc, e) => {
    ;(acc[e.decade] ??= []).push(e)
    return acc
  }, {})
  return (
    <div className="flex flex-col gap-6">
      {Object.entries(groups).map(([decade, events]) => (
        <div key={decade}>
          <ChapterRule n={decade} label={`${events.length} ${events.length === 1 ? 'moment' : 'moments'}`} />
          <div className="mt-3 relative pl-7">
            <div className="absolute left-2.5 top-1 bottom-1 w-px bg-paper-400" />
            <div className="flex flex-col gap-4">
              {events.map((e) => (
                <Link
                  key={e.id}
                  to={`/person/${personId}/timeline/${e.id}`}
                  className="relative block"
                >
                  <span className="absolute -left-[22px] top-1.5 h-3 w-3 rounded-full bg-paper-50 border-2 border-burgundy" />
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-burgundy">
                    {e.year}
                  </div>
                  <div className="font-serif text-[18px] text-ink leading-tight mt-0.5">
                    {e.title}
                  </div>
                  <p className="font-serif italic text-[14px] text-ink-2 mt-1 leading-snug">
                    {e.body}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Icon.Heart width="12" height="12" className="text-ink-3" />
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                      {e.memories.length}{' '}
                      {e.memories.length === 1 ? 'memory' : 'memories'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function MemoriesTab({ memories, personId, hasAny }) {
  if (!hasAny) {
    return (
      <EmptyState
        title="No memories yet."
        body="When you tap save-as-memory on a transcript line, it'll land here."
      />
    )
  }
  if (memories.length === 0) {
    return <EmptyState title="No matches in memories." body="" small />
  }
  const allTags = [...new Set(memories.flatMap((m) => m.tags))].slice(0, 4)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Badge tone="burgundy">All · {memories.length}</Badge>
          {allTags.map((t) => (
            <Badge key={t} tone="ink">
              {t}
            </Badge>
          ))}
        </div>
      </div>
      {memories.map((m) => (
        <Link key={m.id} to={`/person/${personId}/memory/${m.id}`}>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                {m.year && (
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                    {m.year}
                  </div>
                )}
                <div className="font-serif text-[18px] text-ink leading-tight mt-0.5">
                  {m.title}
                </div>
              </div>
              {m.photos > 0 && (
                <div className="shrink-0 flex items-center gap-1 text-ink-3">
                  <Icon.Camera width="13" height="13" />
                  <span className="font-mono text-[10px]">{m.photos}</span>
                </div>
              )}
            </div>
            <div className="mt-2 pl-3 border-l-2 border-burgundy/40">
              <p className="font-serif italic text-[15px] text-ink-2 leading-snug">
                {m.snippet}
              </p>
            </div>
            {m.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.tags.map((t) => (
                  <Badge key={t} tone="ochre">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </Link>
      ))}
    </div>
  )
}

function InterviewsTab({ interviews, personId, hasAny }) {
  if (!hasAny) {
    return (
      <EmptyState
        title="No sessions yet."
        body="Tap the Record button below to start your first interview."
      />
    )
  }
  if (interviews.length === 0) {
    return <EmptyState title="No matches in sessions." body="" small />
  }
  return (
    <div className="flex flex-col gap-2.5">
      {interviews.map((it) => (
        <Link
          key={it.id}
          to={`/person/${personId}/interview/${it.id}`}
          className="text-left"
        >
          <Card className="p-3.5 flex flex-row items-center gap-3.5">
            <div className="shrink-0 h-14 w-14 rounded-xl bg-paper-200 border border-paper-400 flex flex-col items-center justify-center">
              <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-ink-3">
                №
              </span>
              <span className="font-serif text-[22px] text-ink leading-none">{it.n}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-serif text-[16px] text-ink truncate">{it.date}</div>
              <div className="mt-1 flex items-center gap-2">
                {it.active ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-burgundy animate-pulse" />
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-burgundy">
                      recording
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                    transcribed
                  </span>
                )}
              </div>
            </div>
            <Icon.Back width="18" height="18" className="text-ink-3 rotate-180 shrink-0" />
          </Card>
        </Link>
      ))}
    </div>
  )
}

function EmptyState({ title, body, small }) {
  return (
    <div className={cn('text-center py-10 px-6', small && 'py-6')}>
      <div className="font-serif text-[18px] text-ink">{title}</div>
      {body && (
        <p className="font-serif italic text-[14px] text-ink-3 mt-2 max-w-[34ch] mx-auto">
          {body}
        </p>
      )}
    </div>
  )
}

function PersonSkeleton() {
  return (
    <PageTransition className="paper-bg min-h-screen flex flex-col px-5 pt-14">
      <div className="rounded-2xl bg-paper-200 aspect-[16/10] animate-pulse" />
      <div className="mt-5 h-3 w-24 rounded-full bg-paper-200 animate-pulse" />
      <div className="mt-3 h-8 w-3/4 rounded-md bg-paper-200 animate-pulse" />
      <div className="mt-3 h-3 w-1/2 rounded-full bg-paper-200 animate-pulse" />
      <div className="mt-6 flex gap-4">
        <div className="h-10 w-14 rounded-md bg-paper-200 animate-pulse" />
        <div className="h-10 w-14 rounded-md bg-paper-200 animate-pulse" />
        <div className="h-10 w-14 rounded-md bg-paper-200 animate-pulse" />
      </div>
      <div className="mt-8 h-1 w-full bg-paper-200 animate-pulse rounded" />
      <div className="mt-6 flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-paper-200/80 h-24 animate-pulse" />
        ))}
      </div>
    </PageTransition>
  )
}
