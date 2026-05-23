/**
 * db.js — Supabase IO layer for Roots.
 *
 * This is the only file that imports from supabase.js. All reads and writes
 * go through here so data-context.jsx stays clean.
 *
 * Schema notes:
 *  - public.people  : id (uuid), name, nick, relation, place, dob (date),
 *                     memories jsonb, timeline jsonb
 *  - public.interviews : id (uuid), person_id, time (timestamptz),
 *                        transcript text, duration,
 *                        active, started, shift_question, deeper_question
 *
 * App shape vs DB shape:
 *  person.born  ↔ dob stored as "${year}-01-01"; read via new Date(dob).getUTCFullYear()
 *  person.id    ↔ uuid — use crypto.randomUUID() on the client
 *  interview.date ↔ derived from `time` via toLocaleDateString
 *  interview.n    ↔ rank within person by ascending time (computed here)
 */

import { supabase } from '@/lib/supabase'
import { accentFor, paletteFor } from '@/lib/portrait'

// ─── helpers ────────────────────────────────────────────────────────────────

function rowToPerson(row, interviewsForPerson) {
  const born = row.dob ? new Date(row.dob).getUTCFullYear() : null
  const lastInterview = interviewsForPerson.at(-1) // already sorted asc
  const lastSession = lastInterview
    ? new Date(lastInterview.time).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    : '—'
  const memories = Array.isArray(row.memories) ? row.memories : []
  return {
    id: row.id,
    name: row.name,
    nick: row.nick || '',
    born,
    place: row.place || '',
    relation: row.relation || '',
    accent: accentFor(row.id),
    palette: paletteFor(row.id),
    lastSession,
    sessions: interviewsForPerson.length,
    memories: memories.length,
    hours: 0, // not stored; could be derived from duration later
  }
}

function rowToInterview(row, n) {
  return {
    id: row.id,
    personId: row.person_id,
    n,
    date: new Date(row.time).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }),
    duration: row.duration || '00:00',
    status: 'transcribed',
    active: row.active ?? false,
    started: row.started ?? false,
    shift_question: row.shift_question ?? null,
    deeper_question: row.deeper_question ?? null,
  }
}

// ─── fetchAll ────────────────────────────────────────────────────────────────

/**
 * Load everything from Supabase and return it shaped for the app's state.
 * Returns { people, memories, timeline, interviews, transcripts }.
 */
export async function fetchAll() {
  const [{ data: peopleRows, error: pErr }, { data: interviewRows, error: iErr }] =
    await Promise.all([
      supabase.from('people').select('*').order('created_at', { ascending: true }),
      supabase.from('interviews').select('*').order('time', { ascending: true }),
    ])

  if (pErr) throw pErr
  if (iErr) throw iErr

  // Group interviews by person_id so we can derive counters and rank n.
  const interviewsByPerson = {}
  for (const row of interviewRows ?? []) {
    if (!interviewsByPerson[row.person_id]) interviewsByPerson[row.person_id] = []
    interviewsByPerson[row.person_id].push(row)
  }

  // Map people rows → app shape.
  const people = (peopleRows ?? []).map((row) =>
    rowToPerson(row, interviewsByPerson[row.id] ?? [])
  )

  // Flatten memories and timeline from JSONB columns, tagging with personId.
  const memories = []
  const timeline = []
  for (const row of peopleRows ?? []) {
    const mems = Array.isArray(row.memories) ? row.memories : []
    for (const m of mems) {
      memories.push({ ...m, personId: row.id })
    }
    const tls = Array.isArray(row.timeline) ? row.timeline : []
    tls.forEach((e, i) => {
      timeline.push({ ...e, id: e.id ?? `t-${row.id}-${i}`, personId: row.id })
    })
  }

  // Map interview rows → app shape and build transcripts map.
  const interviews = []
  const transcripts = {}
  for (const row of interviewRows ?? []) {
    const personInterviews = interviewsByPerson[row.person_id] ?? []
    const n = personInterviews.findIndex((r) => r.id === row.id) + 1
    interviews.push(rowToInterview(row, n))
    transcripts[row.id] = typeof row.transcript === 'string' ? row.transcript : ''
  }

  return { people, memories, timeline, interviews, transcripts }
}

// ─── people writes ──────────────────────────────────────────────────────────

export async function insertPerson(person) {
  const { error } = await supabase.from('people').insert({
    id: person.id,
    name: person.name,
    nick: person.nick || null,
    relation: person.relation || null,
    place: person.place || null,
    dob: person.born ? `${person.born}-01-01` : null,
    memories: [],
    timeline: [],
  })
  if (error) throw error
}

export async function deletePerson(id) {
  const { error } = await supabase.from('people').delete().eq('id', id)
  if (error) throw error
}

// Generic low-level patch (used internally).
async function _patchPerson(id, patch) {
  const { error } = await supabase.from('people').update(patch).eq('id', id)
  if (error) throw error
}

export async function upsertPersonMemories(personId, memoriesArray) {
  // Strip the local-only personId tag before storing.
  const toStore = memoriesArray.map(({ personId: _pid, ...rest }) => rest)
  await _patchPerson(personId, { memories: toStore })
}

export async function upsertPersonTimeline(personId, timelineArray) {
  // Strip the local-only personId tag before storing.
  const toStore = timelineArray.map(({ personId: _pid, ...rest }) => rest)
  await _patchPerson(personId, { timeline: toStore })
}

// ─── interview writes ────────────────────────────────────────────────────────

export async function insertInterview(interview, transcript) {
  const { error } = await supabase.from('interviews').insert({
    id: interview.id,
    person_id: interview.personId,
    time: new Date().toISOString(),
    duration: interview.duration || null,
    transcript: typeof transcript === 'string' ? transcript : '',
    active: true, // new interviews are always the active one; trigger deactivates any prior
  })
  if (error) throw error
}

export async function deleteInterview(id) {
  const { error } = await supabase.from('interviews').delete().eq('id', id)
  if (error) throw error
}
