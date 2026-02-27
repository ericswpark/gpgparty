import ForceGraph2D from "react-force-graph-2d";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";
import type { SessionSnapshot } from "../../../shared/protocol";

type Props = {
  snapshot: SessionSnapshot;
  selfClientId: string;
};

type GraphNode = {
  id: string;
  label: string;
  hasPublicKey: boolean;
  isSelf: boolean;
};

type GraphLink = {
  source: string;
  target: string;
};

export function Graph({ snapshot, selfClientId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );
  const resizeFitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const nodesLengthRef = useRef(0);
  const prevNodesLengthRef = useRef(0);
  const fitOnEngineStopRef = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setSize({
        width: Math.max(Math.floor(entry.contentRect.width), 240),
        height: Math.max(Math.floor(entry.contentRect.height), 240),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo<{ nodes: GraphNode[]; links: GraphLink[] }>(() => {
    const nodes = snapshot.participants.map((participant) => ({
      id: participant.clientId,
      label: participant.displayName,
      hasPublicKey: participant.hasPublicKey,
      isSelf: participant.clientId === selfClientId,
    }));

    const links = snapshot.edges.map((edge) => ({
      source: edge.signerClientId,
      target: edge.targetClientId,
    }));

    return { nodes, links };
  }, [selfClientId, snapshot.edges, snapshot.participants]);

  useEffect(() => {
    nodesLengthRef.current = graphData.nodes.length;
  }, [graphData.nodes.length]);

  useEffect(() => {
    const previousCount = prevNodesLengthRef.current;
    const currentCount = graphData.nodes.length;

    // Refit only when another participant node is added after initial population
    if (previousCount > 0 && currentCount > previousCount) {
      fitOnEngineStopRef.current = true;
    }

    prevNodesLengthRef.current = currentCount;
  }, [graphData.nodes.length]);

  const handleEngineStop = useCallback(() => {
    if (!fitOnEngineStopRef.current) {
      return;
    }
    fitOnEngineStopRef.current = false;

    requestAnimationFrame(() => {
      graphRef.current?.zoomToFit(250, 72);
    });
  }, []);

  useEffect(() => {
    if (!graphRef.current || size.width === 0 || size.height === 0) {
      return;
    }
    if (nodesLengthRef.current === 0) {
      return;
    }

    if (resizeFitTimeoutRef.current) {
      clearTimeout(resizeFitTimeoutRef.current);
    }

    resizeFitTimeoutRef.current = setTimeout(() => {
      requestAnimationFrame(() => {
        graphRef.current?.zoomToFit(250, 72);
      });
    }, 180);

    return () => {
      if (resizeFitTimeoutRef.current) {
        clearTimeout(resizeFitTimeoutRef.current);
        resizeFitTimeoutRef.current = null;
      }
    };
  }, [size.height, size.width]);

  return (
    <section className="flex min-h-105 min-w-0 flex-col rounded-2xl border border-white/15 bg-white/5 p-4 lg:h-full lg:min-h-0">
      <div
        ref={containerRef}
        className="mt-4 h-90 overflow-hidden rounded-xl border border-white/10 bg-black/25 lg:h-auto lg:min-h-0 lg:flex-1"
      >
        {snapshot.participants.length === 0 ? (
          <p className="m-0 p-4 text-sm text-white/60">
            Waiting for participants...
          </p>
        ) : size.width > 0 && size.height > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            onEngineStop={handleEngineStop}
            nodeRelSize={6}
            cooldownTicks={120}
            d3VelocityDecay={0.25}
            enableNodeDrag={false}
            linkColor={() => "rgba(103, 232, 249, 0.55)"}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => "rgba(103, 232, 249, 0.65)"}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const graphNode = node as GraphNode;
              const radius = graphNode.isSelf ? 6 : 4.75;

              ctx.beginPath();
              ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI, false);
              ctx.fillStyle = graphNode.hasPublicKey ? "#0ea5e9" : "#334155";
              ctx.fill();

              ctx.lineWidth = graphNode.isSelf ? 2 : 1.4;
              ctx.strokeStyle = graphNode.isSelf ? "#facc15" : "#e2e8f0";
              ctx.stroke();

              const label = graphNode.label;
              const fontSize = Math.max(12 / globalScale, 3.5);
              ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
              ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + radius + 2);
            }}
          />
        ) : null}
      </div>

      <p className="m-0 mt-1 text-right text-sm text-white/70">
        {snapshot.participants.length} participants, {snapshot.edges.length}{" "}
        signatures
      </p>
    </section>
  );
}
