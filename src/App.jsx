import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { DataProvider } from '@/lib/data-context'
import HomeScreen from './screens/home'
import NewInterviewScreen from './screens/new-interview'
import ConnectScreen from './screens/connect'
import RecordingScreen from './screens/recording'
import PersonScreen from './screens/person'
import AddPersonScreen from './screens/add-person'
import TranscriptScreen from './screens/transcript'
import MemoryDetailScreen from './screens/memory-detail'
import TimelineEntryScreen from './screens/timeline-entry'
import AskScreen from './screens/ask'

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false)
  const timerRef = useRef(null)

  function dismiss() {
    if (timerRef.current) return
    timerRef.current = setTimeout(() => {}, 0) // mark as dismissed
    setTimeout(() => {
      setFading(true)
      setTimeout(onDone, 450)
    }, 300)
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ede3cb',
        transition: 'opacity 0.45s ease',
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <video
        src="/logo_loading_video.mp4"
        autoPlay
        muted
        playsInline
        onLoadedMetadata={e => { e.target.playbackRate = 1.5 }}
        onEnded={dismiss}
        style={{ width: '100%', maxWidth: 320, objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }}
      />
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.key}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/new" element={<NewInterviewScreen />} />
        <Route path="/connect" element={<ConnectScreen />} />
        <Route path="/person/new" element={<AddPersonScreen />} />
        <Route path="/person/:id" element={<PersonScreen />} />
        <Route path="/person/:id/recording" element={<RecordingScreen />} />
        <Route path="/person/:id/interview/:interviewId" element={<TranscriptScreen />} />
        <Route path="/person/:id/memory/:memoryId" element={<MemoryDetailScreen />} />
        <Route path="/person/:id/timeline/:entryId" element={<TimelineEntryScreen />} />
        <Route path="/ask" element={<AskScreen />} />
        <Route path="/person/:id/ask" element={<AskScreen />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false)

  return (
    <>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
    <div className="app-shell">
      <div className="app-frame">
        <DataProvider>
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </DataProvider>
      </div>
    </div>
    </>
  )
}
