// src/backend.js — Dialogue avec le backend VideoTuto (mêmes comptes que l'app).
// Gère : identité machine (X-Device-Id), jeton chiffré au repos, signature
// d'app optionnelle (appsig), liste des vidéos, liens signés, téléchargements
// chiffrés. Tourne dans le PROCESS PRINCIPAL (jamais exposé au renderer).

const { app, safeStorage } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const store = require("./secureStore");
const media = require("./mediaProtocol");
const googleAuth = require("./googleAuth");

const BASE = process.env.VT_BACKEND || "https://video-backend-sj8q.onrender.com";
// Secret de signature d'app (appsig). Absent par défaut → aucune signature
// envoyée (le backend est de toute façon en APP_SIG_MODE=off). Le jour où vous
// activez l'enforce, renseignez le même secret que l'APK ici.
const APP_SIG_SECRET = process.env.VT_APP_SIGNING_SECRET || "";

let TOKEN = null;
let EMAIL = null;
let sessionLoaded = false;

function cfg(name) {
  return path.join(app.getPath("userData"), name);
}

// ── Identité machine : un identifiant stable, généré une fois ──
function deviceId() {
  const f = cfg("device.json");
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")).id;
  } catch {
    const id = "desktop-" + crypto.randomUUID();
    fs.writeFileSync(f, JSON.stringify({ id }));
    return id;
  }
}

// ── Persistance du jeton (chiffré au repos par l'OS) ──
function saveSession(token, email) {
  TOKEN = token;
  EMAIL = email;
  const f = cfg("session.json");
  const body = { email };
  if (safeStorage.isEncryptionAvailable()) {
    body.tokenEnc = safeStorage.encryptString(token).toString("base64");
  } else {
    body.tokenPlain = token; // repli si magasin OS indisponible
  }
  fs.writeFileSync(f, JSON.stringify(body));
}
function loadSession() {
  if (sessionLoaded) return;
  sessionLoaded = true;
  try {
    const b = JSON.parse(fs.readFileSync(cfg("session.json"), "utf8"));
    EMAIL = b.email || null;
    if (b.tokenEnc && safeStorage.isEncryptionAvailable()) {
      TOKEN = safeStorage.decryptString(Buffer.from(b.tokenEnc, "base64"));
    } else if (b.tokenPlain) {
      TOKEN = b.tokenPlain;
    }
  } catch {
    /* pas de session */
  }
}
function clearSession() {
  TOKEN = null;
  EMAIL = null;
  try { fs.unlinkSync(cfg("session.json")); } catch {}
}

// ── Signature d'app (appsig) — identique au calcul du backend ──
function appSigHeaders(method, pathWithQuery) {
  if (!APP_SIG_SECRET) return {};
  const ts = String(Date.now());
  const canonical = [String(method).toUpperCase(), pathWithQuery, ts, deviceId()].join("\n");
  const sig = crypto.createHmac("sha256", APP_SIG_SECRET).update(canonical).digest("hex");
  return { "X-App-Sig": sig, "X-App-Ts": ts };
}

function authHeaders(method, pathWithQuery) {
  return {
    Authorization: "Bearer " + TOKEN,
    "X-Device-Id": deviceId(),
    ...appSigHeaders(method, pathWithQuery),
  };
}

