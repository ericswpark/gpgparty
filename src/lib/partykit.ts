const PROTOCOL_PREFIX_PATTERN = /^https?:\/\//;
const SOCKET_PROTOCOL_PREFIX_PATTERN = /^wss?:\/\//;

function stripProtocol(value: string): string {
  return value.replace(PROTOCOL_PREFIX_PATTERN, "").replace(SOCKET_PROTOCOL_PREFIX_PATTERN, "");
}

export function getPartyKitHost(): string {
  const configured = import.meta.env.VITE_PARTYKIT_HOST;
  if (configured) {
    return stripProtocol(configured);
  }

  if (import.meta.env.DEV) {
    return "localhost:1999";
  }

  return window.location.host;
}

export function getPartyKitName(): string {
  return import.meta.env.VITE_PARTYKIT_NAME ?? "main";
}

