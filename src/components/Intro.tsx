import { useState, type Dispatch, type SetStateAction } from "react";

type Props = {
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
};

export function Intro({ value, setValue }: Props) {
  const [draftRoomCode, setDraftRoomCode] = useState(value);
  const canJoinRoom = draftRoomCode.trim().length > 0;

  const joinRoom = (roomCode: string) => {
    const normalized = roomCode.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    setValue(normalized);
  };

  const createRoom = () => {
    const generated = `room-${crypto.randomUUID().slice(0, 8)}`;
    setDraftRoomCode(generated);
    setValue(generated);
  };

  const handleSubmit = () => {
    joinRoom(draftRoomCode);
  };

  return (
    <main className="min-h-screen w-full p-6 grid place-items-center">
      <section
        className="w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 p-8 text-left shadow-2xl backdrop-blur-sm"
        aria-labelledby="fingerprint-title"
      >
        <h1
          id="fingerprint-title"
          className="m-0 mb-8 text-2xl font-semibold leading-tight text-white sm:text-3xl"
        >
          gpgparty
        </h1>
        <label className="sr-only" htmlFor="partykit-room-input">
          Room code
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="partykit-room-input"
            name="partykit-room-code"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={draftRoomCode}
            onChange={(event) => setDraftRoomCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSubmit();
              }
            }}
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/50 outline-none ring-0 transition focus:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-300/70 sm:text-base"
            placeholder="Room code"
          />
          <span
            title={
              !canJoinRoom
                ? "You need to enter the room code first!"
                : undefined
            }
            className="inline-flex shrink-0"
          >
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canJoinRoom}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-200/40 bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition enabled:hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-blue-500/40 disabled:text-white/60 sm:text-base"
            >
              Join room
            </button>
          </span>
          <button
            type="button"
            onClick={createRoom}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-cyan-200/50 bg-cyan-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 sm:text-base"
          >
            Create room
          </button>
        </div>
      </section>
    </main>
  );
}
