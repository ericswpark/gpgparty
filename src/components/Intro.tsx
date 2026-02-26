export function Intro() {
  return (
    <section
      className="w-full max-w-2xl rounded-2xl border border-white/15 bg-white/5 p-8 text-left shadow-2xl backdrop-blur-sm"
      aria-labelledby="fingerprint-title"
    >
      <h1
        id="fingerprint-title"
        className="m-0 text-2xl font-semibold leading-tight text-white sm:text-3xl"
      >
        gpgpartyviz
      </h1>
      <p className="mt-3 mb-4 text-sm text-white/80 sm:text-base">
        Enter a starting public key fingerprint
      </p>
      <label className="sr-only" htmlFor="fingerprint-input">
        GPG fingerprint
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="fingerprint-input"
          name="fingerprint"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/50 outline-none ring-0 transition focus:border-blue-300 focus-visible:ring-2 focus-visible:ring-blue-300/70 sm:text-base"
          placeholder="e.g. 0123 4567 89AB CDEF 0123 4567 89AB CDEF 0123 4567"
        />
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-blue-200/40 bg-blue-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80 sm:text-base"
        >
          Go!
        </button>
      </div>
    </section>
  )
}
