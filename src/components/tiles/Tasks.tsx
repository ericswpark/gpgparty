import { Download } from "lucide-react";
import { readKey } from "openpgp";
import { useEffect, useMemo, useState } from "react";
import type { ParticipantSnapshot } from "../../../shared/protocol";
import type { ConnectionState } from "../../hooks/usePartyRoom";
import { ArmoredDropzone } from "../ArmoredDropzone";

type Props = {
  connectionState: ConnectionState;
  lastError: string | null;
  taskError: string | null;
  hasUploadedPublicKey: boolean;
  pendingSigningTargets: ParticipantSnapshot[];
  publicKeys: Record<string, string>;
  onUploadPublicKey: (armoredPublicKey: string) => Promise<void> | void;
  onUploadSignedKey: (
    targetClientId: string,
    armoredSignedKey: string,
  ) => Promise<void> | void;
  onDownloadParticipantKey: (participant: ParticipantSnapshot) => void;
};

export function Tasks({
  connectionState,
  lastError,
  taskError,
  hasUploadedPublicKey,
  pendingSigningTargets,
  publicKeys,
  onUploadPublicKey,
  onUploadSignedKey,
  onDownloadParticipantKey,
}: Props) {
  const actionableTargets = useMemo(
    () =>
      pendingSigningTargets.filter(
        (participant) => !!publicKeys[participant.clientId],
      ),
    [pendingSigningTargets, publicKeys],
  );
  const [fingerprintsByClientId, setFingerprintsByClientId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const parsed = await Promise.all(
        actionableTargets.map(async (participant) => {
          const armoredKey = publicKeys[participant.clientId];
          if (!armoredKey) {
            return null;
          }

          try {
            const key = await readKey({ armoredKey });
            return [participant.clientId, key.getFingerprint().toUpperCase()] as const;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      const next: Record<string, string> = {};
      for (const entry of parsed) {
        if (!entry) {
          continue;
        }
        next[entry[0]] = entry[1];
      }
      setFingerprintsByClientId(next);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [actionableTargets, publicKeys]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-white/15 bg-white/5 p-4">
      {lastError ? <p className="m-0 mt-2 text-sm text-red-200">{lastError}</p> : null}
      {taskError ? <p className="m-0 mt-2 text-sm text-red-200">{taskError}</p> : null}

      {!hasUploadedPublicKey ? (
        <div className="mt-3 flex-1">
          <ArmoredDropzone
            title="Upload your public key"
            message="Drag public key file here"
            stretch
            disabled={connectionState !== "open"}
            onFileLoaded={async (armoredPublicKey) => {
              await onUploadPublicKey(armoredPublicKey);
            }}
          />
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <p className="m-0 text-sm text-white/80">
            Remaining people for you to sign:{" "}
            <span className="font-semibold text-cyan-200">{actionableTargets.length}</span>
          </p>

          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {actionableTargets.map((participant) => {
              const key = publicKeys[participant.clientId];
              const fingerprint =
                fingerprintsByClientId[participant.clientId] ??
                "TARGET_USER_ID_OR_FINGERPRINT";
              const safeName = participant.displayName
                .trim()
                .replaceAll(/\s+/g, "-")
                .toLowerCase();
              const keyFile = `${safeName || participant.clientId}.asc`;

              return (
                <article
                  key={participant.clientId}
                  className="rounded-lg border border-white/15 bg-black/20 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="m-0 text-sm text-white/80">
                      Sign <span className="font-semibold">{participant.displayName}</span> locally
                    </p>
                    <button
                      type="button"
                      disabled={!key}
                      onClick={() => onDownloadParticipantKey(participant)}
                      className="inline-flex items-center gap-1 rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download size={12} aria-hidden="true" />
                      Download key
                    </button>
                  </div>

                  <pre className="m-0 overflow-x-auto rounded-md bg-black/30 p-2 text-xs text-white/75">
                    <code>{`gpg --import ./${keyFile}
gpg --sign-key "${fingerprint}"
gpg --armor --export "${fingerprint}" > signed-${keyFile}`}</code>
                  </pre>

                  <div className="mt-3">
                    <ArmoredDropzone
                      title={`Upload signed key for ${participant.displayName}`}
                      message={`Drag signed public key file of ${participant.displayName} here`}
                      showTitle={false}
                      variant="inline"
                      disabled={connectionState !== "open"}
                      onFileLoaded={async (armoredSignedKey) => {
                        await onUploadSignedKey(participant.clientId, armoredSignedKey);
                      }}
                    />
                  </div>
                </article>
              );
            })}
            {actionableTargets.length === 0 ? (
              <p className="m-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                No remaining signatures needed from you right now.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
