import { Download, ArrowBigDownDash } from "lucide-react";

type Props = {
  canDownloadMine: boolean;
  canDownloadAll: boolean;
  onDownloadMine: () => void;
  onDownloadAll: () => void;
};

export function Downloads({
  canDownloadMine,
  canDownloadAll,
  onDownloadMine,
  onDownloadAll,
}: Props) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/15 bg-white/5 p-4">
      <div className="grid gap-3">
        <button
          type="button"
          disabled={!canDownloadMine}
          onClick={onDownloadMine}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-4 py-3 text-center text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={16} aria-hidden="true" />
          Download signed public keys of mine
        </button>
        <button
          type="button"
          disabled={!canDownloadAll}
          onClick={onDownloadAll}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-center text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowBigDownDash size={16} aria-hidden="true" />
          Download all public keys of this room
        </button>
      </div>
    </section>
  );
}
