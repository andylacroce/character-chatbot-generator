#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'express-rate-limit');
const tsconfigPath = path.join(pkgDir, 'tsconfig.json');

try {
  if (!fs.existsSync(tsconfigPath)) {
    console.warn('express-rate-limit tsconfig not found; nothing to fix');
    process.exit(0);
  }

  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    console.warn('Could not parse express-rate-limit tsconfig; skipping fix');
    process.exit(0);
  }

  // Make the package tsconfig IDE-friendly: remove unresolved "extends" and ensure no inputs
  let changed = false;
  if (typeof cfg.extends === 'string' && cfg.extends.includes('@express-rate-limit/tsconfig')) {
    delete cfg.extends;
    changed = true;
    console.log('Removed unreachable "extends" from express-rate-limit tsconfig.');
  }

  if (!Array.isArray(cfg.include) || cfg.include.length !== 0) {
    cfg.include = [];
    changed = true;
  }

  if (!Array.isArray(cfg.files) || cfg.files.length !== 0) {
    cfg.files = [];
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(tsconfigPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    console.log('Patched express-rate-limit tsconfig to be IDE-friendly.');
  } else {
    console.log('express-rate-limit tsconfig already IDE-friendly.');
  }

  // Remove previously created placeholder file if present
  const placeholder = path.join(pkgDir, 'source', 'index.d.ts');
  if (fs.existsSync(placeholder)) {
    try {
      fs.unlinkSync(placeholder);
      // attempt to remove the directory if empty
      const srcDir = path.join(pkgDir, 'source');
      const files = fs.readdirSync(srcDir);
      if (files.length === 0) fs.rmdirSync(srcDir);
      console.log('Removed placeholder source file and directory.');
    } catch (e) {
      // Non-fatal
    }
  }
} catch (err) {
  console.error('Error while attempting to fix express-rate-limit tsconfig:', err && err.message ? err.message : err);
  // do not fail installation for this script
}
