import { useState } from "react";
import { Graph } from "./components/Graph";
import { Intro } from "./components/Intro";

function App() {
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  if (fingerprint !== null) {
    return <Graph startFingerprint={fingerprint} />;
  }

  return <Intro value={fingerprint} setValue={setFingerprint} />;
}

export default App;
