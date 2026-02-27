import type * as Party from "partykit/server";
import type {
  ClientMessage,
  ParticipantSnapshot,
  SessionSnapshot,
  ServerMessage,
} from "../shared/protocol";
import { safeJsonParse, signatureKey } from "../shared/protocol";

type ParticipantRecord = {
  clientId: string;
  displayName: string;
  connections: Set<string>;
  publicKey: string | null;
  publicKeyFingerprint: string | null;
  joinedAt: number;
  updatedAt: number;
};

type SignatureRecord = {
  signerClientId: string;
  targetClientId: string;
  armoredSignedKey: string;
  signedAt: number;
};

const MAX_DISPLAY_NAME_LENGTH = 48;
const MAX_ARMORED_KEY_LENGTH = 1024 * 256;
const DUPLICATE_PUBKEY_MESSAGE =
  "Oops, this person already exists within this room. Please upload your own pubkey.";

export default class Server implements Party.Server {
  private readonly participants = new Map<string, ParticipantRecord>();
  private readonly connectionToClientId = new Map<string, string>();
  private readonly signatures = new Map<string, SignatureRecord>();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    const msg: ServerMessage = {
      type: "snapshot",
      snapshot: this.buildSnapshot(),
    };
    conn.send(JSON.stringify(msg));
  }

  onMessage(
    message: string | ArrayBuffer | ArrayBufferView,
    sender: Party.Connection,
  ) {
    if (typeof message !== "string") {
      this.sendError(sender, "Only UTF-8 JSON messages are supported.");
      return;
    }

    const parsed = safeJsonParse(message);
    if (!this.isClientMessage(parsed)) {
      this.sendError(sender, "Malformed message.");
      return;
    }

    this.handleClientMessage(parsed, sender);
  }

  onClose(connection: Party.Connection) {
    const clientId = this.connectionToClientId.get(connection.id);
    if (!clientId) {
      return;
    }

    this.connectionToClientId.delete(connection.id);
    const participant = this.participants.get(clientId);
    if (!participant) {
      return;
    }

    participant.connections.delete(connection.id);
    participant.updatedAt = Date.now();
    this.broadcastSnapshot();
  }

  private handleClientMessage(
    message: ClientMessage,
    sender: Party.Connection,
  ) {
    switch (message.type) {
      case "join": {
        const clientId = this.sanitizeClientId(message.clientId);
        if (!clientId) {
          this.sendError(sender, "Invalid client ID.");
          return;
        }

        const displayName = this.sanitizeDisplayName(message.displayName);
        this.connectionToClientId.set(sender.id, clientId);

        const existing = this.participants.get(clientId);
        if (existing) {
          existing.displayName = displayName;
          existing.connections.add(sender.id);
          existing.updatedAt = Date.now();
        } else {
          this.participants.set(clientId, {
            clientId,
            displayName,
            connections: new Set([sender.id]),
            publicKey: null,
            publicKeyFingerprint: null,
            joinedAt: Date.now(),
            updatedAt: Date.now(),
          });
        }

        this.broadcastSnapshot();
        return;
      }
      case "set-display-name": {
        const participant = this.getParticipantFromConnection(sender.id);
        if (!participant) {
          this.sendError(sender, "Join room first.");
          return;
        }

        const sanitizedName = this.sanitizeDisplayName(message.displayName);
        participant.displayName =
          participant.publicKey !== null
            ? this.ensureUniquePublicKeyDisplayName(
                sanitizedName,
                participant.clientId,
              )
            : sanitizedName;
        participant.updatedAt = Date.now();
        this.broadcastSnapshot();
        return;
      }
      case "upload-pubkey": {
        const participant = this.getParticipantFromConnection(sender.id);
        if (!participant) {
          this.sendError(sender, "Join room first.");
          return;
        }

        const armoredKey = this.sanitizeArmoredBlob(message.armoredKey);
        if (!armoredKey) {
          this.sendError(sender, "Invalid armored public key.");
          return;
        }

        const uploadedFingerprint = this.sanitizeFingerprint(
          message.publicKeyFingerprint,
        );
        if (!uploadedFingerprint) {
          this.sendError(sender, "Invalid armored public key.");
          return;
        }

        const duplicateExists = this.hasDuplicatePublicKeyFingerprint(
          uploadedFingerprint,
          participant.clientId,
        );
        if (duplicateExists) {
          this.sendError(sender, DUPLICATE_PUBKEY_MESSAGE);
          return;
        }

        participant.publicKey = armoredKey;
        participant.publicKeyFingerprint = uploadedFingerprint;
        participant.displayName = this.ensureUniquePublicKeyDisplayName(
          participant.displayName,
          participant.clientId,
        );
        participant.updatedAt = Date.now();
        this.broadcastSnapshot();
        return;
      }
      case "upload-signed-key": {
        const participant = this.getParticipantFromConnection(sender.id);
        if (!participant) {
          this.sendError(sender, "Join room first.");
          return;
        }

        if (participant.clientId === message.targetClientId) {
          this.sendError(
            sender,
            "Cannot submit a self-signature in this flow.",
          );
          return;
        }

        const target = this.participants.get(message.targetClientId);
        if (!target || !target.publicKey) {
          this.sendError(
            sender,
            "Target participant does not have a public key yet.",
          );
          return;
        }

        const armoredSignedKey = this.sanitizeArmoredBlob(
          message.armoredSignedKey,
        );
        if (!armoredSignedKey) {
          this.sendError(sender, "Invalid armored signed public key.");
          return;
        }

        const key = signatureKey(participant.clientId, target.clientId);
        this.signatures.set(key, {
          signerClientId: participant.clientId,
          targetClientId: target.clientId,
          armoredSignedKey,
          signedAt: Date.now(),
        });
        this.broadcastSnapshot();
        return;
      }
      case "request-snapshot": {
        this.sendSnapshot(sender);
        return;
      }
    }
  }

  private getParticipantFromConnection(
    connectionId: string,
  ): ParticipantRecord | null {
    const clientId = this.connectionToClientId.get(connectionId);
    if (!clientId) {
      return null;
    }
    return this.participants.get(clientId) ?? null;
  }

  private broadcastSnapshot() {
    const message: ServerMessage = {
      type: "snapshot",
      snapshot: this.buildSnapshot(),
    };
    this.room.broadcast(JSON.stringify(message));
  }

  private sendSnapshot(connection: Party.Connection) {
    const message: ServerMessage = {
      type: "snapshot",
      snapshot: this.buildSnapshot(),
    };
    connection.send(JSON.stringify(message));
  }

  private sendError(connection: Party.Connection, message: string) {
    const payload: ServerMessage = {
      type: "error",
      message,
    };
    connection.send(JSON.stringify(payload));
  }

  private buildSnapshot(): SessionSnapshot {
    const participants = [...this.participants.values()].sort((a, b) =>
      a.joinedAt === b.joinedAt
        ? a.displayName.localeCompare(b.displayName)
        : a.joinedAt - b.joinedAt,
    );

    const publicKeyOwners = new Set(
      participants
        .filter((participant) => participant.publicKey !== null)
        .map((participant) => participant.clientId),
    );

    const participantSnapshots: ParticipantSnapshot[] = participants.map(
      (participant) => {
        const totalSignableTargets = [...publicKeyOwners].filter(
          (targetId) => targetId !== participant.clientId,
        ).length;
        const submittedSignatures = [...this.signatures.values()].filter(
          (record) =>
            record.signerClientId === participant.clientId &&
            publicKeyOwners.has(record.targetClientId),
        ).length;
        const remainingToSign = Math.max(
          totalSignableTargets - submittedSignatures,
          0,
        );

        const receivedSignatures = [...this.signatures.values()].filter(
          (record) => record.targetClientId === participant.clientId,
        ).length;

        return {
          clientId: participant.clientId,
          displayName: participant.displayName,
          connected: participant.connections.size > 0,
          hasPublicKey: participant.publicKey !== null,
          remainingToSign,
          receivedSignatures,
        };
      },
    );

    const publicKeys: Record<string, string> = {};
    for (const participant of participants) {
      if (participant.publicKey !== null) {
        publicKeys[participant.clientId] = participant.publicKey;
      }
    }

    const signedKeys: Record<string, Record<string, string>> = {};
    for (const signature of this.signatures.values()) {
      const nested = signedKeys[signature.signerClientId] ?? {};
      nested[signature.targetClientId] = signature.armoredSignedKey;
      signedKeys[signature.signerClientId] = nested;
    }

    const edges = [...this.signatures.values()].map((signature) => ({
      signerClientId: signature.signerClientId,
      targetClientId: signature.targetClientId,
      signedAt: signature.signedAt,
    }));

    return {
      roomId: this.room.id,
      updatedAt: Date.now(),
      participants: participantSnapshots,
      publicKeys,
      signedKeys,
      edges,
    };
  }

  private sanitizeDisplayName(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Anonymous";
    }
    return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
  }

  private sanitizeClientId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (!/^[a-zA-Z0-9_-]{6,64}$/.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private sanitizeArmoredBlob(value: string): string | null {
    const normalized = value.replaceAll(/\r\n/g, "\n").trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > MAX_ARMORED_KEY_LENGTH) {
      return null;
    }

    return normalized;
  }

  private sanitizeFingerprint(value: string): string | null {
    const normalized = value.trim().toLocaleLowerCase();
    if (!/^[0-9a-f]{40,64}$/.test(normalized)) {
      return null;
    }
    return normalized;
  }

  private hasDuplicatePublicKeyFingerprint(
    fingerprint: string,
    ownClientId: string,
  ): boolean {
    for (const entry of this.participants.values()) {
      if (
        entry.clientId === ownClientId ||
        entry.publicKeyFingerprint === null
      ) {
        continue;
      }

      if (entry.publicKeyFingerprint === fingerprint) {
        return true;
      }
    }
    return false;
  }

  private ensureUniquePublicKeyDisplayName(
    displayName: string,
    clientId: string,
  ): string {
    const baseName = this.getBaseDisplayName(displayName);
    const normalizedTaken = new Set(
      [...this.participants.values()]
        .filter(
          (participant) =>
            participant.clientId !== clientId && participant.publicKey !== null,
        )
        .map((participant) => participant.displayName.toLocaleLowerCase()),
    );

    if (!normalizedTaken.has(baseName.toLocaleLowerCase())) {
      return baseName;
    }

    let index = 1;
    while (true) {
      const candidate = `${baseName} (${index})`;
      if (!normalizedTaken.has(candidate.toLocaleLowerCase())) {
        return candidate;
      }
      index += 1;
    }
  }

  private getBaseDisplayName(displayName: string): string {
    const stripped = displayName.replace(/\s\(\d+\)\s*$/, "").trim();
    return stripped || "Anonymous";
  }

  private isClientMessage(value: unknown): value is ClientMessage {
    if (typeof value !== "object" || value === null || !("type" in value)) {
      return false;
    }
    const type = (value as { type: unknown }).type;
    return (
      type === "join" ||
      type === "set-display-name" ||
      type === "upload-pubkey" ||
      type === "upload-signed-key" ||
      type === "request-snapshot"
    );
  }
}

Server satisfies Party.Worker;
