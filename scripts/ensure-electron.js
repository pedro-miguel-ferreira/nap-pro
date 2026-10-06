#!/usr/bin/env node
/**
 * Repair electron's binary install after `npm install`.
 *
 * electron's own install script depends on extract-zip@2.0.1 (the latest ever
 * published), whose promise never settles on Node 26+ — the script exits 0
 * without extracting anything or writing path.txt, and the first `npm start`
 * then dies with "Electron failed to install correctly". This script runs in
 * our postinstall: when electron is already correctly installed it is a no-op;
 * otherwise it finds the zip in @electron/get's cache (the download leg of the
 * upstream script works — only extraction hangs), or downloads it with curl,
 * verifies the SHA-256 against electron's shipped checksums.json, extracts
 * with macOS-native `ditto` (correct for .app bundles), and writes path.txt.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
if (!fs.existsSync(electronDir)) process.exit(0); // no-dev install, --ignore-scripts, …
if (process.platform !== 'darwin') process.exit(0); // nap-pro is macOS-only

const { version } = require(path.join(electronDir, 'package.json'));
const platformPath = 'Electron.app/Contents/MacOS/Electron';
const pathTxt = path.join(electronDir, 'path.txt');
const dist = path.join(electronDir, 'dist');

function isInstalled() {
  try {
    if (fs.readFileSync(path.join(dist, 'version'), 'utf8').replace(/^v/, '') !== version) return false;
    if (fs.readFileSync(pathTxt, 'utf8') !== platformPath) return false;
    return fs.existsSync(path.join(dist, platformPath));
  } catch {
    return false;
  }
}
if (isInstalled()) process.exit(0);

const arch = process.arch;
const zipName = `electron-v${version}-darwin-${arch}.zip`;

// 1. Look for the zip in @electron/get's cache (keyed dirs under one root).
const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron');
let zip = null;
if (fs.existsSync(cacheRoot)) {
  for (const entry of fs.readdirSync(cacheRoot)) {
    const candidate = path.join(cacheRoot, entry, zipName);
    if (fs.existsSync(candidate)) {
      zip = candidate;
      break;
    }
  }
}

// 2. Not cached → download it.
if (!zip) {
  zip = path.join(os.tmpdir(), zipName);
  const url = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`;
  console.log(`ensure-electron: downloading ${url}`);
  execFileSync('curl', ['-fsSL', '--retry', '3', '-o', zip, url], { stdio: 'inherit' });
}

// 3. Verify against the checksums electron ships with.
const checksums = require(path.join(electronDir, 'checksums.json'));
const expected = checksums[zipName];
if (expected) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  if (actual !== expected) {
    console.error(`ensure-electron: checksum mismatch for ${zip}\n  expected ${expected}\n  actual   ${actual}`);
    process.exit(1);
  }
} else {
  console.warn(`ensure-electron: no checksum for ${zipName} in checksums.json — skipping verification`);
}

// 4. Extract and finish what electron's install script would have done.
console.log(`ensure-electron: extracting ${zip}`);
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
execFileSync('ditto', ['-xk', zip, dist]);

const srcTypes = path.join(dist, 'electron.d.ts');
if (fs.existsSync(srcTypes)) fs.renameSync(srcTypes, path.join(electronDir, 'electron.d.ts'));

fs.writeFileSync(pathTxt, platformPath);
console.log(`ensure-electron: electron ${version} installed`);
