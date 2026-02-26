type Props = {
  startFingerprint: string;
};

export function Graph({ startFingerprint }: Props) {
  return (
    <main className="min-h-screen w-full p-6">
      <section className="h-full min-h-[calc(100vh-3rem)] w-full p-2 sm:p-4">
        <h2 className="text-xl font-semibold text-white sm:text-2xl">Graph</h2>
        <p className="mt-2 text-sm text-white/80 sm:text-base">
          Starting fingerprint:{" "}
          <span className="font-mono">{startFingerprint}</span>
        </p>
        <p className="mt-2 text-sm text-white/70 sm:text-base">
          fetch keys and show graph here methinks
        </p>
      </section>
    </main>
  );
}
