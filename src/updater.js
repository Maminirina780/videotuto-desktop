// src/updater.js — Mise à jour du logiciel, comme l'app Android.
// Au démarrage, on interroge /desktop-version. Si une version plus récente est
// publiée, on propose (ou on impose, si "mandatory") l'installation : on
// télécharge l'installateur .exe puis on le lance ; le logiciel se ferme
// pendant l'installation.

const { app, dialog, shell, BrowserWindow } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BASE = process.env.VT_BACKEND || "https://video-backend-sj8q.onrender.com";

// Compare deux versions "X.Y.Z" → 1 si a>b, -1 si a<b, 0 si égales.
function cmpVersion(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function fetchLatest() {
  const res = await fetch(BASE + "/desktop-version", { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json(); // { version, mandatory, url, sizeBytes }
}

// Télécharge l'installateur dans le dossier temporaire, avec progression.
async function downloadInstaller(win, onProgress) {
  const res = await fetch(BASE + "/app.exe", { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error("Téléchargement HTTP " + res.status);
  const total = Number(res.headers.get("content-length") || 0);
  const dest = path.join(os.tmpdir(), "VideoTuto-Setup-" + Date.now() + ".exe");
  const out = fs.createWriteStream(dest);
  let received = 0, lastPct = -1;
  for await (const chunk of res.body) {
    const buf = Buffer.from(chunk);
    if (!out.write(buf)) await new Promise((r) => out.once("drain", r));
    received += buf.length;
    if (total) {
      const pct = Math.floor((received * 100) / total);
      if (pct !== lastPct) {
        lastPct = pct;
        if (win && !win.isDestroyed()) win.setProgressBar(pct / 100); // barre dans la barre des tâches
        if (onProgress) onProgress(pct);
      }
    }
  }
  await new Promise((r) => out.end(r));
  if (win && !win.isDestroyed()) win.setProgressBar(-1);
  return dest;
}

/**
 * Vérifie et applique la mise à jour. Renvoie true si une mise à jour
 * OBLIGATOIRE est en attente et n'a pas été installée (l'appelant doit alors
 * bloquer / quitter).
 */
async function checkForUpdates(win, { silent = false } = {}) {
  let latest;
  try {
    latest = await fetchLatest();
  } catch (e) {
    return false; // hors-ligne ou serveur indisponible : on n'empêche rien
  }
  const current = app.getVersion();
  if (!latest.version || cmpVersion(latest.version, current) <= 0) {
    if (!silent && win) {
      dialog.showMessageBox(win, {
        type: "info",
        title: "Mise à jour",
        message: "Votre logiciel est à jour (v" + current + ").",
        buttons: ["OK"],
      });
    }
    return false;
  }

  const mandatory = latest.mandatory !== false;
  const choice = dialog.showMessageBoxSync(win, {
    type: mandatory ? "warning" : "info",
    title: mandatory ? "Mise à jour requise" : "Mise à jour disponible",
    message:
      "La version " + latest.version + " est disponible (vous avez la " + current + ").",
    detail: mandatory
      ? "Vous devez installer cette mise à jour pour continuer à utiliser VideoTuto."
      : "Voulez-vous la télécharger et l'installer maintenant ?",
    buttons: mandatory ? ["Mettre à jour", "Quitter"] : ["Mettre à jour", "Plus tard"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (choice !== 0) {
    if (mandatory) {
      app.quit();
      return true;
    }
    return false; // MAJ facultative reportée
  }

  // L'utilisateur accepte : téléchargement puis lancement de l'installateur.
  try {
    const exe = await downloadInstaller(win);
    // Ferme d'abord la fenêtre, puis ouvre l'installateur et quitte.
    await shell.openPath(exe);
    setTimeout(() => app.quit(), 800);
    return true;
  } catch (e) {
    dialog.showMessageBox(win, {
      type: "error",
      title: "Mise à jour",
      message: "Le téléchargement de la mise à jour a échoué.",
      detail: String(e && e.message),
      buttons: ["OK"],
    });
    if (mandatory) { app.quit(); return true; }
    return false;
  }
}

module.exports = { checkForUpdates, cmpVersion };
