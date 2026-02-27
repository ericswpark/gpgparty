import { useMemo } from "react";
import type { SessionSnapshot } from "../../shared/protocol";

type Props = {
  snapshot: SessionSnapshot;
  selfClientId: string;
};

type NodePosition = {
  clientId: string;
  x: number;
  y: number;
};

export function Graph({ snapshot, selfClientId }: Props) {
  const nodePositions = useMemo<NodePosition[]>(() => {
    const count = snapshot.participants.length;
    if (count === 0) {
      return [];
    }

    if (count === 1) {
      return [{ clientId: snapshot.participants[0].clientId, x: 50, y: 50 }];
    }

    return snapshot.participants.map((participant, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      const radius = 36;
      return {
        clientId: participant.clientId,
        x: 50 + radius * Math.cos(angle),
        y: 50 + radius * Math.sin(angle),
      };
    });
  }, [snapshot.participants]);

  const nodeById = useMemo(() => {
    return Object.fromEntries(
      snapshot.participants.map((participant) => [
        participant.clientId,
        participant,
      ]),
    );
  }, [snapshot.participants]);

  const positionById = useMemo(() => {
    return Object.fromEntries(
      nodePositions.map((position) => [position.clientId, position]),
    );
  }, [nodePositions]);

  return (
    <section className="flex min-h-105 flex-col rounded-2xl border border-white/15 bg-white/5 p-4 lg:h-full lg:min-h-0">
      <div className="mt-4 h-90 rounded-xl border border-white/10 bg-black/25 p-2 lg:h-auto lg:min-h-0 lg:flex-1">
        {snapshot.participants.length === 0 ? (
          <p className="m-0 p-4 text-sm text-white/60">
            Waiting for participants...
          </p>
        ) : (
          <svg viewBox="0 0 100 100" className="h-full w-full">
            {snapshot.edges.map((edge) => {
              const from = positionById[edge.signerClientId];
              const to = positionById[edge.targetClientId];
              if (!from || !to) {
                return null;
              }

              return (
                <line
                  key={`${edge.signerClientId}:${edge.targetClientId}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#67e8f9"
                  strokeOpacity={0.75}
                  strokeWidth={0.6}
                />
              );
            })}

            {nodePositions.map((position) => {
              const participant = nodeById[position.clientId];
              const isSelf = position.clientId === selfClientId;
              return (
                <g key={position.clientId}>
                  <circle
                    cx={position.x}
                    cy={position.y}
                    r={isSelf ? 3.6 : 3}
                    fill={participant?.hasPublicKey ? "#0ea5e9" : "#334155"}
                    stroke={isSelf ? "#facc15" : "#e2e8f0"}
                    strokeWidth={isSelf ? 0.8 : 0.4}
                  />
                  <text
                    x={position.x}
                    y={position.y + 6}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="2.8"
                    style={{ pointerEvents: "none" }}
                  >
                    {participant?.displayName ?? position.clientId}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <p className="m-0 mt-1 text-right text-sm text-white/70">
        {snapshot.participants.length} participants, {snapshot.edges.length}{" "}
        signatures
      </p>
    </section>
  );
}
