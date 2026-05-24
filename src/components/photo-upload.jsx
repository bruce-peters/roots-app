import { useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { useData } from '@/lib/data-context'
import * as db from '@/lib/db'
import { cn } from '@/lib/utils'

/**
 * PhotoUpload — bottom sheet that lets the user pick or take a photo for a
 * person, uploads it to Supabase Storage, then persists the URL on the person.
 *
 * Props:
 *   person   — the person object (needs .id, .name)
 *   onClose  — called when the sheet should close
 */
export default function PhotoUpload({ person, onClose }) {
  const { updatePersonPhoto } = useData()
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const [status, setStatus] = useState('idle') // 'idle' | 'uploading' | 'done' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus('uploading')
    setErrorMsg('')
    try {
      const url = await db.uploadProfilePhoto(person.id, file)
      updatePersonPhoto(person.id, url)
      setStatus('done')
      setTimeout(onClose, 820)
    } catch (err) {
      console.error(err)
      setErrorMsg(err.message || 'Upload failed. Please try again.')
      setStatus('error')
    }
    // Reset input so the same file can be re-selected after an error.
    e.target.value = ''
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div className="w-full max-w-[430px] pointer-events-auto vellum-bg rounded-t-3xl border-t border-paper-400 shadow-[0_-8px_32px_-8px_rgba(43,31,21,.22)] px-5 pt-5 pb-10">
          {/* Handle */}
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-paper-400" />

          <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-ink-3 mb-1">
            Add photo
          </div>
          <div className="font-serif text-[22px] text-ink leading-tight mb-5">
            A portrait of{' '}
            <span className="italic text-burgundy">{person.name.split(' ')[0]}</span>
          </div>

          {status === 'uploading' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-10 w-10 rounded-full border-2 border-burgundy border-t-transparent animate-spin" />
              <p className="font-serif italic text-[14px] text-ink-2">Saving photo…</p>
            </div>
          )}

          {status === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-10 w-10 rounded-full bg-moss flex items-center justify-center">
                <Icon.Check width="22" height="22" className="text-paper-50" />
              </div>
              <p className="font-serif italic text-[14px] text-ink-2">Photo saved.</p>
            </div>
          )}

          {status === 'error' && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-burgundy/10 border border-burgundy/30">
              <p className="font-serif italic text-[14px] text-burgundy leading-snug">{errorMsg}</p>
            </div>
          )}

          {(status === 'idle' || status === 'error') && (
            <div className="flex flex-col gap-3">
              {/* Choose from library */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-14 rounded-2xl bg-ink text-paper-50 flex items-center gap-3 px-5 font-serif text-[16px]"
              >
                <span className="h-8 w-8 rounded-full bg-burgundy flex items-center justify-center shrink-0">
                  <Icon.Camera width="16" height="16" />
                </span>
                Choose from library
              </button>

              {/* Take a photo (mobile camera) */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="h-14 rounded-2xl border border-paper-400 bg-paper-50/60 text-ink flex items-center gap-3 px-5 font-serif text-[16px]"
              >
                <span className="h-8 w-8 rounded-full border border-paper-400 flex items-center justify-center shrink-0 text-ink-2">
                  <CameraCapture width="16" height="16" />
                </span>
                Take a photo
              </button>

              <button
                onClick={onClose}
                className="mt-1 self-center font-mono text-[10px] tracking-[0.18em] uppercase text-ink-3 py-2"
              >
                cancel
              </button>
            </div>
          )}

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFile}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleFile}
          />
        </div>
      </div>
    </>
  )
}

// Inline SVG for a camera-shutter icon (distinct from the gallery camera icon).
function CameraCapture(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7h2l2-3h10l2 3h2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M17 9h.01" />
    </svg>
  )
}
