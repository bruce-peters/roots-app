import { useLocation, useNavigate } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { themeById } from '@/lib/themes'
import { MButton as Button } from '@/components/mantle'
import { Icon, LiveDot } from '@/components/icons'
import { PageTransition } from '@/components/page-transition'

export default function ConnectScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { people, addInterview } = useData()

  const personId = location.state?.personId ?? people[0]?.id
  const themeId = location.state?.themeId ?? 'becoming-a-mother'
  const person = people.find((p) => p.id === personId) ?? people[0]
  const theme = themeById(themeId)
  const firstName = person?.name.split(' ')[0] ?? 'them'

  const checks = [
    { t: 'Roots device paired', d: 'Living room · battery 84%' },
    { t: 'Camera framed on the couch', d: 'Re-frame if needed' },
    { t: 'Audio levels good', d: 'Quiet room · −24 dB' },
  ]

  function begin() {
    const interview = addInterview({ personId: person.id, transcript: '' })
    navigate(`/person/${person.id}/recording`, {
      state: { themeId: theme.id, interviewId: interview.id },
    })
  }

  return (
    <PageTransition className="ink-bg min-h-screen flex flex-col text-paper-50 relative overflow-hidden">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <button onClick={() => navigate('/new')} className="text-paper-50/80">
          <Icon.Back width="22" height="22" />
        </button>
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-50/60">
          connecting
        </div>
        <div className="w-6" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
        <div className="relative h-44 w-44 mb-8">
          <div className="absolute inset-0 rounded-full bg-burgundy/30 blur-2xl breath" />
          <div
            className="absolute inset-3 rounded-full bg-burgundy/20 breath"
            style={{ animationDelay: '-1.2s' }}
          />
          <div className="absolute inset-8 rounded-full bg-paper-50/10 backdrop-blur flex items-center justify-center">
            <div className="text-paper-50/95">
              <Icon.Mic width="40" height="40" />
            </div>
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-paper-50/10 rounded-full px-3 py-1.5 backdrop-blur">
            <LiveDot />
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-paper-50/90">
              Roots · paired
            </span>
          </div>
        </div>

        <h2 className="font-serif text-[30px] leading-[1.1] text-paper-50">
          Put your phone <span className="italic">away.</span>
        </h2>
        <p className="font-serif italic text-[16px] text-paper-50/75 mt-3 max-w-[26ch]">
          The next {theme.durationMin || 40} minutes belong to {firstName}. We'll handle the
          listening — you handle the looking.
        </p>

        <div className="mt-9 w-full flex flex-col gap-2.5">
          {checks.map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-paper-50/10 rounded-2xl px-4 py-3 backdrop-blur"
            >
              <span className="h-7 w-7 rounded-full bg-moss/80 flex items-center justify-center">
                <Icon.Check width="14" height="14" />
              </span>
              <div className="flex-1 text-left">
                <div className="font-serif text-[15px] text-paper-50">{it.t}</div>
                <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-paper-50/55">
                  {it.d}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pt-3 pb-6">
        <Button tone="ochre" size="lg" className="w-full" onClick={begin}>
          Begin · {theme.questions.length} questions
        </Button>
        <div className="text-center mt-2.5 font-serif italic text-[13px] text-paper-50/55">
          Hand the phone to {firstName}, or tuck it in your pocket.
        </div>
      </div>
    </PageTransition>
  )
}
