import { readKey } from "openpgp";
import { useEffect, useMemo, useRef, useState } from "react";
import { Graph } from "./tiles/Graph";
import { usePartyRoom } from "../hooks/usePartyRoom";
import { createTarArchive } from "../lib/tar";
import { normalizeFileName } from "../lib/fileName";
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

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
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
const DUPLICATE_PUBKEY_MESSAGE =
  "Oops, this person already exists within this room. Please upload your own pubkey.";

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

async function extractFingerprintFromArmoredPublicKey(
  armoredKey: string,
): Promise<string | null> {
  try {
    const key = await readKey({ armoredKey });
    return key.getFingerprint().toLowerCase();
  } catch {
    return null;
  }
}

async function hasOwnCertificationOnKey(
  armoredSignedKey: string,
  armoredSignerPublicKey: string,
): Promise<boolean> {
  try {
    const signedKey = await readKey({ armoredKey: armoredSignedKey });
    const signerKey = await readKey({ armoredKey: armoredSignerPublicKey });
    const signerPublicKey = signerKey.isPrivate() ? signerKey.toPublic() : signerKey;
    const signerKeyIds = new Set(
      signerPublicKey
        .getKeyIDs()
        .map((keyId) => keyId.toHex().toLowerCase()),
    );

    for (const user of signedKey.users) {
      for (const certification of user.otherCertifications) {
        const issuerKeyId = certification.issuerKeyID?.toHex().toLowerCase();
        if (!issuerKeyId || !signerKeyIds.has(issuerKeyId)) {
          continue;
        }

        try {
          const verified = await user.verifyCertificate(certification, [
            signerPublicKey,
          ]);
          if (verified === true) {
            return true;
          }
        } catch {
          // Ignore malformed or unverifiable certs and continue checking.
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function hasAnyThirdPartyCertification(
  armoredSignedKey: string,
): Promise<boolean> {
  try {
    const key = await readKey({ armoredKey: armoredSignedKey });
    return key.users.some((user) => user.otherCertifications.length > 0);
  } catch {
    return false;
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
  const [taskError, setTaskError] = useState<string | null>(null);
  const lastAlertedErrorRef = useRef<string | null>(null);

  const {
    clientId,
    snapshot,
    connectionState,
    lastError,
    uploadPublicKey,
    uploadSignedKey,
  } = usePartyRoom(roomCode, displayName);

  useEffect(() => {
    if (!lastError) {
      return;
    }
    if (lastError !== DUPLICATE_PUBKEY_MESSAGE) {
      return;
    }
    if (lastAlertedErrorRef.current === lastError) {
      return;
    }
    lastAlertedErrorRef.current = lastError;
    window.alert(DUPLICATE_PUBKEY_MESSAGE);
  }, [lastError]);

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

  const allRoomKeyFiles = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const files: { fileName: string; content: string }[] = [];

    for (const [participantId, armoredKey] of Object.entries(snapshot.publicKeys)) {
      const participant = snapshot.participants.find(
        (entry) => entry.clientId === participantId,
      );
      const participantLabel = normalizeFileName(
        participant?.displayName ?? participantId,
      );
      files.push({
        fileName: `${participantLabel}.asc`,
        content: armoredKey,
      });
    }

    for (const [signerId, signedBySigner] of Object.entries(snapshot.signedKeys)) {
      const signer = snapshot.participants.find(
        (entry) => entry.clientId === signerId,
      );
      const signerLabel = normalizeFileName(signer?.displayName ?? signerId);

      for (const [targetId, signedArmoredKey] of Object.entries(signedBySigner)) {
        const target = snapshot.participants.find(
          (entry) => entry.clientId === targetId,
        );
        const targetLabel = normalizeFileName(target?.displayName ?? targetId);
        files.push({
          fileName: `${targetLabel}-signed-by-${signerLabel}.asc`,
          content: signedArmoredKey,
        });
      }
    }

    return files;
  }, [snapshot]);

  const downloadParticipantKey = (participant: ParticipantSnapshot) => {
    const key = snapshot?.publicKeys[participant.clientId];
    if (!key) {
      return;
    }

    downloadTextFile(`${normalizeFileName(participant.displayName)}.asc`, key);
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

    const uploadedFingerprint =
      await extractFingerprintFromArmoredPublicKey(armoredPublicKey);
    if (!uploadedFingerprint) {
      setTaskError("Invalid armored public key.");
      return;
    }
    if (snapshot) {
      const existingFingerprintEntries = await Promise.all(
        Object.entries(snapshot.publicKeys)
          .filter(([participantId]) => participantId !== clientId)
          .map(async ([participantId, key]) => ({
            participantId,
            fingerprint: await extractFingerprintFromArmoredPublicKey(key),
          })),
      );
      const duplicate = existingFingerprintEntries.some(
        (entry) => entry.fingerprint === uploadedFingerprint,
      );
      if (duplicate) {
        window.alert(DUPLICATE_PUBKEY_MESSAGE);
        return;
      }
    }

    const extractedName = await extractNameFromArmoredPublicKey(armoredPublicKey);
    if (extractedName) {
      setDisplayName(extractedName);
    }

    uploadPublicKey(armoredPublicKey, uploadedFingerprint);
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

    const targetParticipant = snapshot?.participants.find(
      (participant) => participant.clientId === targetClientId,
    );
    const targetDisplayName = targetParticipant?.displayName ?? "this user";
    const targetArmoredKey = snapshot?.publicKeys[targetClientId];
    const myArmoredKey = snapshot?.publicKeys[clientId];
    if (!targetArmoredKey || !myArmoredKey) {
      setTaskError("Missing participant public key data in this room.");
      return;
    }

    const [uploadedFingerprint, targetFingerprint, myFingerprint] = await Promise.all([
      extractFingerprintFromArmoredPublicKey(armoredSignedKey),
      extractFingerprintFromArmoredPublicKey(targetArmoredKey),
      extractFingerprintFromArmoredPublicKey(myArmoredKey),
    ]);

    if (!uploadedFingerprint || !targetFingerprint || !myFingerprint) {
      setTaskError("Invalid armored public key.");
      return;
    }

    if (uploadedFingerprint === myFingerprint) {
      window.alert("This key appears to be yours. You've already uploaded your own key; it's time to sign someone else's!");
      return;
    }

    if (uploadedFingerprint !== targetFingerprint) {
      window.alert(
        `Oops, this key is not from ${targetDisplayName}. Please check which key you are uploading.`,
      );
      return;
    }

    const signedCheck = await hasAnyThirdPartyCertification(armoredSignedKey);
    if (!signedCheck) {
      window.alert(
        "Oops, this key was not signed. Please correctly sign and upload the key.",
      );
      return;
    }

    const signedByCurrentUser = await hasOwnCertificationOnKey(
      armoredSignedKey,
      myArmoredKey,
    );
    if (!signedByCurrentUser) {
      window.alert(
        "Oops, this key is signed, but not by you. Please sign the key yourself and upload it.",
      );
      return;
    }

    uploadSignedKey(targetClientId, armoredSignedKey);
  };

  return (
    <main className="min-h-screen w-full overflow-x-auto overflow-y-auto p-4 sm:p-6 lg:h-screen lg:overflow-y-auto">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-350 flex-col sm:min-h-[calc(100vh-3rem)] lg:h-full lg:min-h-0">
        <p className="mb-3 flex shrink-0 justify-end text-sm text-white/70">
          Room: <span className="ml-2 font-mono text-cyan-200">{roomCode}</span>{" "}
          <span className="ml-2">({connectionLabel(connectionState)})</span>
        </p>

        <div className="grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-2">
          <Graph snapshot={snapshot ?? EMPTY_SNAPSHOT} selfClientId={clientId} />

          <div className="grid min-h-0 min-w-0 gap-4 lg:grid-rows-[1fr_auto]">
            <Tasks
              connectionState={connectionState}
              lastError={lastError}
              taskError={taskError}
              hasUploadedPublicKey={self?.hasPublicKey === true}
              pendingSigningTargets={pendingSigningTargets}
              publicKeys={snapshot?.publicKeys ?? {}}
              onUploadPublicKey={handleUploadPublicKey}
              onUploadSignedKey={handleUploadSignedKey}
              onDownloadParticipantKey={downloadParticipantKey}
            />

            <Downloads
              canDownloadMine={mySignedPublicKeys.length > 0}
              canDownloadAll={allRoomKeyFiles.length > 0}
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
                  allRoomKeyFiles.map((file) => ({
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
