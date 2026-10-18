import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");

const args = process.argv.slice(2);
const noGit = args.includes("--no-git");
const target = args.find((a) => !a.startsWith("--")) || "patch";

// 1. Leer versión actual de package.json
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

let newVersion = "";
if (target === "patch") {
  newVersion = `${major}.${minor}.${patch + 1}`;
} else if (target === "minor") {
  newVersion = `${major}.${minor + 1}.0`;
} else if (target === "major") {
  newVersion = `${major + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(target)) {
  newVersion = target;
} else {
  console.error(`\x1b[31mError: Opción inválida "${target}". Usa: patch, minor, major o una versión exacta como 0.2.0\x1b[0m`);
  process.exit(1);
}

console.log(`\x1b[36m📦 Actualizando Rhod de v${currentVersion} a v${newVersion}...\x1b[0m\n`);

// 2. Actualizar package.json
pkg.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
console.log(` ✅ package.json -> ${newVersion}`);

// 3. Actualizar src-tauri/tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n", "utf-8");
console.log(` ✅ src-tauri/tauri.conf.json -> ${newVersion}`);

// 4. Actualizar src-tauri/Cargo.toml
let cargoToml = fs.readFileSync(cargoTomlPath, "utf-8");
cargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/,
  `$1"${newVersion}"`
);
fs.writeFileSync(cargoTomlPath, cargoToml, "utf-8");
console.log(` ✅ src-tauri/Cargo.toml -> ${newVersion}`);

// 5. Actualizar Cargo.lock mediante cargo check
try {
  console.log(` ⏳ Sincronizando Cargo.lock...`);
  execSync("cargo check", { cwd: path.join(rootDir, "src-tauri"), stdio: "ignore" });
  console.log(` ✅ src-tauri/Cargo.lock sincronizado`);
} catch (err) {
  console.warn(` ⚠️ No se pudo ejecutar cargo check: ${err.message}`);
}

// 6. Commit y Tag en Git
if (!noGit) {
  try {
    const filesToStage = [
      "package.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ];
    execSync(`git add ${filesToStage.join(" ")}`, { cwd: rootDir, stdio: "ignore" });
    execSync(`git commit -m "chore: release v${newVersion}"`, { cwd: rootDir, stdio: "ignore" });
    execSync(`git tag v${newVersion}`, { cwd: rootDir, stdio: "ignore" });
    console.log(` ✅ Commit y Tag Git creados: v${newVersion}\n`);

    console.log(`\x1b[32m🎉 ¡Versión v${newVersion} lista y empaquetada localmente!\x1b[0m`);
    console.log(`\x1b[33mPara publicar y compilar los instaladores de Windows, Mac y Linux en GitHub, corre:\x1b[0m`);
    console.log(`\x1b[1m  git push origin main --tags\x1b[0m\n`);
  } catch (err) {
    console.log(`\x1b[33mNota de Git: Archivos modificados. Para completar el commit y tag ejecuta:\x1b[0m`);
    console.log(`  git commit -am "chore: release v${newVersion}" && git tag v${newVersion}\n`);
  }
} else {
  console.log(`\n\x1b[32m🎉 Archivos actualizados a v${newVersion} (sin commit de Git).\x1b[0m\n`);
}
