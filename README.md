# Roots

A mobile web app that works alongside a physical recording device to preserve the life stories of elderly relatives. You start a session from your phone, set it down, and the device records the conversation. After the session, AI processes the recording into a structured timeline, named memories, and a searchable history you can browse or chat with.

**Live app:** https://roots-app-rouge.vercel.app (open on a phone or a ~430px-wide window)

## What it does

Many families never capture the stories their elderly relatives carry. Roots pairs with a dedicated hardware box (camera and microphone) that sits on the table during a conversation. The companion app (this repo) lets you set up a session, suggests interview themes and questions, then tells you to put your phone away so the subject is not distracted. Once the recording finishes, a server-side pipeline transcribes the audio via Whisper, sends the transcript to GPT-4o to extract memories and place life events on a chronological timeline, and syncs the results back to the app in real time. You can then browse that person's timeline by decade, read individual memory cards, rewatch session recordings, and ask the AI questions about what your relative has shared across all their sessions.

## Features

- Grid of "your people" (elderly subjects) with session and memory counts
- Interview setup with AI-suggested themes and questions per session
- "Put your phone away" connect screen so the device can record without distraction
- Realtime sync: memories and timeline update live as the server pipeline runs after each session
- Timeline view grouped by decade, linked to source memories
- Memory cards with source quotes, tags, year, and deep links into the session video at the exact timestamp
- Transcript view with word-level timestamps and a floating mini-player
- RAG chat: ask natural-language questions about a person's history; answers cite specific session moments you can tap into
- Add-person flow with optional profile photo upload
- Warm sepia aesthetic designed to feel like an old photo album

## How it works

```
Hardware device (camera + mic)
        |
        | streams video to Supabase Storage
        v
Supabase DB (interviews table) ← realtime subscription in the app
        |
        | process-interview edge function (triggered post-session)
        |
        +-- Whisper (OpenAI) → transcript + word timestamps
        +-- GPT-4o → memories[] + timeline[] extracted from transcript
        |
        v
people table updated (memories JSONB, timeline JSONB)
        |
        | Realtime pushes change to app
        v
React UI re-renders timeline, memories, sessions

Chat (Ask screen):
  user question → embed-person chunks in DB (pgvector) → top-8 chunks → GPT-4o → streamed SSE response with [cN] citations
```

The app is a React SPA. All state is managed via a single `DataProvider` context backed by Supabase. Realtime Postgres subscriptions keep the UI current without polling.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18, Vite 5 |
| Routing | react-router-dom v6 |
| Styling | Tailwind v4 (CSS `@theme` tokens, no config file), shadcn/ui (New York style) |
| Animation | Framer Motion |
| Backend / DB | Supabase (Postgres, Storage, Edge Functions, Realtime) |
| AI: transcription | OpenAI Whisper (`whisper-1`) |
| AI: extraction | OpenAI GPT-4o (memories + timeline from transcript) |
| AI: chat RAG | OpenAI `text-embedding-3-small` (embed) + GPT-4o (chat), pgvector in Supabase |
| Deployment | Vercel (`vercel.json` present) |

## Getting started

**Prerequisites:** Node 18+, a Supabase project (the free tier works), an OpenAI API key (only needed by the edge functions).

```bash
# 1. Clone and install dependencies (also installs the Supabase CLI as a dev dependency)
git clone https://github.com/bruce-peters/roots-app.git
cd roots-app
npm ci   # or: npm install

# 2. Copy env template and fill in your Supabase project URL and anon key
cp .env.example .env
# Edit .env:
#   VITE_SUPABASE_URL=https://your-ref.supabase.co
#   VITE_SUPABASE_ANON_KEY=your-anon-key

# 3. Link to your Supabase project and push the DB schema
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push

# 4. Set the OpenAI key as a function secret, then deploy all edge functions
#    (verify_jwt = false for each function is configured in supabase/config.toml)
npx supabase secrets set OPENAI_API_KEY=sk-...
npm run fn:deploy

# 5. Start the dev server
npm run dev
# → http://localhost:5173
```

