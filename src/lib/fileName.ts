export function normalizeFileName(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-");
  return cleaned.replaceAll(/^-+|-+$/g, "") || "unknown";
}
