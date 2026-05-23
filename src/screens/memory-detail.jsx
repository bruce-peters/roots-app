import { useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useData } from '@/lib/data-context'
import { MButton as Button, MBadge as Badge } from '@/components/mantle'
import { TopBar } from '@/components/top-bar'
import { Icon } from '@/components/icons'

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
      <div className="paper-bg min-h-screen flex items-center justify-center px-8 text-center">
        <div>
          <p className="font-serif italic text-[16px] text-ink-2">Memory not found.</p>
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
    <div className="paper-bg min-h-screen flex flex-col">
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

      <div className="px-5 pt-5 pb-32">
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
                <Link
                  to={`/person/${person.id}/interview/${source.id}`}
                  className="block font-serif text-[17px] text-ink mt-1"
                >
                  {source.date}
                </Link>
                <div className="font-serif italic text-[13px] text-ink-3 mt-0.5">
                  {source.date} · {source.duration}
                </div>
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
