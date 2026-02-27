import JSZip from "jszip";

type ZipFileInput = {
  name: string;
  content: string;
};

export async function createZipArchive(files: ZipFileInput[]): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.content);
  }

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
