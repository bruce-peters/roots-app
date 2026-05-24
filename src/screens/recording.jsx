import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { supabase } from '@/lib/supabase'
import { themeById } from '@/lib/themes'
import { PageTransition } from '@/components/page-transition'
import { MButton as Button } from '@/components/mantle'
import { Icon, LiveDot, Waveform } from '@/components/icons'

function fmt(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function RecordingScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { people, updateInterview } = useData()
  const person = people.find((p) => p.id === id)
  const themeId = location.state?.themeId ?? 'becoming-a-mother'
  const interviewId = location.state?.interviewId
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
      <PageTransition className="ink-bg min-h-screen flex items-center justify-center text-paper-50/80 font-serif italic">
        Person not found.
      </PageTransition>
    )
  }

  function endSession() {
    if (ending) return
    setEnding(true)
    updateInterview(interviewId, { status: 'completed' })
    // process-interview is now triggered server-side by upload-video once both
    // the transcript and video file are available.
    setTimeout(() => {
      navigate(`/person/${person.id}/interview/${interviewId}`, { replace: true })
    }, 350)
  }

  return (
    <PageTransition className="ink-bg min-h-screen flex flex-col text-paper-50">
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
          {person.name}
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
    </PageTransition>
  )
}
