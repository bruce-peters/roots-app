import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { MBadge as Badge } from '@/components/mantle'
import { Portrait } from '@/components/portrait'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'
import { PageTransition } from '@/components/page-transition'

const FAMILY_RELATIONS = [
  'mother',
  'father',
  'grandmother',
  'grandfather',
  'aunt',
  'uncle',
  'great-aunt',
  'great-uncle',
  'dad',
  'mom',
  'nana',
  'pop',
  'grandma',
  'grandpa',
]

function isFamily(p) {
  const r = (p.relation || '').toLowerCase()
  return FAMILY_RELATIONS.some((f) => r.includes(f))
}

export default function HomeScreen() {
  const navigate = useNavigate()
  const { people, memories, interviews } = useData()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const totalMemories = memories.length

  const filtered = useMemo(() => {
    let list = [...people]
    if (filter === 'family') list = list.filter(isFamily)
    if (filter === 'recent') {
      list.sort((a, b) => {
        const aHas = interviews.find((it) => it.personId === a.id)
        const bHas = interviews.find((it) => it.personId === b.id)
        if (!!bHas - !!aHas) return !!bHas - !!aHas
        return (b.sessions || 0) - (a.sessions || 0)
      })
    }

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.nick || '').toLowerCase().includes(q) ||
          (p.relation || '').toLowerCase().includes(q) ||
          (p.place || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [people, memories, interviews, filter, query])

  const counts = useMemo(
    () => ({
      all: people.length,
      family: people.filter(isFamily).length,
    }),
    [people, memories, interviews]
  )

  return (
    <PageTransition className="paper-bg min-h-full flex flex-col md:flex-row md:items-start">

      {/* ── Left panel: header / nav (desktop sidebar, mobile top) ── */}
      <div className="md:w-[256px] md:shrink-0 md:self-start md:sticky md:top-0 md:flex md:flex-col md:border-r md:border-paper-400/60 md:min-h-[calc(100vh-48px)]">

        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between gap-3 pb-4">
            <img src="/roots_logo.svg" alt="Roots" className="h-[39px] w-auto" />
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={cn(
                'h-10 w-10 rounded-full border flex items-center justify-center transition shrink-0',
                searchOpen
                  ? 'border-burgundy bg-paper-50 text-burgundy'
                  : 'border-paper-400 bg-paper-50/60 text-ink-2'
              )}
              aria-label="Search people"
            >
              <Icon.Search width="16" height="16" />
            </button>
          </div>
          <div className="mt-1">
            <h1 className="font-serif text-[26px] leading-[1.05] text-ink tracking-tight">
              Your <span className="italic text-burgundy">people</span>.
            </h1>
          </div>
          {searchOpen ? (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, relation, place…"
              className="form-input mt-3"
            />
          ) : (
            <p className="mt-2 font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3">
              {people.length === 0
                ? 'Nobody yet — add someone you love'
                : `${people.length} ${people.length === 1 ? 'story' : 'stories'} · ${totalMemories} ${totalMemories === 1 ? 'memory' : 'memories'}`}
            </p>
          )}
        </div>

        <div className="px-5 pb-4 flex items-center gap-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar grow">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All · {counts.all}
            </FilterChip>
            <FilterChip active={filter === 'family'} onClick={() => setFilter('family')}>
              Family{counts.family ? ` · ${counts.family}` : ''}
            </FilterChip>
          </div>
          <button
            onClick={() => setFilter(filter === 'recent' ? 'all' : 'recent')}
            className={cn(
              'shrink-0 inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.14em] uppercase transition',
              filter === 'recent' ? 'text-burgundy' : 'text-ink-3'
            )}
            aria-label="Sort by recent"
          >
            <span>↓</span> Recent
          </button>
        </div>

        {/* Desktop-only CTA pinned to the bottom of the left panel */}
        {people.length > 0 && (
          <div className="hidden md:flex flex-col mt-auto px-5 pb-6 pt-4 border-t border-paper-400/60 gap-2">
            {totalMemories === 0 && people[0] && (
              <p className="font-serif italic text-[12px] text-ink-3 text-center mb-1 leading-snug">
                {people[0].name.split(' ')[0]} is waiting for their first story.
              </p>
            )}
            <button
              onClick={() => navigate('/new')}
              className="h-12 px-4 rounded-full bg-ink text-paper-50 shadow-[0_8px_24px_-8px_rgba(43,31,21,.5)] flex items-center justify-center gap-2.5"
            >
              <span className="h-7 w-7 rounded-full bg-burgundy flex items-center justify-center">
                <Icon.Mic width="14" height="14" />
              </span>
              <span className="font-serif text-[15px]">Start an interview</span>
            </button>
            <button
              onClick={() => navigate('/ask')}
              className="h-12 px-4 rounded-full border border-paper-400 bg-paper-50/60 text-ink-2 flex items-center justify-center gap-2.5 hover:bg-paper-50 transition"
            >
              <Icon.Sprout width="20" height="20" />
              <span className="font-serif text-[15px]">Chat with Sprout</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Right panel: person grid ── */}
      <div className="flex-1 min-w-0">
        <div className="px-5 md:px-6 md:pt-5 pb-32 md:pb-8 grid grid-cols-2 md:grid-cols-3 gap-4 content-start">
          {filtered.map((p) => {
            const memoryCount = memories.filter((m) => m.personId === p.id).length
            return (
              <Link key={p.id} to={`/person/${p.id}`} className="group flex flex-col text-left">
                <div className="relative rounded-2xl overflow-hidden shadow-card bg-paper-50">
                  <Portrait person={p} ratio="4/5" />
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-paper-50/70" />
                    <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-paper-50/80">
                      {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>
                </div>
                <div className="pt-3 px-1">
                  <div className="font-serif text-[17px] text-ink leading-tight">{p.name}</div>
                  <div className="font-serif italic text-[13px] text-ink-3 leading-tight mt-0.5">
                    {p.relation || 'no relation set'} · b. {p.born}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                      {memoryCount} {memoryCount === 1 ? 'memory' : 'memories'}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-ink-4" />
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                      {p.lastSession}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}

          <button
            onClick={() => navigate('/person/new')}
            className="rounded-2xl border border-dashed border-paper-400 aspect-[4/5] flex flex-col items-center justify-center text-ink-3 bg-paper-50/40 hover:bg-paper-50/70 transition"
          >
            <div className="h-11 w-11 rounded-full border border-paper-400 flex items-center justify-center text-ink-2 mb-3">
              <Icon.Plus width="20" height="20" />
            </div>
            <div className="font-serif text-[15px] text-ink">Add someone</div>
            <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3 mt-1">
              new chapter
            </div>
          </button>

          {filtered.length === 0 && people.length > 0 && (
            <div className="col-span-2 md:col-span-3 py-10 text-center">
              <p className="font-serif italic text-[15px] text-ink-3">
                No one matches that filter.
              </p>
              <button
                onClick={() => {
                  setFilter('all')
                  setQuery('')
                }}
                className="mt-2 font-mono text-[10px] tracking-[0.18em] uppercase text-burgundy"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile-only FAB ── */}
      {people.length > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 pointer-events-none">
          <div className="mx-auto max-w-[430px] px-5 pb-7 flex flex-col items-center gap-3">
            {totalMemories === 0 && people[0] && (
              <p className="font-serif italic text-[13px] text-ink-3 text-center max-w-[28ch]">
                {people[0].name.split(' ')[0]} is waiting for their first story.
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/new')}
                className="pointer-events-auto h-14 px-5 rounded-full bg-ink text-paper-50 shadow-[0_10px_28px_-10px_rgba(43,31,21,.6)] flex items-center gap-3"
              >
                <span className="h-8 w-8 rounded-full bg-burgundy flex items-center justify-center">
                  <Icon.Mic width="16" height="16" />
                </span>
                <span className="font-serif text-[15px]">Start an interview</span>
              </button>
              <button
                onClick={() => navigate('/ask')}
                className="pointer-events-auto h-14 w-14 rounded-full bg-paper-50 border border-paper-400 shadow-card text-ink-2 flex items-center justify-center shrink-0"
                aria-label="Chat with Sprout"
              >
                <Icon.Sprout width="20" height="20" />
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  )
}

function FilterChip({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition',
        active
          ? 'bg-burgundy text-paper-50'
          : 'bg-paper-50/60 border border-paper-400 text-ink-2'
      )}
    >
      {children}
    </button>
  )
}
