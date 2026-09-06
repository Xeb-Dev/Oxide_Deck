import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const newVersion = process.argv[2]?.trim().replace(/^v/, '');
if (!newVersion || !/^\d+\.\d+\.\d+/.test(newVersion)) {
  console.error('Usage: pnpm run version:set <semver> (e.g. pnpm run version:set 1.4.1)');
  process.exit(1);
}

// 1. package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`✓ Updated package.json -> ${newVersion}`);

// 2. src-tauri/tauri.conf.json
const tauriPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauriConf.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log(`✓ Updated src-tauri/tauri.conf.json -> ${newVersion}`);

// 3. src-tauri/Cargo.toml
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/, `$1"${newVersion}"`);
fs.writeFileSync(cargoPath, cargo);
console.log(`✓ Updated src-tauri/Cargo.toml -> ${newVersion}`);

console.log(`\nSuccessfully updated all configuration files to v${newVersion}!`);
