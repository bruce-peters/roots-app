import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { themeById } from '@/lib/themes'
import { MButton as Button } from '@/components/mantle'
import { Icon, LiveDot, Waveform } from '@/components/icons'

function fmt(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const SAMPLE_ANSWERS = [
  'She paused for a long moment, then started softly.',
  'A small laugh, then: it was just before sunrise.',
  'I held my breath, listening to the kettle in the background.',
  "Her hands moved while she talked, like she was kneading dough.",
  'She closed her eyes. The room got very still.',
  'A long sigh. Then a smile I could hear through the line.',
  'She corrected herself twice, looking for the right word.',
  'It came out in a whisper, like it cost her something.',
  'She laughed, and I laughed, and then she was crying a little.',
  'She tapped the table to keep time with the story.',
  'Three sentences. Then she just looked out the window.',
  'A small story I had never heard before.',
]

export default function RecordingScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { people, addInterview } = useData()
  const person = people.find((p) => p.id === id)
  const themeId = location.state?.themeId ?? 'becoming-a-mother'
  const theme = themeById(themeId)

  const [elapsed, setElapsed] = useState(0)
  const [ending, setEnding] = useState(false)
  const start = useRef(Date.now())

  useEffect(() => {
    const tick = setInterval(() => {
      setElapsed((Date.now() - start.current) / 1000)
    }, 250)
    return () => clearInterval(tick)
  }, [])

  if (!person) {
    return (
      <div className="ink-bg min-h-screen flex items-center justify-center text-paper-50/80 font-serif italic">
        Person not found.
      </div>
    )
  }

  function endSession() {
    if (ending) return
    setEnding(true)
    const seconds = Math.max(60, Math.floor((Date.now() - start.current) / 1000))
    const usedQs = theme.questions.slice(0, Math.min(theme.questions.length, 5))
    const transcript = usedQs.map((q, i) => {
      const stamp = fmt(Math.floor(((i + 1) * seconds) / (usedQs.length + 1)))
      return {
        t: `00:${stamp}`,
        q,
        a: SAMPLE_ANSWERS[i % SAMPLE_ANSWERS.length],
        tags: theme.tags.slice(0, 2),
      }
    })
    const interview = addInterview({
      personId: person.id,
      duration: fmt(seconds),
      transcript,
    })
    setTimeout(() => {
      navigate(`/person/${person.id}/interview/${interview.id}`, { replace: true })
    }, 350)
  }

  return (
    <div className="ink-bg min-h-screen flex flex-col text-paper-50">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="w-6" />
        <div className="flex items-center gap-2">
          <LiveDot />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-50/80">
            recording
          </span>
        </div>
        <div className="w-6" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="relative h-52 w-52 mb-8">
          <div className="absolute inset-0 rounded-full bg-burgundy/30 blur-2xl breath" />
          <div
            className="absolute inset-3 rounded-full bg-burgundy/20 breath"
            style={{ animationDelay: '-1.2s' }}
          />
          <div className="absolute inset-8 rounded-full bg-burgundy/85 flex items-center justify-center">
            <div className="text-paper-50">
              <Icon.Mic width="44" height="44" />
            </div>
          </div>
        </div>

        <div className="font-mono text-[28px] tracking-[0.08em] text-paper-50">
          {fmt(elapsed)}
        </div>
        <div className="mt-2 font-mono text-[10px] tracking-[0.18em] uppercase text-paper-50/55">
          {person.name} · {theme.title.replace(/\.$/, '')}
        </div>

        <div className="mt-8">
          <Waveform bars={20} color="#F1E6CE" />
        </div>

        <p className="mt-10 font-serif italic text-[15px] text-paper-50/65 max-w-[28ch]">
          The Roots box is listening. When you're done, tap End and we'll bring the
          transcript over.
        </p>
      </div>

      <div className="px-5 pt-3 pb-6">
        <Button
          tone="ochre"
          size="lg"
          className="w-full"
          onClick={endSession}
          disabled={ending}
        >
          {ending ? 'Saving session…' : 'End session'}
        </Button>
        <div className="text-center mt-2.5 font-serif italic text-[13px] text-paper-50/55">
          You can stop any time — even one good story is enough.
        </div>
      </div>
    </div>
  )
}