// Titre lisible depuis la clé (retire le préfixe horodaté, comme l'app).
function titleFromKey(videoKey) {
  const raw = String(videoKey || "")
    .replace(/^.*\//, "")
    .replace(/\.[^.]+$/, "")
    .replace(/^\d{9,}[-_]/, "")
    .replace(/[-_]/g, " ")
    .trim();
  if (!raw) return "Vidéo";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ── API publique (appelée via IPC) ──

async function login(email, password) {
  try {
    const res = await fetch(BASE + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 423) return { ok: false, deviceLocked: true, error: data.error };
    if (!res.ok || !data.token) {
      return { ok: false, error: data.error || "Connexion impossible." };
    }
    saveSession(data.token, data.email || email);
    return { ok: true, email: EMAIL };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible. Réessayez." };
  }
}

// Connexion via Google (pour les comptes créés avec « Continuer avec Google »).
async function loginWithGoogle() {
  let idToken;
  try {
    idToken = await googleAuth.signIn();
  } catch (e) {
    return { ok: false, error: e.message || "Connexion Google annulée." };
  }
  try {
    const res = await fetch(BASE + "/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Device-Id": deviceId() },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 423) return { ok: false, deviceLocked: true, error: data.error };
    if (!res.ok || !data.token) {
      return { ok: false, error: data.error || "Connexion Google refusée." };
    }
    saveSession(data.token, data.email || null);
    return { ok: true, email: EMAIL };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible. Réessayez." };
  }
}

// Le bouton Google doit-il s'afficher ? (dépend de la configuration OAuth)
function googleAvailable() {
  return { available: googleAuth.isConfigured() };
}

function logout() {
  clearSession();
  return { ok: true };
}

function session() {
  loadSession();
  return { loggedIn: !!TOKEN, email: EMAIL };
}

async function listVideos() {
  loadSession();
  if (!TOKEN) return { ok: false, error: "Non connecté." };
  try {
    const res = await fetch(BASE + "/my-videos", { headers: authHeaders("GET", "/my-videos") });
    if (res.status === 401) { clearSession(); return { ok: false, error: "Session expirée." }; }
    if (res.status === 423) return { ok: false, deviceLocked: true, error: "Appareil non autorisé." };
    const data = await res.json().catch(() => ({}));
    const offline = store.states();
    const videos = (data.videos || []).map((v) => ({
      videoKey: v.videoKey,
      title: titleFromKey(v.videoKey),
      expiresAt: v.expiresAt || null,
      durationSec: v.durationSec || null,
      startedAt: v.startedAt || null,
      folderId: v.folderId || null,
      downloaded: offline[v.videoKey] === "downloaded",
    }));
    return { ok: true, videos };
  } catch (e) {
    // Hors-ligne : on montre au moins les téléchargements présents.
    const offline = store.states();
    const videos = store.readIndex()
      .filter((e2) => offline[e2.videoKey] === "downloaded")
      .map((e2) => ({
        videoKey: e2.videoKey,
        title: e2.title || titleFromKey(e2.videoKey),
        expiresAt: e2.expiresAt || null,
        downloaded: true,
      }));
    return { ok: true, videos, offlineMode: true };
  }
}

// Récupère un lien signé (10 min) pour une vidéo, avec l'échéance d'accès.
// Renvoie { url, expiresAt, durationSec } — expiresAt (ms epoch, null = illimité)
// est ancré au 1er visionnage côté serveur et pilote le compte à rebours.
async function videoLink(videoKey) {
  const p = "/video-link?key=" + encodeURIComponent(videoKey);
  const res = await fetch(BASE + p, { headers: authHeaders("GET", p) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    const err = new Error(data.error || "Lien indisponible (" + res.status + ")");
    err.status = res.status;
    throw err;
  }
  return { url: data.url, expiresAt: data.expiresAt || null, durationSec: data.durationSec || null };
}

// Source de lecture : hors-ligne (déchiffrement local) sinon flux signé.
async function playSource(videoKey) {
  const offlineUrl = media.createSession(videoKey);
  if (offlineUrl) {
    // Hors-ligne : échéance mémorisée au téléchargement (null = illimité).
    const entry = store.get(videoKey);
    return { ok: true, type: "offline", src: offlineUrl, expiresAt: (entry && entry.expiresAt) || null };
  }
  try {
    const { url, expiresAt, durationSec } = await videoLink(videoKey);
    return { ok: true, type: "stream", src: url, expiresAt, durationSec };
  } catch (e) {
    return { ok: false, error: e.message, status: e.status || 0 };
  }
}

// ── Téléchargement chiffré ──
const inFlight = new Map(); // videoKey -> AbortController

async function download(item, onProgress) {
  const { videoKey } = item;
  if (inFlight.has(videoKey)) return { ok: false, error: "Déjà en cours." };
  const controller = new AbortController();
  inFlight.set(videoKey, controller);
  const tmp = store.tempPath(videoKey);
  try {
    const { url } = await videoLink(videoKey);
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok || !res.body) throw new Error("Téléchargement HTTP " + res.status);
    const total = Number(res.headers.get("content-length") || 0);
    const mime = res.headers.get("content-type") || "video/mp4";

    const dataKey = crypto.randomBytes(32);
    const fileIv = crypto.randomBytes(16);
    const cipher = store.newEncryptCipher(dataKey, fileIv);
    const out = fs.createWriteStream(tmp);

    let received = 0;
    let lastPct = -1;
    for await (const chunk of res.body) {
      const buf = Buffer.from(chunk);
      const enc = cipher.update(buf);
      if (!out.write(enc)) {
        await new Promise((r) => out.once("drain", r)); // respecte la pression
      }
      received += buf.length;
      if (total) {
        const pct = Math.floor((received * 100) / total);
        if (pct !== lastPct) { lastPct = pct; if (onProgress) onProgress(pct); }
      }
    }
    out.write(cipher.final());
    await new Promise((r) => out.end(r));

    const size = fs.statSync(tmp).size;
    const finalPath = store.encPath(videoKey);
    fs.renameSync(tmp, finalPath);

    store.add({
      videoKey,
      title: item.title || titleFromKey(videoKey),
      fileName: path.basename(finalPath),
      fileIv: fileIv.toString("base64"),
      key: store.wrapKey(dataKey),
      size,
      mime,
      expiresAt: item.expiresAt || null,
      downloadedAt: Date.now(),
    });
    dataKey.fill(0);
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    if (e.name === "AbortError") return { ok: false, canceled: true };
    return { ok: false, error: e.message };
  } finally {
    inFlight.delete(videoKey);
  }
}

function cancelDownload(videoKey) {
  const c = inFlight.get(videoKey);
  if (c) c.abort();
  return { ok: true };
}

// Titre lisible d'une image (préfixe images/ + horodatage retirés).
function imageTitle(imageKey) {
  return titleFromKey(imageKey);
}

// ── Images (vue sécurisée en ligne) ──
async function listImages() {
  loadSession();
  if (!TOKEN) return { ok: false, error: "Non connecté." };
  try {
    const res = await fetch(BASE + "/my-images", { headers: authHeaders("GET", "/my-images") });
    if (res.status === 401) { clearSession(); return { ok: false, error: "Session expirée." }; }
    const data = await res.json().catch(() => ({}));
    const images = (data.images || [])
      // Une image rangée dans un dossier s'ouvre depuis le dossier (anti-doublon).
      .filter((im) => !im.folderId)
      .map((im) => ({
        imageKey: im.imageKey,
        title: imageTitle(im.imageKey),
        expiresAt: im.expiresAt || null,
      }));
    return { ok: true, images };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible." };
  }
}

// Lien signé (10 min) d'une image, pour l'afficher dans <img>.
async function imageSource(imageKey) {
  const p = "/image-link?key=" + encodeURIComponent(imageKey);
  try {
    const res = await fetch(BASE + p, { headers: authHeaders("GET", p) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      return { ok: false, status: res.status, error: data.error || "Image indisponible." };
    }
    return { ok: true, src: data.url };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible." };
  }
}

// ── Assistant « Mora Abonner » ──
// Le serveur répond en connaissant les vidéos et les temps d'accès de
// l'utilisateur. history = [{role:'user'|'assistant', text}] (contexte récent).
async function askAssistant(message, history) {
  loadSession();
  if (!TOKEN) return { ok: false, error: "Non connecté." };
  const p = "/assistant";
  try {
    const res = await fetch(BASE + p, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders("POST", p) },
      body: JSON.stringify({ message, history: history || [] }),
    });
    if (res.status === 401) {
      clearSession();
      return { ok: false, error: "Session expirée, reconnectez-vous." };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.reply) {
      return { ok: false, error: data.error || "Réponse indisponible." };
    }
    // `videos` = inventaire structuré (titre, état, temps restant) : sert au
    // tableau coloré et au graphique. `actions` = boutons proposés (ex.
    // « Télécharger toutes mes vidéos »), déclenchés par l'utilisateur seul.
    return {
      ok: true,
      reply: data.reply,
      videos: data.videos || null,
      actions: data.actions || [],
    };
  } catch (e) {
    return { ok: false, error: "Pas de connexion — vérifiez votre réseau." };
  }
}