The `.env` file is required. Without it, the page is blank and the console shows `supabaseUrl is required.` The migrations create the tables, the `vector` extension, and the `interview-videos` and `profile-photos` storage buckets. The endpoints and the device flow for each edge function are documented in [`supabase/functions/README.md`](supabase/functions/README.md).

**Production build:**

```bash
npm run build    # outputs to dist/
npm run preview  # serve the build locally
```

## Usage

Open the app on a mobile browser (or resize to ~430px wide). From the home screen:

1. Tap a person card to view their Timeline, Memories, and Sessions.
2. Tap the FAB ("Start an interview") to begin a new session.
3. Follow the connect screen to pair the device, then set your phone down.
4. After the session ends, memories and timeline entries appear automatically (driven by the server pipeline).
5. Tap "Ask" on any person screen to chat with the AI about their history.

## Project structure

```
src/
  App.jsx                  # root: splash screen, router, DataProvider wrapper
  data.js                  # seed/fallback data (fake people, memories, timeline)
  index.css                # Tailwind @theme tokens + custom utilities
  lib/
    data-context.jsx       # global state: people, memories, timeline, interviews
    db.js                  # all Supabase reads and writes (the only file that touches supabase.js)
    supabase.js            # browser client (reads VITE_SUPABASE_* env vars)
    portrait.js            # deterministic accent color + palette from person id
    tones.js               # Mantle palette overrides for shadcn Button/Badge
    utils.js               # cn(), mergeClips()
  components/
    ui/                    # shadcn output — do not hand-edit
    mantle.jsx             # MButton / MBadge wrappers that add brand palette
    portrait.jsx           # sepia-tinted avatar placeholders
    icons.jsx              # Icon.* SVG set
    top-bar.jsx            # sticky header
  screens/
    home.jsx               # people grid
    new-interview.jsx      # session setup
    connect.jsx            # device pairing
    recording.jsx          # active recording view
    person.jsx             # Timeline / Memories / Sessions tabs
    transcript.jsx         # session video + Q&A transcript
    memory-detail.jsx      # single memory card
    timeline-entry.jsx     # single timeline event
    ask.jsx                # RAG chat screen
    add-person.jsx         # add a new person

supabase/
  migrations/              # Postgres schema (people, interviews, chunks tables)
  functions/
    process-interview/     # Whisper transcription + GPT-4o memory/timeline extraction
    chat/                  # RAG chat: embed query, vector search, GPT-4o stream
    embed-person/          # index a person's memories/timeline into pgvector chunks
    get-interview-questions/  # AI-suggested questions for a session
    suggest-next-questions/   # real-time question suggestions during a session
    process-transcript/       # device posts the growing live transcript here
    get-interview-status/     # poll interview row for status updates
    upload-video/             # handle video upload from the recording device
    README.md                 # endpoint reference + device session lifecycle

recorder.py                 # mock recording device (Python CLI), see below
```

## Mock recording device (`recorder.py`)

`recorder.py` is a Python CLI that stands in for the hardware box. It records the mic, transcribes locally with faster-whisper, and posts the growing transcript to `process-transcript`. It also polls `get-interview-questions` and shows the suggested follow-ups in a terminal UI. Unless you pass `--no-video`, it records the webcam and sends the video to `upload-video` at the end. It needs an active interview, so start one from the app's Connect screen first.

```bash
pip install faster-whisper sounddevice numpy requests rich opencv-python
python recorder.py --help
python recorder.py                    # real mic + webcam
python recorder.py --mock --no-video  # canned transcript, no mic/camera (needs only requests + rich)
```

`SUPABASE_URL` and `ANON_KEY` are hard-coded near the top of the file and point at the original project. Change them to your project's values before you run it. (`--help` was tested here. The mic, webcam and network paths need real hardware and were not tested.)

## Status

Active development. The React frontend and Supabase backend are both wired (this is past the fake-data prototype stage). The hardware device side (video streaming, the recorder itself) is not in this repo. All AI features (Whisper, GPT-4o extraction, RAG chat) are implemented in Supabase Edge Functions and are functional given a valid `OPENAI_API_KEY`. `recorder.py` in the repo root is a mock of the device side (see above).
