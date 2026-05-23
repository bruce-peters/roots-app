# Roots

iOS-companion web app for the **Roots** recording device — a physical box (camera + mic)
that records conversations with elderly loved ones. Transcripts and video stream to a
database; an AI builds each person's **timeline**, **memories**, and **interview** records.

Audience: adult children / grandchildren (40s–60s). Mobile-first. Aesthetic: warm,
nostalgic, sepia, like an old photo album.

## Product spec (from the original design brief)

**Hardware:** A standalone box containing a camera + microphone. During an interview it
streams video and transcription to the backend. The companion app starts/manages sessions
but is meant to be **set down** once recording begins — the "Connect" screen explicitly
tells the user to put their phone away so the elderly subject isn't distracted by a screen.

**Data model (conceptual — DB not yet wired):**

- **Person** — an elderly subject. Has many `Interview`s, many `Memory`s, and a `Timeline`.
- **Interview** — one recorded session. Has a video file + an ordered list of
  `{ question, answer_transcript }` pairs. Stored question-keyed: `"Question": "answer"`.
- **Memory** — an AI-extracted story/anecdote. Links to **one or more questions**
  across one or more interviews (the source quotes).
- **Timeline entry** — a life event on the person's chronology. Links to **one or more
  memories**. The timeline is grouped by decade in the UI.

So the lineage is **Interview → Question/Answer → Memory → Timeline entry**, all built
by an AI working server-side after each session. The app is the read/write surface over
that graph.

**User flow:**

1. **Home** — grid of "your people" (elderly subjects). FAB at bottom = start new interview.
2. **New interview** — pick a person; the app suggests a theme + questions for the session.
3. **Connect** — "put your phone away," device pairing + pre-flight checks, then Begin.
4. **Person detail** — three tabs: **Timeline** (by decade), **Memories** (cards), **Sessions** (interview list).
5. **Transcript** — tap a session → faux video player + Q&A list with "save as memory" affordance.

**Scope note from the brief:** *"This should be a brief setup not an indepth thing. Use
fake data for everything."* — Current state matches that: all data is hardcoded in
`src/data.js`. No auth, no real DB calls, no real video. Supabase is scaffolded for the
next pass but not used.

## Stack

- **Vite 5** + **React 18**
- **Tailwind v4** via `@tailwindcss/vite` (no PostCSS config, no `tailwind.config.js`)
  — theme tokens live in `src/index.css` inside `@theme { … }`
- **shadcn/ui** (new-york style, JSX, `cssVariables: true`) — installed via CLI; components
  in `src/components/ui/*` are real shadcn output built on `radix-ui` + `cva`
- `react-router-dom`, `lucide-react`, `clsx`, `tailwind-merge`, `tw-animate-css`
- **Supabase** scaffolding present (`supabase/`, `@supabase/supabase-js`) — not yet wired

## Brand & palette (Tailwind v4 tokens)

Defined in `src/index.css` `@theme` block. Reference these by their Tailwind class names
(e.g. `bg-paper-50`, `text-burgundy`, `text-ink-3`):

| Token             | Hex       | Use                                    |
| ----------------- | --------- | -------------------------------------- |
| `paper` / `paper-50..400` | `#F1E6CE` … | parchment surfaces                 |
| `ink` / `ink-2..4`        | `#2B1F15` … | text, hierarchy                    |
| `burgundy` (+ dark/light) | `#7A2E22`   | primary action, accents            |
| `ochre` (+ light)         | `#B07A2C`   | secondary action                   |
| `moss`                    | `#5E6B3A`  | success / "transcribed"            |
| `rose`                    | `#C28A7C`  | memory/quote chips                 |
| `vellum`                  | `#FBF5E6`  | lighter paper                      |

shadcn variables (`--color-primary`, `--color-background`, etc.) alias to these so
generated components match the theme out of the box.

**Type:** Newsreader (display serif; italic = memory/quote) · DM Sans (UI) ·
JetBrains Mono (timestamps/meta). Loaded from Google Fonts in `index.html`.

**Custom utilities** (in `src/index.css`): `paper-bg`, `vellum-bg`, `ink-bg` (textured
backgrounds), `tab-underline`, `wave-bar`, `breath`, `no-scrollbar`.

## File layout

```
src/
  main.jsx               # ReactDOM root
  App.jsx                # BrowserRouter + routes, wraps in .app-frame (430px wide)
  index.css              # @import "tailwindcss" + @theme tokens + utilities
  data.js                # fake PEOPLE / TIMELINE / MEMORIES / INTERVIEWS / TRANSCRIPT
  lib/
    utils.js             # cn() = twMerge(clsx(...))
    tones.js             # Mantle palette overrides for shadcn Button/Badge variants
  components/
    ui/                  # shadcn output — DO NOT hand-edit; re-run `shadcn add --overwrite`
      button.jsx
      card.jsx
      badge.jsx
      tabs.jsx
    mantle.jsx           # MButton / MBadge thin wrappers that add tones to shadcn primitives
    portrait.jsx         # Avatar + Portrait (sepia-tinted gradient placeholders)
    icons.jsx            # Icon.* SVG set + LiveDot + Waveform + ChapterRule
    top-bar.jsx          # sticky paper-bg header
  screens/
    home.jsx             # grid of people + "Start an interview" FAB
    new-interview.jsx    # person picker + suggested theme card
    connect.jsx          # dark "put your phone away" with breath pulse
    person.jsx           # hero + shadcn Tabs (Timeline / Memories / Sessions)
    transcript.jsx       # faux video panel + Q&A list + floating mini player
```

## Routes

- `/` → `HomeScreen`
- `/new` → `NewInterviewScreen`
- `/connect` → `ConnectScreen`
- `/person/:id` → `PersonScreen`
- `/person/:id/interview/:interviewId` → `TranscriptScreen`

## Conventions

- **Don't hand-edit `src/components/ui/*`.** They're shadcn output. To change a primitive,
  either re-run `npx shadcn@latest add <name> --overwrite`, or wrap it (see `mantle.jsx`).
- **Extend shadcn with className composition.** The Mantle palette isn't in shadcn's stock
  variants — we pass `className` overrides (see `lib/tones.js`) rather than forking the
  primitives. `cn()` + `tailwind-merge` resolves utility conflicts.
- **No `tailwind.config.js`.** Tailwind v4 reads tokens from `@theme {}` in CSS. To add a
  color/shadow/font, add a `--color-*` / `--shadow-*` / `--font-*` variable in `src/index.css`.
- **Path alias `@/`** resolves to `src/` (configured in both `vite.config.js` and `jsconfig.json`).
- **Mobile-first.** App shell pins width to `max-w-[430px]` (iPhone-ish) on a dark background.
  Touch targets ≥ 44pt; primary CTAs 56pt.
- **Type voice:** quotes & memories in `font-serif italic`. UI labels in `font-sans`.
  Timestamps & meta in `font-mono uppercase tracking-wide`.

## Scripts

```
npm run dev       # vite dev (5173)
npm run build     # production build to dist/
npm run preview   # serve dist/
```

If you see a `[postcss] @layer base is used but no matching @tailwind base` error,
delete `node_modules/.vite` and restart — it's stale cache from any prior v3 setup.

## Origin

UI was designed in Claude Design (claude.ai/design) as HTML/CSS/JS prototypes and ported
into this Vite + shadcn project. The original prototype bundle/transcripts are not in the
repo. The fake data (Rose Bellini etc.) came from that prototype and stands in for the
real DB.
