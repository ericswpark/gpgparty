import { readKey } from "openpgp";
import { useMemo, useState } from "react";
import { Graph } from "./tiles/Graph";
import { usePartyRoom } from "../hooks/usePartyRoom";
import { createTarArchive } from "../lib/tar";
import type { SessionSnapshot } from "../../shared/protocol";
import type { ParticipantSnapshot } from "../../shared/protocol";
import { Downloads } from "./tiles/Downloads";
import { Tasks } from "./tiles/Tasks";

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

    const withoutEmail = firstUserId.replace(/<[^>]*>/g, " ").trim();
    const withoutComment = withoutEmail.replace(/\([^)]*\)/g, " ").trim();
    const parsed = withoutComment.replace(/\s+/g, " ");
    return parsed || null;
  } catch {
    return null;
  }
}

function containsPrivateKeyBlock(value: string): boolean {
  return /-----BEGIN PGP (PRIVATE|SECRET) KEY BLOCK-----/i.test(value);
}

function connectionLabel(state: "connecting" | "open" | "closed"): string {
  if (state === "open") {
    return "Connected";
  }
  if (state === "connecting") {
    return "Connecting";
  }
  return "Disconnected";
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

  const downloadParticipantKey = (participant: ParticipantSnapshot) => {
    const key = snapshot?.publicKeys[participant.clientId];
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
  };

  const handleUploadPublicKey = async (armoredPublicKey: string) => {
    setTaskError(null);
    if (!armoredPublicKey) {
      setTaskError("Dropped file was empty.");
      return;
    }
    if (containsPrivateKeyBlock(armoredPublicKey)) {
      window.alert(
        "Oops, you attempted to upload your private key. Use your public key instead.",
      );
      return;
    }

    const extractedName = await extractNameFromArmoredPublicKey(armoredPublicKey);
    if (extractedName) {
      setDisplayName(extractedName);
    }

    uploadPublicKey(armoredPublicKey);
  };

  const handleUploadSignedKey = async (
    targetClientId: string,
    armoredSignedKey: string,
  ) => {
    setTaskError(null);
    if (!armoredSignedKey) {
      setTaskError("Dropped file was empty.");
      return;
    }
    if (containsPrivateKeyBlock(armoredSignedKey)) {
      window.alert(
        "Oops, you attempted to upload your private key. Use your public key instead.",
      );
      return;
    }

    uploadSignedKey(targetClientId, armoredSignedKey);
  };

  return (
    <main className="min-h-screen w-full overflow-y-auto p-4 sm:p-6 lg:h-screen lg:overflow-hidden">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1400px] flex-col sm:min-h-[calc(100vh-3rem)] lg:h-full lg:min-h-0">
        <p className="mb-3 flex shrink-0 justify-end text-sm text-white/70">
          Room: <span className="ml-2 font-mono text-cyan-200">{roomCode}</span>{" "}
          <span className="ml-2">({connectionLabel(connectionState)})</span>
        </p>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <Graph snapshot={snapshot ?? EMPTY_SNAPSHOT} selfClientId={clientId} />

          <div className="grid min-h-0 gap-4 lg:grid-rows-[1fr_auto]">
            <Tasks
              connectionState={connectionState}
              lastError={lastError}
              taskError={taskError}
              hasUploadedPublicKey={self?.hasPublicKey === true}
              pendingSigningTargets={pendingSigningTargets}
              selectedSigningTargetId={selectedSigningTargetId}
              selectedSigningTarget={selectedSigningTarget}
              publicKeys={snapshot?.publicKeys ?? {}}
              onSelectSigningTarget={setSelectedSigningTargetDraft}
              onUploadPublicKey={handleUploadPublicKey}
              onUploadSignedKey={handleUploadSignedKey}
              onDownloadParticipantKey={downloadParticipantKey}
            />

            <Downloads
              canDownloadMine={mySignedPublicKeys.length > 0}
              canDownloadAll={allPublicKeys.length > 0}
              onDownloadMine={() => {
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
              onDownloadAll={() => {
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
            />
          </div>
        </div>
      </section>
    </main>
  );
}