// ── Dossiers ──
async function listFolders() {
  loadSession();
  if (!TOKEN) return { ok: false, error: "Non connecté." };
  try {
    const res = await fetch(BASE + "/my-folders", { headers: authHeaders("GET", "/my-folders") });
    if (res.status === 401) { clearSession(); return { ok: false, error: "Session expirée." }; }
    const data = await res.json().catch(() => ({}));
    return { ok: true, folders: data.folders || [] };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible." };
  }
}

async function folderContent(folderId) {
  const p = "/folder-content?folderId=" + encodeURIComponent(folderId);
  try {
    const res = await fetch(BASE + p, { headers: authHeaders("GET", p) });
    if (res.status === 403) return { ok: false, error: "Accès non autorisé à ce dossier." };
    const data = await res.json().catch(() => ({}));
    const offline = store.states();
    const videos = (data.videos || []).map((v) => ({
      videoKey: v.videoKey,
      title: titleFromKey(v.videoKey),
      expiresAt: v.expiresAt || null,
      durationSec: v.durationSec || null,
      startedAt: v.startedAt || null,
      downloaded: offline[v.videoKey] === "downloaded",
    }));
    const images = (data.images || []).map((im) => ({
      imageKey: im.imageKey,
      title: imageTitle(im.imageKey),
      expiresAt: im.expiresAt || null,
    }));
    const files = (data.files || []).map((f) => ({ name: f.name, sizeBytes: f.sizeBytes || 0 }));
    return { ok: true, videos, images, files };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible." };
  }
}

