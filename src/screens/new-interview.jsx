import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { Avatar } from '@/components/portrait'
import { TopBar } from '@/components/top-bar'
import { Icon } from '@/components/icons'
import { cn } from '@/lib/utils'

export default function NewInterviewScreen() {
  const navigate = useNavigate()
  const { people, interviews } = useData()
  const [selected, setSelected] = useState(people[0]?.id ?? null)

  useEffect(() => {
    if (!selected && people[0]) setSelected(people[0].id)
  }, [people, selected])

  if (people.length === 0) {
    return (
      <div className="paper-bg min-h-screen flex flex-col">
        <TopBar
          left={
            <button onClick={() => navigate('/')} className="text-ink-2">
              <Icon.Back width="22" height="22" />
            </button>
          }
          title="New interview"
        />
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <p className="font-serif text-[20px] text-ink">No one to interview yet.</p>
          <p className="font-serif italic text-[14px] text-ink-3 mt-2">
            Add someone first — the rest follows.
          </p>
          <button
            className="mt-6 h-12 px-6 rounded-full bg-burgundy text-paper-50 font-serif text-[16px]"
            onClick={() => navigate('/person/new')}
          >
            Add someone
          </button>
        </div>
      </div>
    )
  }

  const sel = people.find((p) => p.id === selected) ?? people[0]

  return (
    <div className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate('/')} className="text-ink-2">
              <Icon.Back width="22" height="22" />
            </button>
          }
          title="New interview"
          sub="step 1 of 2"
      />
      <div className="px-5 pt-4 pb-2">
        <h2 className="font-serif text-[26px] leading-[1.1] text-ink">
          Who are we listening to today?
        </h2>
        <p className="font-serif italic text-[14px] text-ink-3 mt-1.5">
          Choose someone, and we'll prepare the right questions.
        </p>
      </div>

      <div className="px-5 pt-3 pb-32 flex flex-col gap-3">
        {people.map((p) => {
          const pSessions = interviews.filter((it) => it.personId === p.id).length
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                'text-left rounded-2xl border p-3 pr-4 flex items-center gap-3 transition',
                selected === p.id
                  ? 'border-burgundy bg-paper-50 shadow-card'
                  : 'border-paper-400 bg-paper-50/60'
              )}
            >
              <Avatar person={p} size={56} />
              <div className="flex-1 min-w-0">
                <div className="font-serif text-[17px] text-ink truncate">{p.name}</div>
                <div className="font-serif italic text-[13px] text-ink-3 truncate">
                  {p.relation || 'no relation set'}
                  {p.place ? ` · ${p.place}` : ''}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                    Session {pSessions + 1}
                  </span>
                  <span className="h-1 w-1 rounded-full bg-ink-4" />
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-3">
                    last · {p.lastSession}
                  </span>
                </div>
              </div>
              <span
                className={cn(
                  'h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0',
                  selected === p.id
                    ? 'border-burgundy bg-burgundy text-paper-50'
                    : 'border-paper-400'
                )}
              >
                {selected === p.id && <Icon.Check width="14" height="14" />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 pointer-events-none">
        <div className="mx-auto max-w-[430px] px-5 pb-7 flex justify-center">
          <button
            onClick={() => navigate('/connect', { state: { personId: sel.id } })}
            className="pointer-events-auto h-16 px-6 rounded-full bg-ink text-paper-50 shadow-[0_10px_28px_-10px_rgba(43,31,21,.6)] flex items-center gap-3"
          >
            <span className="h-9 w-9 rounded-full bg-burgundy flex items-center justify-center">
              <Icon.Mic width="18" height="18" />
            </span>
            <span className="font-serif text-[17px]">
              Start with {sel.name.split(' ')[0]}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
