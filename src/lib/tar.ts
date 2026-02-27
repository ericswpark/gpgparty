type TarFileInput = {
  name: string;
  content: string;
};

function padOctal(value: number, size: number): string {
  const octal = value.toString(8);
  return octal.padStart(size - 1, "0") + "\0";
}

function writeAscii(target: Uint8Array, offset: number, value: string, maxLength: number) {
  const normalized = value.slice(0, maxLength);
  for (let index = 0; index < normalized.length; index += 1) {
    target[offset + index] = normalized.charCodeAt(index);
  }
}

function buildHeader(name: string, size: number): Uint8Array {
  const header = new Uint8Array(512);
  writeAscii(header, 0, name, 100);
  writeAscii(header, 100, "0000644\0", 8);
  writeAscii(header, 108, "0000000\0", 8);
  writeAscii(header, 116, "0000000\0", 8);
  writeAscii(header, 124, padOctal(size, 12), 12);
  writeAscii(header, 136, padOctal(Math.floor(Date.now() / 1000), 12), 12);
  writeAscii(header, 148, "        ", 8);
  writeAscii(header, 156, "0", 1);
  writeAscii(header, 257, "ustar\0", 6);
  writeAscii(header, 263, "00", 2);

  let checksum = 0;
  for (const byte of header) {
    checksum += byte;
  }
  writeAscii(header, 148, `${checksum.toString(8).padStart(6, "0")}\0 `, 8);
  return header;
}

export function createTarArchive(files: TarFileInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const file of files) {
    const contentBytes = encoder.encode(file.content);
    chunks.push(buildHeader(file.name, contentBytes.length));
    chunks.push(contentBytes);

    const remainder = contentBytes.length % 512;
    if (remainder !== 0) {
      chunks.push(new Uint8Array(512 - remainder));
    }
  }

  chunks.push(new Uint8Array(1024));

  const totalLength = chunks.reduce((accumulator, chunk) => accumulator + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

