import { useState } from 'react'
import { Graph } from './components/Graph'
import { Intro } from './components/Intro'

function App() {
  const [fingerprint, setFingerprint] = useState<string | null>(null)

  return (
    <main className="min-h-screen w-full p-6 grid place-items-center">
      {fingerprint !== null ? (
        <Graph />
      ) : (
        <Intro value={fingerprint} setValue={setFingerprint} />
      )}
    </main>
  )
}

export default App
