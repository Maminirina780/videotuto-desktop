// build-win.js — Construit l'installateur Windows AVEC l'icône personnalisée.
//
// Pourquoi ce script ? Sur cette machine, activer l'édition de l'exe par
// electron-builder télécharge « winCodeSign », dont l'extraction échoue (liens
// symboliques macOS interdits sans le Mode développeur Windows). On garde donc
// `signAndEditExecutable:false`, et on applique l'icône nous-mêmes avec rcedit :
//   1) empaqueter l'app (--dir), sans édition d'exe
//   2) poser l'icône (build/icon.ico) sur l'exe avec rcedit
//   3) construire l'installateur NSIS depuis ce dossier déjà « iconé »
//
// Usage : npm run dist        (ou : node scripts/build-win.js)

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

const rcedit = path.join(root, "build", "rcedit-x64.exe");
const appExe = path.join(root, "release", "win-unpacked", "VideoTuto.exe");
const icon = path.join(root, "build", "icon.ico");

if (!fs.existsSync(rcedit)) {
  console.error("❌ build/rcedit-x64.exe manquant — impossible d'appliquer l'icône.");
  process.exit(1);
}

console.log("① Empaquetage de l'app (electron-builder --dir)…");
run("npx electron-builder --dir");

console.log("② Application de l'icône (rcedit)…");
run(`"${rcedit}" "${appExe}" --set-icon "${icon}"`);

console.log("③ Construction de l'installateur NSIS…");
run("npx electron-builder --prepackaged release/win-unpacked");

console.log("\n✅ Installateur prêt dans release/ avec l'icône VideoTuto.");
