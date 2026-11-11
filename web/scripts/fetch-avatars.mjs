// Saves the X profile picture of every person in src/data/featured.ts to src/assets/avatars/, so
// the site serves the pictures itself: no third-party requests from visitors, nothing to rate-limit.
//
// Run it after adding someone to the featured names:  npm run avatars
// Pictures already saved are kept; to download them all again:  npm run avatars -- --refresh
//
// unavatar.io limits how fast it may be asked, so this goes one person at a time and waits when
// told to slow down.
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

const refresh = process.argv.includes("--refresh");
const source = await readFile(new URL("../src/data/featured.ts", import.meta.url), "utf8");
const handles = [...source.matchAll(/\bx:\s*"([A-Za-z0-9_]{1,15})"/g)].map((match) => match[1]);
const dir = new URL("../src/assets/avatars/", import.meta.url);
await mkdir(dir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = (file) => access(file).then(() => true, () => false);

async function download(handle) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`https://unavatar.io/x/${handle}?fallback=false`);
    if (response.status === 429 && attempt < 5) {
      const wait = Number(response.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
      console.log(`  unavatar asked to slow down; waiting ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.startsWith("image/")) throw new Error(`got ${response.status} ${type}`);
    return Buffer.from(await response.arrayBuffer());
  }
}

let failed = 0;
for (const handle of handles) {
  const file = new URL(`${handle.toLowerCase()}.jpg`, dir);
  if (!refresh && (await exists(file))) {
    console.log(`Have @${handle}`);
    continue;
  }
  try {
    await writeFile(file, await download(handle));
    console.log(`Saved @${handle}`);
  } catch (error) {
    failed += 1;
    console.error(`Could not get @${handle}'s picture: ${error.message}`);
  }
  await sleep(1500);
}
process.exitCode = failed ? 1 : 0;
