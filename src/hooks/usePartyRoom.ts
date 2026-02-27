import PartySocket from "partysocket";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, SessionSnapshot } from "../../shared/protocol";
import { safeJsonParse } from "../../shared/protocol";
import { getPartyKitHost, getPartyKitName } from "../lib/partykit";

const CLIENT_ID_STORAGE_KEY = "gpgparty-client-id";

function generateClientId(): string {
  const id = crypto.randomUUID().replaceAll("-", "");
  return id.slice(0, 24);
}

function getOrCreateClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const generated = generateClientId();
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  return generated;
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const type = (value as { type: unknown }).type;
  return type === "snapshot" || type === "error";
}

export type ConnectionState = "connecting" | "open" | "closed";

export function usePartyRoom(roomCode: string | null, displayName: string) {
  const normalizedRoomCode = roomCode?.trim() || null;

  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("closed");
  const [lastErrorByRoom, setLastErrorByRoom] = useState<{ roomCode: string; message: string } | null>(null);
  const [clientId] = useState(getOrCreateClientId);

  const displayNameRef = useRef(displayName);
  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  const sendMessage = useCallback((message: ClientMessage) => {
    if (!socketRef.current) {
      return;
    }
    socketRef.current.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    if (!normalizedRoomCode) {
      return;
    }

    const socket = new PartySocket({
      host: getPartyKitHost(),
      party: getPartyKitName(),
      room: normalizedRoomCode,
      id: clientId,
    });

    const handleOpen = () => {
      setConnectionState("open");

      sendMessage({
        type: "join",
        clientId,
        displayName: displayNameRef.current,
      });
      sendMessage({ type: "request-snapshot" });
    };

    const handleClose = () => {
      setConnectionState("closed");
    };

    const handleError = () => {
      setConnectionState("closed");
      setLastErrorByRoom({
        roomCode: normalizedRoomCode,
        message: "PartyKit connection failed.",
      });
    };

    const handleMessage = (event: MessageEvent<string>) => {
      const parsed = safeJsonParse(event.data);
      if (!isServerMessage(parsed)) {
        return;
      }

      if (parsed.type === "error") {
        setLastErrorByRoom({
          roomCode: normalizedRoomCode,
          message: parsed.message,
        });
        return;
      }

      setSnapshot(parsed.snapshot);
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);
    socket.addEventListener("message", handleMessage);

    socketRef.current = socket;

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("message", handleMessage);
      socket.close(1000, "switching room");
      socketRef.current = null;
    };
  }, [normalizedRoomCode, clientId, sendMessage]);

  useEffect(() => {
    if (connectionState !== "open") {
      return;
    }
    sendMessage({
      type: "set-display-name",
      displayName,
    });
  }, [connectionState, displayName, sendMessage]);

  const uploadPublicKey = useCallback(
    (armoredKey: string, publicKeyFingerprint: string) => {
      sendMessage({
        type: "upload-pubkey",
        armoredKey,
        publicKeyFingerprint,
      });
    },
    [sendMessage]
  );

  const uploadSignedKey = useCallback(
    (targetClientId: string, armoredSignedKey: string) => {
      sendMessage({
        type: "upload-signed-key",
        targetClientId,
        armoredSignedKey,
      });
    },
    [sendMessage]
  );

  return {
    clientId,
    snapshot: snapshot && normalizedRoomCode === snapshot.roomId ? snapshot : null,
    connectionState: !normalizedRoomCode
      ? "closed"
      : connectionState === "open" || lastErrorByRoom?.roomCode === normalizedRoomCode
        ? connectionState
        : "connecting",
    lastError: lastErrorByRoom?.roomCode === normalizedRoomCode ? lastErrorByRoom.message : null,
    uploadPublicKey,
    uploadSignedKey,
    requestSnapshot: () => sendMessage({ type: "request-snapshot" }),
  };
}
