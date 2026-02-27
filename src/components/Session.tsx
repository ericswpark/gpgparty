import { readKey } from "openpgp";
import { useMemo, useState } from "react";
import { ArmoredDropzone } from "./ArmoredDropzone";
import { Graph } from "./Graph";
import { usePartyRoom } from "../hooks/usePartyRoom";
import { createTarArchive } from "../lib/tar";
import type { SessionSnapshot } from "../../shared/protocol";

type Props = {
  roomCode: string;
};

function randomGuestName(): string {
  return `guest-${crypto.randomUUID().slice(0, 6)}`;
}

function normalizeFileName(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-");
  return cleaned.replaceAll(/^-+|-+$/g, "") || "unknown";
}

function downloadBytes(fileName: string, bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/x-tar" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const EMPTY_SNAPSHOT: SessionSnapshot = {
  roomId: "",
  updatedAt: 0,
  participants: [],
  publicKeys: {},
  signedKeys: {},
  edges: [],
};

async function extractNameFromArmoredPublicKey(
  armoredKey: string,
): Promise<string | null> {
  try {
    const key = await readKey({ armoredKey });
    const [firstUserId] = key.getUserIDs();
    if (!firstUserId) {
      return null;
    }

    const match = firstUserId.match(/^([^<]+)/);
    const parsed = (match?.[1] ?? firstUserId).trim();
    return parsed || null;
  } catch {
    return null;
  }
}

