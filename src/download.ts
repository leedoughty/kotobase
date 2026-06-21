import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { x as extractTar } from "tar";

const VERSION = "3.6.2+20260615170427";
const ASSET = `jmdict-eng-${VERSION}.json.tgz`;
const SHA256 =
  "a330a05652dfa46bdc4faf1a102e66fd6ee2c54c53d1581994e1ead15243cb62";
const DOWNLOAD_URL = `https://github.com/scriptin/jmdict-simplified/releases/download/${encodeURIComponent(VERSION)}/${ASSET}`;

const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const TGZ_PATH = `${DATA_DIR}${ASSET}`;

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function download(): Promise<void> {
  console.log(`Downloading ${ASSET} …`);

  const res = await fetch(DOWNLOAD_URL);
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }

  const part = `${TGZ_PATH}.part`;
  await pipeline(
    Readable.fromWeb(res.body as WebReadableStream),
    createWriteStream(part),
  );
  await rename(part, TGZ_PATH);
}

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  if ((await exists(TGZ_PATH)) && (await sha256(TGZ_PATH)) === SHA256) {
    console.log(`Archive present and verified, skipping download (${ASSET}).`);
  } else {
    await download();
    const got = await sha256(TGZ_PATH);

    if (got !== SHA256) {
      await rm(TGZ_PATH, { force: true });
      throw new Error(
        `checksum mismatch for ${ASSET}\n  expected ${SHA256}\n  got      ${got}`,
      );
    }

    console.log("Checksum verified.");
  }

  console.log("Extracting …");
  await extractTar({ file: TGZ_PATH, cwd: DATA_DIR });
  console.log(`Done. JSON extracted into ${DATA_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