/**
 * Télécharge un fichier de dossier (PDF, texte…) dans un dossier temporaire
 * privé, pour l'ouvrir dans une fenêtre protégée ; le fichier est effacé à la
 * fermeture de la fenêtre (main.js).
 */
async function downloadFolderFile(folderId, name) {
  const p = "/file-raw?folderId=" + encodeURIComponent(folderId) + "&name=" + encodeURIComponent(name);
  try {
    const res = await fetch(BASE + p, { headers: authHeaders("GET", p) });
    if (res.status === 403) return { ok: false, error: "Accès non autorisé à ce fichier." };
    if (!res.ok) return { ok: false, error: "Fichier introuvable." };
    const buf = Buffer.from(await res.arrayBuffer());
    const os = require("os"), fsx = require("fs"), path = require("path");
    const dir = fsx.mkdtempSync(path.join(os.tmpdir(), "moravideo-"));
    const safe = String(name).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "fichier";
    const file = path.join(dir, safe);
    fsx.writeFileSync(file, buf);
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: "Réseau indisponible." };
  }
}

// ── Fiche « À propos de Mora Abonner » (commune à toutes les apps Mora) ──
// Publique, modifiable par l'admin dans Mora Ship. Le renderer ne peut pas
// faire de requête externe (CSP connect-src 'self') : on la récupère ici, on
// la garde en cache dans userData/abonner.json, et on retombe sur les valeurs
// par défaut ci-dessous hors ligne. Une valeur vide = ligne masquée.
const ABONNER_URL = "https://mora-ship.pages.dev/api/abonner";
const ABONNER_DEFAUT = {
  nom: "Mora Abonner",
  slogan: "",
  description: "",
  facebook: "https://www.facebook.com/MoraAbonner",
  instagram: "",
  whatsapp: "261337247942",
  telephone: "+261337247942",
  email: "maminirinaprincy67@gmail.com",
  adresse: "Ivato, Antananarivo, Madagascar",
  site: "https://mora-abonner-pages.pages.dev/",
  horaires: "Réponse sur WhatsApp tous les jours",
};

// Ne garde que les champs connus, en texte ; un champ absent reprend la valeur par défaut.
function ficheNettoyee(src) {
  const out = {};
  for (const k of Object.keys(ABONNER_DEFAUT)) {
    const v = src && src[k];
    out[k] = typeof v === "string" ? v.trim().slice(0, 2000) : ABONNER_DEFAUT[k];
  }
  return out;
}

// reseau=false → cache (ou défaut) immédiat ; reseau=true → API, puis cache en repli.
async function abonnerFiche(reseau) {
  const f = cfg("abonner.json");
  const lireCache = () => {
    try { return { ok: true, source: "cache", abonner: ficheNettoyee(JSON.parse(fs.readFileSync(f, "utf8")).abonner) }; }
    catch { return { ok: true, source: "defaut", abonner: { ...ABONNER_DEFAUT } }; }
  };
  if (!reseau) return lireCache();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(ABONNER_URL, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!data || !data.abonner || typeof data.abonner !== "object") throw new Error("format");
    const abonner = ficheNettoyee(data.abonner);
    try { fs.writeFileSync(f, JSON.stringify({ abonner, at: Date.now() })); } catch {}
    return { ok: true, source: "reseau", abonner };
  } catch {
    return lireCache();
  } finally {
    clearTimeout(t);
  }
}

// Version de l'app (affichée dans Compte et À propos).
function appInfo() {
  loadSession();
  return { version: app.getVersion(), email: EMAIL || null };
}

module.exports = {
  abonnerFiche,
  appInfo,
  downloadFolderFile,
  login,
  loginWithGoogle,
  googleAvailable,
  logout,
  session,
  listVideos,
  playSource,
  download,
  cancelDownload,
  listImages,
  imageSource,
  listFolders,
  folderContent,
  askAssistant,
};