export function Session({ roomCode }: Props) {
  const [displayName, setDisplayName] = useState(randomGuestName);
  const [selectedSigningTargetDraft, setSelectedSigningTargetDraft] = useState<
    string | null
  >(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const {
    clientId,
    snapshot,
    connectionState,
    lastError,
    uploadPublicKey,
    uploadSignedKey,
  } = usePartyRoom(roomCode, displayName);

  const self = useMemo(
    () =>
      snapshot?.participants.find(
        (participant) => participant.clientId === clientId,
      ) ?? null,
    [clientId, snapshot],
  );

  const pendingSigningTargets = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.participants.filter(
      (participant) =>
        participant.clientId !== clientId &&
        participant.hasPublicKey &&
        !(
          snapshot.signedKeys[clientId] &&
          snapshot.signedKeys[clientId][participant.clientId]
        ),
    );
  }, [clientId, snapshot]);

  const selectedSigningTargetId = useMemo(() => {
    if (pendingSigningTargets.length === 0) {
      return null;
    }

    const hasCurrent = pendingSigningTargets.some(
      (participant) => participant.clientId === selectedSigningTargetDraft,
    );
    return hasCurrent
      ? selectedSigningTargetDraft
      : pendingSigningTargets[0].clientId;
  }, [pendingSigningTargets, selectedSigningTargetDraft]);

  const selectedSigningTarget = useMemo(() => {
    if (!selectedSigningTargetId) {
      return null;
    }
    return (
      pendingSigningTargets.find(
        (participant) => participant.clientId === selectedSigningTargetId,
      ) ?? null
    );
  }, [pendingSigningTargets, selectedSigningTargetId]);

  const mySignedPublicKeys = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const files: { fileName: string; content: string }[] = [];
    for (const [signerId, signedBySigner] of Object.entries(
      snapshot.signedKeys,
    )) {
      const mine = signedBySigner[clientId];
      if (!mine) {
        continue;
      }

      const signer = snapshot.participants.find(
        (participant) => participant.clientId === signerId,
      );
      const signerLabel = normalizeFileName(signer?.displayName ?? signerId);
      files.push({
        fileName: `${signerLabel}-signed-my-key.asc`,
        content: mine,
      });
    }

    return files;
  }, [clientId, snapshot]);

  const allPublicKeys = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return Object.entries(snapshot.publicKeys).map(
      ([participantId, armoredKey]) => {
        const participant = snapshot.participants.find(
          (entry) => entry.clientId === participantId,
        );
        const participantLabel = normalizeFileName(
          participant?.displayName ?? participantId,
        );
        return {
          fileName: `${participantLabel}.asc`,
          content: armoredKey,
        };
      },
    );
  }, [snapshot]);

  return (
    <main className="min-h-screen w-full p-4 sm:p-6">
      <p className="mb-3 flex justify-end text-sm text-white/70">
        Room: <span className="ml-2 font-mono text-cyan-200">{roomCode}</span>
      </p>

      <section className="mx-auto grid w-full max-w-[1400px] gap-4 lg:grid-cols-2">
        <Graph snapshot={snapshot ?? EMPTY_SNAPSHOT} selfClientId={clientId} />

        <div className="grid gap-4 lg:grid-rows-2">
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <p className="m-0 mt-1 text-sm text-white/70">
              {connectionState === "open"
                ? "Connected"
                : "Connecting to room..."}
            </p>
            {lastError ? (
              <p className="m-0 mt-2 text-sm text-red-200">{lastError}</p>
            ) : null}
            {taskError ? (
              <p className="m-0 mt-2 text-sm text-red-200">{taskError}</p>
            ) : null}

            {!self?.hasPublicKey ? (
              <div className="mt-3">
                <ArmoredDropzone
                  title="Upload your public key"
                  message="Drag public key file here"
                  disabled={connectionState !== "open"}
                  onFileLoaded={async (armoredPublicKey) => {
                    setTaskError(null);
                    if (!armoredPublicKey) {
                      setTaskError("Dropped file was empty.");
                      return;
                    }

                    const extractedName =
                      await extractNameFromArmoredPublicKey(armoredPublicKey);
                    if (extractedName) {
                      setDisplayName(extractedName);
                    }

                    uploadPublicKey(armoredPublicKey);
                  }}
                />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="m-0 text-sm text-white/80">
                  Remaining people for you to sign:{" "}
                  <span className="font-semibold text-cyan-200">
                    {pendingSigningTargets.length}
                  </span>
                </p>

                <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                  {pendingSigningTargets.map((participant) => {
                    const key = snapshot?.publicKeys[participant.clientId];
                    const isSelected =
                      participant.clientId === selectedSigningTargetId;
                    return (
                      <div
                        key={participant.clientId}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                          isSelected
                            ? "border-cyan-300 bg-cyan-500/10"
                            : "border-white/15 bg-black/20"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedSigningTargetDraft(participant.clientId)
                          }
                          className="text-left text-sm font-semibold text-white"
                        >
                          {participant.displayName}
                        </button>
                        <button
                          type="button"
                          disabled={!key}
                          onClick={() => {
                            if (!key) {
                              return;
                            }
                            const tar = createTarArchive([
                              {
                                name: `${normalizeFileName(participant.displayName)}.asc`,
                                content: key,
                              },
                            ]);
                            downloadBytes(
                              `${normalizeFileName(participant.displayName)}-public-key.tar`,
                              tar,
                            );
                          }}
                          className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Download key
                        </button>
                      </div>
                    );
                  })}
                  {pendingSigningTargets.length === 0 ? (
                    <p className="m-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                      No remaining signatures needed from you right now.
                    </p>
                  ) : null}
                </div>

                {selectedSigningTarget ? (
                  <ArmoredDropzone
                    title={`Upload signed key for ${selectedSigningTarget.displayName}`}
                    message="Drag signed public key file here"
                    disabled={connectionState !== "open"}
                    onFileLoaded={async (armoredSignedKey) => {
                      setTaskError(null);
                      if (!armoredSignedKey) {
                        setTaskError("Dropped file was empty.");
                        return;
                      }
                      uploadSignedKey(
                        selectedSigningTarget.clientId,
                        armoredSignedKey,
                      );
                    }}
                  />
                ) : null}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="mt-4 grid gap-3">
              <button
                type="button"
                disabled={mySignedPublicKeys.length === 0}
                onClick={() => {
                  const tar = createTarArchive(
                    mySignedPublicKeys.map((file) => ({
                      name: file.fileName,
                      content: file.content,
                    })),
                  );
                  downloadBytes(
                    `${normalizeFileName(displayName)}-signed-public-keys.tar`,
                    tar,
                  );
                }}
                className="rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-4 py-3 text-left text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download signed public keys of mine
              </button>
              <button
                type="button"
                disabled={allPublicKeys.length === 0}
                onClick={() => {
                  const tar = createTarArchive(
                    allPublicKeys.map((file) => ({
                      name: file.fileName,
                      content: file.content,
                    })),
                  );
                  downloadBytes(
                    `${normalizeFileName(roomCode)}-all-public-keys.tar`,
                    tar,
                  );
                }}
                className="rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download all public keys of this room
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
