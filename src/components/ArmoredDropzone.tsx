import { useRef, useState } from "react";

type Props = {
  title: string;
  message: string;
  disabled?: boolean;
  stretch?: boolean;
  onFileLoaded: (armoredText: string, fileName: string) => Promise<void> | void;
};

async function readFirstDroppedFile(files: FileList): Promise<{ text: string; fileName: string } | null> {
  const firstFile = files.item(0);
  if (!firstFile) {
    return null;
  }

  return {
    text: await firstFile.text(),
    fileName: firstFile.name,
  };
}

export function ArmoredDropzone({
  title,
  message,
  disabled = false,
  stretch = false,
  onFileLoaded,
}: Props) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFiles = async (files: FileList) => {
    if (disabled || isProcessing) {
      return;
    }

    const loaded = await readFirstDroppedFile(files);
    if (!loaded) {
      return;
    }

    setIsProcessing(true);
    setStatusText(`Uploading ${loaded.fileName}...`);

    try {
      await onFileLoaded(loaded.text.trim(), loaded.fileName);
      setStatusText(`Uploaded ${loaded.fileName}`);
    } catch {
      setStatusText(`Failed to upload ${loaded.fileName}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className={`rounded-xl border border-white/15 bg-white/5 p-4 ${stretch ? "flex h-full min-h-0 flex-col" : ""}`}>
      <h3 className="m-0 text-base font-semibold text-white">{title}</h3>
      <div
        role="button"
        tabIndex={0}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragActive(false);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setIsDragActive(false);
          await processFiles(event.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled && !isProcessing) {
            fileInputRef.current?.click();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled && !isProcessing) {
              fileInputRef.current?.click();
            }
          }
        }}
        className={`mt-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition ${
          disabled
            ? "cursor-not-allowed border-white/20 text-white/45"
            : isDragActive
              ? "border-cyan-300 bg-cyan-500/15 text-cyan-100"
              : "cursor-pointer border-white/30 text-white/75"
        } ${stretch ? "grid min-h-0 flex-1 place-items-center" : ""}`}
      >
        {isProcessing ? "Processing..." : message}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".asc,.txt"
        className="hidden"
        onChange={async (event) => {
          if (!event.target.files) {
            return;
          }
          await processFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {statusText ? <p className="m-0 mt-3 text-xs text-white/60">{statusText}</p> : null}
    </section>
  );
}
