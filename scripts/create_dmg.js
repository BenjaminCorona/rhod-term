import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version;

const appPath = path.join(rootDir, "src-tauri", "target", "release", "bundle", "macos", "Rhod.app");
const dmgDir = path.join(rootDir, "src-tauri", "target", "release", "bundle", "dmg");
const dmgPath = path.join(dmgDir, `Rhod_${version}_aarch64.dmg`);

if (!fs.existsSync(appPath)) {
  console.log("🔨 Compilando Rhod.app...");
  execSync("pnpm tauri build --bundles app", { cwd: rootDir, stdio: "inherit" });
}

console.log(`📦 Creando instalador .dmg para Rhod v${version}...`);
const stagingDir = "/tmp/rhod_dmg_staging";
execSync(`rm -rf "${stagingDir}" && mkdir -p "${stagingDir}"`);
execSync(`cp -R "${appPath}" "${stagingDir}/"`);
execSync(`ln -s /Applications "${stagingDir}/Applications"`);

if (!fs.existsSync(dmgDir)) {
  fs.mkdirSync(dmgDir, { recursive: true });
}

// Desmontar cualquier volumen Rhod previo
try {
  execSync('hdiutil detach /Volumes/Rhod -force', { stdio: "ignore" });
} catch {}

execSync(`hdiutil create -volname "Rhod" -srcfolder "${stagingDir}" -ov -format UDZO "${dmgPath}"`, {
  stdio: "inherit",
});
execSync(`rm -rf "${stagingDir}"`);

console.log(`\n🎉 Instalador generado con éxito:`);
console.log(`  \x1b[32m${dmgPath}\x1b[0m\n`);
