export type ClientMessage =
  | {
      type: "join";
      clientId: string;
      displayName: string;
    }
  | {
      type: "set-display-name";
      displayName: string;
    }
  | {
      type: "upload-pubkey";
      armoredKey: string;
      publicKeyFingerprint: string;
    }
  | {
      type: "upload-signed-key";
      targetClientId: string;
      armoredSignedKey: string;
    }
  | {
      type: "request-snapshot";
    };

export type ParticipantSnapshot = {
  clientId: string;
  displayName: string;
  connected: boolean;
  hasPublicKey: boolean;
  remainingToSign: number;
  receivedSignatures: number;
};

export type SignatureEdge = {
  signerClientId: string;
  targetClientId: string;
  signedAt: number;
};

export type SessionSnapshot = {
  roomId: string;
  updatedAt: number;
  participants: ParticipantSnapshot[];
  publicKeys: Record<string, string>;
  signedKeys: Record<string, Record<string, string>>;
  edges: SignatureEdge[];
};

export type ServerMessage =
  | {
      type: "snapshot";
      snapshot: SessionSnapshot;
    }
  | {
      type: "error";
      message: string;
    };

export function signatureKey(
  signerClientId: string,
  targetClientId: string,
): string {
  return `${signerClientId}::${targetClientId}`;
}

export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
