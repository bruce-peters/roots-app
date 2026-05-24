import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'
import { paletteFor, accentFor } from '@/lib/portrait'
import { mergeClips } from '@/lib/utils'
import * as db from '@/lib/db'
import { supabase } from '@/lib/supabase'

const DataContext = createContext(null)

function todayLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

export function DataProvider({ children }) {
  const [people, setPeople] = useState([])
  const [memories, setMemories] = useState([])
  const [timeline, setTimeline] = useState([])
  const [interviews, setInterviews] = useState([])
  const [transcripts, setTranscripts] = useState({})
  const [loading, setLoading] = useState(true)
  // chatHistory: Map<personId|'global', message[]>
  const [chatHistory, setChatHistory] = useState(() => new Map())

  // ── initial load from Supabase ──────────────────────────────────────────
  useEffect(() => {
    db.fetchAll()
      .then(({ people, memories, timeline, interviews, transcripts }) => {
        setPeople(people)
        setMemories(memories)
        setTimeline(timeline)
        setInterviews(interviews)
        setTranscripts(transcripts)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // ── realtime subscriptions ───────────────────────────────────────────────
  // Keep people/memories/timeline/interviews in sync with any server-side
  // writes (e.g. process-interview edge function updating memories/timeline
  // after a session, or the recording device updating the interview row).
  useEffect(() => {
    // ── people table → drives memory + timeline updates ──────────────────
    const peopleCh = supabase
      .channel('rt-people')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'people' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new
            setPeople((prev) => {
              if (prev.some((p) => p.id === row.id)) return prev
              return [...prev, db.rowToPerson(row, [])]
            })
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new
            const mems = Array.isArray(row.memories) ? row.memories : []
            const tls = Array.isArray(row.timeline) ? row.timeline : []

            // Rebuild memories for this person from the authoritative JSONB.
            setMemories((prev) => [
              ...prev.filter((m) => m.personId !== row.id),
              ...mems.map((m) => ({ ...m, personId: row.id })),
            ])

            // Rebuild timeline for this person.
            setTimeline((prev) => [
              ...prev.filter((e) => e.personId !== row.id),
              ...tls.map((e, i) => ({
                ...e,
                id: e.id ?? `t-${row.id}-${i}`,
                personId: row.id,
              })),
            ])

            // Sync scalar person fields and derived counts.
            setPeople((prev) =>
              prev.map((p) => {
                if (p.id !== row.id) return p
                return {
                  ...p,
                  name: row.name,
                  nick: row.nick || '',
                  born: row.dob ? new Date(row.dob).getUTCFullYear() : null,
                  place: row.place || '',
                  relation: row.relation || '',
                  photo_url: row.photo_url || null,
                  memories: mems.length,
                }
              })
            )
          } else if (payload.eventType === 'DELETE') {
            const id = payload.old.id
            setPeople((prev) => prev.filter((p) => p.id !== id))
            setMemories((prev) => prev.filter((m) => m.personId !== id))
            setTimeline((prev) => prev.filter((e) => e.personId !== id))
            setInterviews((prev) => {
              const removed = prev.filter((it) => it.personId === id).map((it) => it.id)
              setTranscripts((tx) => {
                const next = { ...tx }
                removed.forEach((rid) => delete next[rid])
                return next
              })
              return prev.filter((it) => it.personId !== id)
            })
          }
        }
      )
      .subscribe()

    // ── interviews table ─────────────────────────────────────────────────
    const interviewsCh = supabase
      .channel('rt-interviews')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interviews' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new
            setInterviews((prev) => {
              // Skip if already present (optimistic local insert).
              if (prev.some((it) => it.id === row.id)) return prev
              const n = prev.filter((it) => it.personId === row.person_id).length + 1
              const interview = db.rowToInterview(row, n)
              setTranscripts((tx) => ({
                ...tx,
                [row.id]: typeof row.transcript === 'string' ? row.transcript : '',
              }))
              setPeople((ps) =>
                ps.map((p) =>
                  p.id === row.person_id
                    ? { ...p, sessions: p.sessions + 1, lastSession: todayLabel() }
                    : p
                )
              )
              return [...prev, interview]
            })
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new
            setInterviews((prev) =>
              prev.map((it) => {
                if (it.id !== row.id) return it
                return {
                  ...it,
                  status: row.status ?? it.status,
                  active: row.active ?? it.active,
                  video: row.video ?? it.video,
                  transcriptWords: Array.isArray(row.transcript_words)
                    ? row.transcript_words
                    : it.transcriptWords,
                }
              })
            )
            if (typeof row.transcript === 'string') {
              setTranscripts((prev) => ({ ...prev, [row.id]: row.transcript }))
            }
          } else if (payload.eventType === 'DELETE') {
            const id = payload.old.id
            setInterviews((prev) => {
              const target = prev.find((it) => it.id === id)
              if (target) {
                setPeople((ps) =>
                  ps.map((p) =>
                    p.id === target.personId
                      ? { ...p, sessions: Math.max(0, p.sessions - 1) }
                      : p
                  )
                )
              }
              return prev.filter((it) => it.id !== id)
            })
            setTranscripts((prev) => {
              const next = { ...prev }
              delete next[id]
              return next
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(peopleCh)
      supabase.removeChannel(interviewsCh)
    }
  }, [])

  // ── people ───────────────────────────────────────────────────────────────

  const addPerson = useCallback((input) => {
    const id = crypto.randomUUID()
    const person = {
      id,
      name: input.name,
      nick: input.nick || '',
      born: Number(input.born) || new Date().getFullYear() - 70,
      place: input.place || '',
      relation: input.relation || '',
      accent: accentFor(id),
      palette: paletteFor(id),
      lastSession: '—',
      sessions: 0,
      memories: 0,
      hours: 0,
    }
    setPeople((prev) => [...prev, person])
    db.insertPerson(person).catch(console.error)
    return person
  }, [])

  const updatePersonPhoto = useCallback((personId, photoUrl) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === personId ? { ...p, photo_url: photoUrl } : p))
    )
    db.updatePersonPhoto(personId, photoUrl).catch(console.error)
  }, [])

  const deletePerson = useCallback((id) => {
    setPeople((prev) => prev.filter((p) => p.id !== id))
    setMemories((prev) => prev.filter((m) => m.personId !== id))
    setTimeline((prev) => prev.filter((e) => e.personId !== id))
    setInterviews((prev) => {
      const removed = prev.filter((it) => it.personId === id).map((it) => it.id)
      setTranscripts((tx) => {
        const next = { ...tx }
        removed.forEach((rid) => delete next[rid])
        return next
      })
      return prev.filter((it) => it.personId !== id)
    })
    db.deletePerson(id).catch(console.error)
  }, [])

  // ── memories ─────────────────────────────────────────────────────────────

  const addMemory = useCallback((input) => {
    const id = `m-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`
    const memory = {
      id,
      personId: input.personId,
      title: input.title || 'Untitled memory',
      tags: input.tags || [],
      snippet: input.snippet || '',
      year: input.year || null,
      photos: 0,
      sourceInterviewId: input.sourceInterviewId || null,
      // Merge any AI-provided clip segments; adjacent/overlapping clips within
      // 3 seconds are combined into a single range.
      clips: mergeClips(input.clips ?? []),
    }
    setMemories((prev) => {
      const next = [memory, ...prev]
      db.upsertPersonMemories(
        input.personId,
        next.filter((m) => m.personId === input.personId)
      ).catch(console.error)
      return next
    })
    setPeople((prev) =>
      prev.map((p) => (p.id === input.personId ? { ...p, memories: p.memories + 1 } : p))
    )
    return memory
  }, [])

  const updateMemory = useCallback((id, patch) => {
    setMemories((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      const target = next.find((m) => m.id === id)
      if (target) {
        db.upsertPersonMemories(
          target.personId,
          next.filter((m) => m.personId === target.personId)
        ).catch(console.error)
      }
      return next
    })
  }, [])

  const deleteMemory = useCallback((id) => {
    setMemories((prev) => {
      const target = prev.find((m) => m.id === id)
      const next = prev.filter((m) => m.id !== id)
      if (target) {
        setPeople((ps) =>
          ps.map((p) =>
            p.id === target.personId ? { ...p, memories: Math.max(0, p.memories - 1) } : p
          )
        )
        db.upsertPersonMemories(
          target.personId,
          next.filter((m) => m.personId === target.personId)
        ).catch(console.error)
      }
      return next
    })
  }, [])

  // ── timeline ──────────────────────────────────────────────────────────────

  const addTimelineEntry = useCallback((input) => {
    const id = `t-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`
    const entry = {
      id,
      personId: input.personId,
      year: Number(input.year),
      decade: `${Math.floor(Number(input.year) / 10) * 10}s`,
      title: input.title || '',
      body: input.body || '',
      memories: input.memories || [],
    }
    setTimeline((prev) => {
      const next = [...prev, entry]
      db.upsertPersonTimeline(
        input.personId,
        next.filter((e) => e.personId === input.personId)
      ).catch(console.error)
      return next
    })
    return entry
  }, [])

  const updateTimelineEntry = useCallback((id, patch) => {
    setTimeline((prev) => {
      const next = prev.map((e) => {
        if (e.id !== id) return e
        const updated = { ...e, ...patch }
        if (patch.year != null) {
          updated.year = Number(patch.year)
          updated.decade = `${Math.floor(updated.year / 10) * 10}s`
        }
        return updated
      })
      const target = next.find((e) => e.id === id)
      if (target) {
        db.upsertPersonTimeline(
          target.personId,
          next.filter((e) => e.personId === target.personId)
        ).catch(console.error)
      }
      return next
    })
  }, [])

  const deleteTimelineEntry = useCallback((id) => {
    setTimeline((prev) => {
      const target = prev.find((e) => e.id === id)
      const next = prev.filter((e) => e.id !== id)
      if (target) {
        db.upsertPersonTimeline(
          target.personId,
          next.filter((e) => e.personId === target.personId)
        ).catch(console.error)
      }
      return next
    })
  }, [])

  // ── interviews ────────────────────────────────────────────────────────────

  const updateInterview = useCallback((id, patch) => {
    setInterviews((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    )
    if (typeof patch.transcript === 'string') {
      setTranscripts((prev) => ({ ...prev, [id]: patch.transcript }))
    }
    db.updateInterview(id, patch).catch(console.error)
  }, [])

  const addInterview = useCallback(
    (input) => {
      const id = crypto.randomUUID()
      const personInterviews = interviews.filter((it) => it.personId === input.personId)
      const n = personInterviews.length + 1
      const transcript = typeof input.transcript === 'string' ? input.transcript : ''
      const interview = {
        id,
        personId: input.personId,
        n,
        date: input.date || todayLabel() + ', ' + new Date().getFullYear(),
        status: 'started',
      }
      setInterviews((prev) => [interview, ...prev])
      setTranscripts((prev) => ({ ...prev, [id]: transcript }))
      setPeople((prev) =>
        prev.map((p) =>
          p.id === input.personId
            ? { ...p, sessions: p.sessions + 1, lastSession: todayLabel() }
            : p
        )
      )
      db.insertInterview(interview, transcript).catch(console.error)
      return interview
    },
    [interviews]
  )

  // ── chat history ──────────────────────────────────────────────────────────

  const getChatMessages = useCallback((personId) => {
    return chatHistory.get(personId ?? 'global') ?? []
  }, [chatHistory])

  const setChatMessages = useCallback((personId, updater) => {
    setChatHistory((prev) => {
      const key = personId ?? 'global'
      const current = prev.get(key) ?? []
      const next = new Map(prev)
      next.set(key, typeof updater === 'function' ? updater(current) : updater)
      return next
    })
  }, [])

  const clearChat = useCallback((personId) => {
    setChatHistory((prev) => {
      const next = new Map(prev)
      next.delete(personId ?? 'global')
      return next
    })
  }, [])

  // ── context value ─────────────────────────────────────────────────────────

  const value = useMemo(
    () => ({
      loading,
      people,
      memories,
      timeline,
      interviews,
      transcripts,
      addPerson,
      deletePerson,
      updatePersonPhoto,
      addMemory,
      updateMemory,
      deleteMemory,
      addTimelineEntry,
      updateTimelineEntry,
      deleteTimelineEntry,
      addInterview,
      updateInterview,
      getChatMessages,
      setChatMessages,
      clearChat,
    }),
    [
      loading,
      people,
      memories,
      timeline,
      interviews,
      transcripts,
      addPerson,
      deletePerson,
      updatePersonPhoto,
      addMemory,
      updateMemory,
      deleteMemory,
      addTimelineEntry,
      updateTimelineEntry,
      deleteTimelineEntry,
      addInterview,
      updateInterview,
      getChatMessages,
      setChatMessages,
      clearChat,
    ]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}

export function useMemoriesFor(personId) {
  const { memories } = useData()
  return useMemo(() => memories.filter((m) => m.personId === personId), [memories, personId])
}

export function useTimelineFor(personId) {
  const { timeline } = useData()
  return useMemo(
    () => [...timeline.filter((e) => e.personId === personId)].sort((a, b) => a.year - b.year),
    [timeline, personId]
  )
}

export function useInterviewsFor(personId) {
  const { interviews } = useData()
  return useMemo(
    () => [...interviews.filter((it) => it.personId === personId)].sort((a, b) => b.n - a.n),
    [interviews, personId]
  )
}
