import { useState } from "react";
import { Intro } from "./components/Intro";
import { Session } from "./components/Session";

function App() {
  const [roomCode, setRoomCode] = useState<string>("");

  if (roomCode) {
    return <Session roomCode={roomCode} />;
  }

  return <Intro value={roomCode} setValue={setRoomCode} />;
}

export default App;
