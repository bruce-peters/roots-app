import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { MButton as Button } from '@/components/mantle'
import { TopBar } from '@/components/top-bar'
import { Icon } from '@/components/icons'

export default function TimelineEntryScreen() {
  const { id, entryId } = useParams()
  const navigate = useNavigate()
  const { people, timeline, memories, updateTimelineEntry, deleteTimelineEntry } = useData()

  const person = people.find((p) => p.id === id)
  const entry = timeline.find((e) => e.id === entryId)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() =>
    entry
      ? { title: entry.title, body: entry.body, year: entry.year }
      : { title: '', body: '', year: '' }
  )
  const [confirming, setConfirming] = useState(false)

  if (!person || !entry) {
    return (
      <div className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif italic text-[16px] text-ink-2">Entry not found.</p>
          <button
            onClick={() => navigate(`/person/${id}`)}
            className="mt-4 font-mono text-[10px] tracking-[0.18em] uppercase text-burgundy"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  const linkedMemories = entry.memories
    .map((mid) => memories.find((m) => m.id === mid))
    .filter(Boolean)

  function save() {
    updateTimelineEntry(entry.id, {
      title: draft.title,
      body: draft.body,
      year: draft.year,
    })
    setEditing(false)
  }

  function remove() {
    deleteTimelineEntry(entry.id)
    navigate(`/person/${person.id}`, { replace: true })
  }

  return (
    <div className="paper-bg min-h-screen flex flex-col">
      <TopBar
        left={
          <button onClick={() => navigate(`/person/${id}`)} className="text-ink-2">
            <Icon.Back width="22" height="22" />
          </button>
        }
        title="Timeline"
        sub={entry.decade}
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

      <div className="px-5 pt-5 pb-32">
        {editing ? (
          <div className="flex flex-col gap-4">
            <Field label="Year">
              <input
                type="number"
                value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                className="form-input"
              />
            </Field>
            <Field label="Title">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="form-input"
              />
            </Field>
            <Field label="Story">
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="form-input"
                rows={6}
              />
            </Field>
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
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-burgundy">
              {entry.year}
            </div>
            <h1 className="font-serif text-[28px] leading-[1.1] text-ink mt-1">
              {entry.title}
            </h1>
            <p className="font-serif italic text-[17px] text-ink-2 mt-3 leading-[1.5]">
              {entry.body}
            </p>

            {linkedMemories.length > 0 && (
              <div className="mt-8">
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-3 mb-2">
                  Memories from this moment
                </div>
                <div className="flex flex-col gap-2.5">
                  {linkedMemories.map((m) => (
                    <Link
                      key={m.id}
                      to={`/person/${person.id}/memory/${m.id}`}
                      className="block rounded-2xl border border-paper-400 bg-paper-50/70 p-3"
                    >
                      <div className="font-serif text-[16px] text-ink">{m.title}</div>
                      <p className="font-serif italic text-[14px] text-ink-2 mt-1 line-clamp-2">
                        {m.snippet}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-10">
              {confirming ? (
                <div className="rounded-2xl border border-burgundy/40 bg-paper-50 p-4">
                  <p className="font-serif italic text-[15px] text-ink-2">
                    Delete this timeline entry?
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
                  Delete entry
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
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
