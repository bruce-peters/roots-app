import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

export default function App() {
  return (
    <div className="app-shell">
      <div className="app-frame">
        <DataProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/new" element={<NewInterviewScreen />} />
              <Route path="/connect" element={<ConnectScreen />} />
              <Route path="/person/new" element={<AddPersonScreen />} />
              <Route path="/person/:id" element={<PersonScreen />} />
              <Route path="/person/:id/recording" element={<RecordingScreen />} />
              <Route path="/person/:id/interview/:interviewId" element={<TranscriptScreen />} />
              <Route path="/person/:id/memory/:memoryId" element={<MemoryDetailScreen />} />
              <Route path="/person/:id/timeline/:entryId" element={<TimelineEntryScreen />} />
            </Routes>
          </BrowserRouter>
        </DataProvider>
      </div>
    </div>
  )
}
