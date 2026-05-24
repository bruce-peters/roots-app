import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { MButton as Button } from '@/components/mantle'
import { TopBar } from '@/components/top-bar'
import { PageTransition } from '@/components/page-transition'
import { Icon, ChapterRule } from '@/components/icons'

export default function AddPersonScreen() {
  const navigate = useNavigate()
  const { addPerson } = useData()
  const [form, setForm] = useState({
    name: '',
    nick: '',
    relation: '',
    born: '',
    place: '',
  })

  const valid = form.name.trim().length > 0

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function onSubmit(e) {
    e.preventDefault()
    if (!valid) return
    const person = addPerson(form)
    navigate(`/person/${person.id}`, { replace: true })
  }

  return (
    <PageTransition className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate('/')} className="text-ink-2">
            <Icon.Back width="22" height="22" />
          </button>
        }
        title="Add someone"
        sub="a new chapter"
      />
      <form onSubmit={onSubmit} className="flex-1 flex flex-col md:max-w-[600px] md:w-full md:mx-auto">
        <div className="px-5 pt-4 pb-2">
          <h2 className="font-serif text-[26px] leading-[1.1] text-ink">
            Who would you like<br />to <span className="italic text-burgundy">remember</span>?
          </h2>
          <p className="font-serif italic text-[14px] text-ink-3 mt-1.5">
            Just a name to start. The rest grows over time.
          </p>
        </div>

        <div className="px-5 pt-4 flex flex-col gap-3">
          <Field label="Full name" required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Rose Bellini"
              className="form-input"
            />
          </Field>
          <Field label="What you call them">
            <input
              value={form.nick}
              onChange={(e) => update('nick', e.target.value)}
              placeholder="e.g. Nonna Rose"
              className="form-input"
            />
          </Field>
          <Field label="Relation">
            <input
              value={form.relation}
              onChange={(e) => update('relation', e.target.value)}
              placeholder="Grandmother, Father, Aunt…"
              className="form-input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Born">
              <input
                type="number"
                inputMode="numeric"
                value={form.born}
                onChange={(e) => update('born', e.target.value)}
                placeholder="1939"
                className="form-input"
              />
            </Field>
            <Field label="Place">
              <input
                value={form.place}
                onChange={(e) => update('place', e.target.value)}
                placeholder="Salerno → Hoboken"
                className="form-input"
              />
            </Field>
          </div>
        </div>

        <div className="px-5 mt-6">
          <ChapterRule n="·" label="A portrait will be generated" />
          <p className="font-serif italic text-[13px] text-ink-3 mt-3 text-center px-4">
            Add a photo later — for now we'll use a sepia gradient unique to them.
          </p>
        </div>

        <div className="mt-auto px-5 pt-6 pb-6 border-t border-paper-400/60 bg-paper-50/60">
          <Button size="lg" className="w-full" disabled={!valid} type="submit">
            Save & open
          </Button>
        </div>
      </form>
    </PageTransition>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3">
        {label}
        {required && <span className="text-burgundy ml-1">*</span>}
      </span>
      {children}
    </label>
  )
}
