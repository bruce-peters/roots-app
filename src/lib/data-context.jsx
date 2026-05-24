import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react'
import { paletteFor, accentFor } from '@/lib/portrait'
import * as db from '@/lib/db'

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
        status: 'transcribed',
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
