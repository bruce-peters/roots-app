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
 *                        transcript text,
 *                        active, shift_question, deeper_question
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
    photo_url: row.photo_url || null,
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
    status: row.status ?? 'started',
    active: row.active ?? false,
    shift_question: row.shift_question ?? null,
    deeper_question: row.deeper_question ?? null,
    video: row.video ?? null,
    transcriptWords: Array.isArray(row.transcript_words) ? row.transcript_words : [],
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
    photo_url: person.photo_url || null,
  })
  if (error) throw error
}

/**
 * Upload a photo file to the profile-photos bucket and return the public URL.
 * Path: profile-photos/{personId}/{uuid}.{ext}
 * If the bucket is missing (e.g. migration not yet pushed) it tries to create
 * it once before retrying the upload.
 */
export async function uploadProfilePhoto(personId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${personId}/${crypto.randomUUID()}.${ext}`

  async function attemptUpload() {
    const { error } = await supabase.storage
      .from('profile-photos')
      .upload(path, file, { upsert: true, contentType: file.type })
    return error
  }

  let upErr = await attemptUpload()

  // If the bucket doesn't exist yet, create it then retry once.
  if (upErr && upErr.message?.toLowerCase().includes('bucket not found')) {
    await supabase.storage.createBucket('profile-photos', { public: true })
    upErr = await attemptUpload()
  }

  if (upErr) throw upErr
  const { data } = supabase.storage.from('profile-photos').getPublicUrl(path)
  return data.publicUrl
}

/**
 * Persist a photo URL on a person row.
 */
export async function updatePersonPhoto(personId, photoUrl) {
  await _patchPerson(personId, { photo_url: photoUrl })
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
  // Explicitly deactivate any lingering active interview first.
  // The DB trigger (interviews_enforce_single_active) does this too, but it
  // requires SECURITY DEFINER privileges to UPDATE as the anon role — belt
  // and suspenders here avoids a 409 conflict if that ever lags or is missing.
  await supabase.from('interviews').update({ active: false }).eq('active', true)

  const { error } = await supabase.from('interviews').insert({
    id: interview.id,
    person_id: interview.personId,
    time: new Date().toISOString(),
    transcript: typeof transcript === 'string' ? transcript : '',
    active: true,
  })
  if (error) throw error
}

export async function updateInterview(id, patch) {
  const dbPatch = {}
  if (typeof patch.transcript === 'string') dbPatch.transcript = patch.transcript
  if (patch.active != null) dbPatch.active = patch.active
  if (patch.status != null) dbPatch.status = patch.status
  const { error } = await supabase.from('interviews').update(dbPatch).eq('id', id)
  if (error) throw error
}

export async function deleteInterview(id) {
  const { error } = await supabase.from('interviews').delete().eq('id', id)
  if (error) throw error
}

/**
 * Fetch just the video URL for a single interview.
 * Used by the transcript screen to poll until the device has uploaded the recording.
 * Returns the public URL string, or null if not yet available.
 */
export async function fetchInterviewVideo(id) {
  const { data, error } = await supabase
    .from('interviews')
    .select('video')
    .eq('id', id)
    .single()
  if (error) throw error
  return data?.video ?? null
}

// ─── chat (RAG) ──────────────────────────────────────────────────────────────

/**
 * Stream a RAG chat response from the /chat edge function.
 *
 *   personId   uuid | null — null = ask across all relatives
 *   messages   [{ role: 'user'|'assistant', content: string }]
 *   onSources  fn(sources[]) — fires once before any text deltas
 *   onDelta    fn(text)      — fires repeatedly as the model streams
 *   signal     optional AbortSignal
 *
 * Returns a promise that resolves when the stream is fully consumed.
 */
export async function streamChat({ personId, messages, onSources, onDelta, signal }) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${url}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ personId, messages }),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`chat ${res.status}: ${text}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    // SSE: event blocks split by blank line.
    let idx
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      let event = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!data) continue
      try {
        const j = JSON.parse(data)
        if (event === 'sources') onSources?.(j)
        else if (event === 'delta') onDelta?.(j.text ?? '')
        else if (event === 'error') throw new Error(j.message || 'chat error')
      } catch (e) {
        if (event === 'error') throw e
      }
    }
  }
}

/**
 * Rebuild RAG chunks for a person. Fire-and-forget from the UI; the chat
 * screen calls this once on mount when it spots an unindexed person.
 */
export async function reindexPerson(personId) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  await fetch(`${url}/functions/v1/embed-person`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ personId }),
  })
}

/**
 * Count of indexed chunks for a person — used to decide whether to trigger a
 * reindex when the chat screen opens for the first time.
 */
export async function countChunksFor(personId) {
  const { count, error } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', personId)
  if (error) return 0
  return count ?? 0
}

/**
 * Fetch the transcript text + word timestamps for a single interview.
 * Used by the transcript screen to poll until Whisper has finished.
 * Returns { text: string|null, words: WordTimestamp[] }.
 */
export async function fetchInterviewTranscript(id) {
  const { data, error } = await supabase
    .from('interviews')
    .select('transcript, transcript_words')
    .eq('id', id)
    .single()
  if (error) throw error
  return {
    text: typeof data?.transcript === 'string' ? data.transcript : null,
    words: Array.isArray(data?.transcript_words) ? data.transcript_words : [],
  }
}
