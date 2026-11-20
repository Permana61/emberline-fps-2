// EMBERLINE — entrypoint for make.fun threejs-fps-01 (Node 22, standard library only).
//
// The game itself lives in game/ beside this file (plain static files, the browser loads
// them as ES modules with three.js from an import map) and its screenshots live in
// screenshots/ (the first by name is the cover). This program hands both in: it stages
// game/ and screenshots/ into the output directory, then writes output/dossier.json —
// the summary the judge reads — with the vendored make.fun library.
//
// Run it outside the grader's container with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The scorer's own caps (reference/gate.json), kept exactly as the competition states
// them: only text_max_bytes shapes the dossier's bytes; the other caps refuse an entry
// the scorer would refuse — more than 4 screenshots or one over 256 KiB; more than
// 993 files in game/ or 48 MiB of game files in all. game/ counts beside /output's
// own 1000-entry cap, its screenshots/ and dossier.json.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function logStep(step: string): void {
  console.log(`[emberline] ${step}`);
}

function fail(message: string): never {
  console.error(`[emberline] ERROR: ${message}`);
  process.exit(1);
}

// Walk a directory tree and count its files and their bytes, so the log shows what
// is being staged and the caps can be checked before the dossier builder runs.
function countTree(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) {
      const sub = countTree(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (info.isFile()) {
      files += 1;
      bytes += info.size;
    }
  }
  return { files, bytes };
}

// The payload the judge expects: a game/ folder with an index.html entrypoint and a
// screenshots/ folder holding the cover and the play shots. Refuse early, with a
// readable message, instead of letting the dossier builder throw a bare error.
function checkInputs(): void {
  const gameDir = join(HERE, 'game');
  if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
    fail(`game/ not found beside main.ts (looked in ${gameDir})`);
  }
  if (!existsSync(join(gameDir, 'index.html'))) {
    fail('game/index.html is missing — the game has no entrypoint');
  }
  const game = countTree(gameDir);
  logStep(`game/: ${game.files} files, ${game.bytes} bytes`);
  if (game.files > CAPS.game_max_files) {
    fail(`game/ holds ${game.files} files, over the ${CAPS.game_max_files} cap`);
  }
  if (game.bytes > CAPS.game_max_bytes) {
    fail(`game/ holds ${game.bytes} bytes, over the ${CAPS.game_max_bytes} cap`);
  }
}

// Screenshots are optional on disk (an empty folder still stages fine), but when they
// are there they must fit the caps: at most 4 shots, none over 256 KiB. The dossier
// only holds PNG and JPEG files, so anything else is refused here with its name.
function checkScreenshots(): void {
  const shotsDir = join(HERE, 'screenshots');
  if (!existsSync(shotsDir)) {
    logStep('screenshots/: missing, staging an empty folder');
    return;
  }
  const names = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  logStep(`screenshots/: ${names.length} files`);
  if (names.length > CAPS.screenshots.max) {
    fail(`screenshots/ holds ${names.length} shots, over the ${CAPS.screenshots.max} cap`);
  }
  for (const name of names) {
    const path = join(shotsDir, name);
    const lower = name.toLowerCase();
    if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) {
      fail(`screenshots/${name} is not a PNG or JPEG file`);
    }
    const size = statSync(path).size;
    if (size > CAPS.screenshots.max_bytes) {
      fail(`screenshots/${name} is ${size} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
    }
  }
}

// Stage the payload into the output directory: a fresh game/ copy and a fresh
// screenshots/ copy, so nothing stale from an earlier run survives in /output.
function stagePayload(): void {
  mkdirSync(OUT, { recursive: true });
  cpSync(join(HERE, 'game'), join(OUT, 'game'), { recursive: true });
  logStep(`staged game/ -> ${join(OUT, 'game')}`);
  mkdirSync(join(OUT, 'screenshots'), { recursive: true });
  if (existsSync(join(HERE, 'screenshots'))) {
    cpSync(join(HERE, 'screenshots'), join(OUT, 'screenshots'), { recursive: true });
    logStep(`staged screenshots/ -> ${join(OUT, 'screenshots')}`);
  }
}

// Build the dossier from the staged payload and write it, then read it back and
// compare it byte for byte with what was built — a half-written dossier must never
// reach the judge.
function writeAndVerifyDossier(): void {
  const bytes = buildDossier(OUT, CAPS);
  const dossierPath = join(OUT, 'dossier.json');
  writeFileSync(dossierPath, bytes);
  const written = readFileSync(dossierPath);
  if (!written.equals(bytes)) {
    fail('dossier.json read back different from what was built');
  }
  logStep(`wrote ${dossierPath} (${bytes.length} bytes)`);
}

function main(): void {
  logStep(`EMBERLINE entrypoint: staging from ${HERE} into ${OUT}`);
  checkInputs();
  checkScreenshots();
  stagePayload();
  writeAndVerifyDossier();
  logStep('done — game/, screenshots/ and dossier.json are in place');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
}
