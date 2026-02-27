import type { ParticipantSnapshot } from "../../../shared/protocol";
import type { ConnectionState } from "../../hooks/usePartyRoom";
import { ArmoredDropzone } from "../ArmoredDropzone";

type Props = {
  connectionState: ConnectionState;
  lastError: string | null;
  taskError: string | null;
  hasUploadedPublicKey: boolean;
  pendingSigningTargets: ParticipantSnapshot[];
  selectedSigningTargetId: string | null;
  selectedSigningTarget: ParticipantSnapshot | null;
  publicKeys: Record<string, string>;
  onSelectSigningTarget: (clientId: string) => void;
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
  selectedSigningTargetId,
  selectedSigningTarget,
  publicKeys,
  onSelectSigningTarget,
  onUploadPublicKey,
  onUploadSignedKey,
  onDownloadParticipantKey,
}: Props) {
  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-white/15 bg-white/5 p-4">
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
        <div className="mt-3 flex min-h-0 flex-1 flex-col space-y-3">
          <p className="m-0 text-sm text-white/80">
            Remaining people for you to sign:{" "}
            <span className="font-semibold text-cyan-200">{pendingSigningTargets.length}</span>
          </p>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {pendingSigningTargets.map((participant) => {
              const key = publicKeys[participant.clientId];
              const isSelected = participant.clientId === selectedSigningTargetId;
              return (
                <div
                  key={participant.clientId}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    isSelected ? "border-cyan-300 bg-cyan-500/10" : "border-white/15 bg-black/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSigningTarget(participant.clientId)}
                    className="text-left text-sm font-semibold text-white"
                  >
                    {participant.displayName}
                  </button>
                  <button
                    type="button"
                    disabled={!key}
                    onClick={() => onDownloadParticipantKey(participant)}
                    className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download
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
            <>
              <div className="rounded-lg border border-white/15 bg-black/25 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="m-0 text-sm text-white/80">
                    Sign <span className="font-semibold">{selectedSigningTarget.displayName}</span> locally:
                  </p>
                  <button
                    type="button"
                    disabled={!publicKeys[selectedSigningTarget.clientId]}
                    onClick={() => onDownloadParticipantKey(selectedSigningTarget)}
                    className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download key
                  </button>
                </div>
                <pre className="m-0 overflow-x-auto rounded-md bg-black/30 p-2 text-xs text-white/75">
                  <code>{`gpg --import ./TARGET_PUBLIC_KEY.asc
gpg --sign-key "TARGET_USER_ID_OR_FINGERPRINT"
gpg --armor --export "TARGET_USER_ID_OR_FINGERPRINT" > signed-target.asc`}</code>
                </pre>
              </div>
              <ArmoredDropzone
                title={`Upload signed key for ${selectedSigningTarget.displayName}`}
                message="Drag signed public key file here"
                stretch
                disabled={connectionState !== "open"}
                onFileLoaded={async (armoredSignedKey) => {
                  await onUploadSignedKey(selectedSigningTarget.clientId, armoredSignedKey);
                }}
              />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

