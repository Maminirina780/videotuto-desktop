// src/secureStore.js — Coffre chiffré des téléchargements + identité machine.
//
// Modèle de sécurité (calqué sur l'app Android « façon Netflix ») :
//   • Chaque vidéo est chiffrée en AES-256-CTR (mode à accès aléatoire, donc
//     lecture avec avance/recul possible) avec sa PROPRE clé de données.
//   • La clé de données est « enrobée » par safeStorage d'Electron, qui
//     s'appuie sur le magasin de secrets de l'OS (DPAPI sous Windows). Le
//     résultat est donc LIÉ À CETTE MACHINE et à cette session utilisateur :
//     copier le fichier .enc (et même sa clé enrobée) sur un autre PC ne
//     permet PAS de le lire.
//   • Le clair n'est jamais écrit sur le disque : il est déchiffré à la volée,
//     par tranches, au moment de la lecture (voir mediaProtocol.js).

const { app, safeStorage } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BLOCK = 16; // taille de bloc AES

function dir() {
  const d = path.join(app.getPath("userData"), "offline");
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function indexFile() {
  return path.join(dir(), "index.json");
}
function safeName(videoKey) {
  return videoKey.replace(/[^A-Za-z0-9._-]/g, "_");
}
function encPath(videoKey) {
  return path.join(dir(), safeName(videoKey) + ".enc");
}
function tempPath(videoKey) {
  return path.join(dir(), safeName(videoKey) + ".part");
}

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexFile(), "utf8")) || [];
  } catch {
    return [];
  }
}
function writeIndex(entries) {
  const tmp = indexFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, indexFile()); // écriture atomique
}

// ── Chiffrement de la clé de données par l'OS (lié à la machine) ──
function wrapKey(dataKey) {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      scheme: "os",
      wrapped: safeStorage.encryptString(dataKey.toString("base64")).toString("base64"),
    };
  }
  // Repli (rare : magasin OS indisponible) — clé stockée telle quelle. On le
  // signale pour que l'appelant puisse avertir. La protection reste : accès
  // navigateur/script bloqué, mais la liaison machine est absente.
  return { scheme: "plain", wrapped: dataKey.toString("base64") };
}
function unwrapKey(rec) {
  if (rec.scheme === "os") {
    const b64 = safeStorage.decryptString(Buffer.from(rec.wrapped, "base64"));
    return Buffer.from(b64, "base64");
  }
  return Buffer.from(rec.wrapped, "base64");
}

// ── AES-CTR : additionner un compteur à l'IV (128 bits, big-endian) ──
function addToIv(fileIv, blockIndex) {
  const iv = Buffer.from(fileIv); // copie
  let carry = BigInt(blockIndex);
  for (let i = BLOCK - 1; i >= 0 && carry > 0n; i--) {
    const sum = BigInt(iv[i]) + (carry & 0xffn);
    iv[i] = Number(sum & 0xffn);
    carry = (carry >> 8n) + (sum >> 8n);
  }
  return iv;
}

// Un cipher d'écriture positionné au début (téléchargement).
function newEncryptCipher(dataKey, fileIv) {
  return crypto.createCipheriv("aes-256-ctr", dataKey, fileIv);
}

/**
 * Déchiffre EXACTEMENT les octets [start, start+length) d'un fichier .enc,
 * sans jamais matérialiser tout le clair. Sert la lecture avec seek.
 */
function decryptRange(fd, dataKey, fileIv, start, length) {
  const blockIndex = Math.floor(start / BLOCK);
  const intra = start % BLOCK;
  const iv = addToIv(fileIv, blockIndex);
  const fileOffset = blockIndex * BLOCK;
  const toRead = intra + length;
  const raw = Buffer.alloc(toRead);
  const got = fs.readSync(fd, raw, 0, toRead, fileOffset);
  const decipher = crypto.createDecipheriv("aes-256-ctr", dataKey, iv);
  const dec = Buffer.concat([decipher.update(raw.subarray(0, got)), decipher.final()]);
  return dec.subarray(intra, intra + length);
}

// ── Entrées du coffre ──
function get(videoKey) {
  const e = readIndex().find((x) => x.videoKey === videoKey);
  if (!e) return null;
  if (!fs.existsSync(encPath(videoKey))) return null;
  if (e.expiresAt && e.expiresAt < Date.now()) {
    remove(videoKey);
    return null;
  }
  return e;
}

function add(entry) {
  const all = readIndex().filter((x) => x.videoKey !== entry.videoKey);
  all.push(entry);
  writeIndex(all);
}

function remove(videoKey) {
  try { fs.unlinkSync(encPath(videoKey)); } catch {}
  try { fs.unlinkSync(tempPath(videoKey)); } catch {}
  writeIndex(readIndex().filter((x) => x.videoKey !== videoKey));
}

/** Purge les téléchargements expirés (appelée à chaque lecture d'état). */
function purgeExpired() {
  const now = Date.now();
  const all = readIndex();
  const expired = all.filter((e) => e.expiresAt && e.expiresAt < now);
  if (expired.length) {
    expired.forEach((e) => remove(e.videoKey));
  }
}

/** État { videoKey: 'downloaded' } des vidéos présentes hors-ligne. */
function states() {
  purgeExpired();
  const out = {};
  readIndex().forEach((e) => {
    if (fs.existsSync(encPath(e.videoKey))) out[e.videoKey] = "downloaded";
  });
  return out;
}

// Ouvre (déchiffre) la clé d'une vidéo pour la lecture.
function openKey(entry) {
  return unwrapKey(entry.key);
}

module.exports = {
  BLOCK,
  dir,
  encPath,
  tempPath,
  readIndex,
  writeIndex,
  wrapKey,
  unwrapKey,
  addToIv,
  newEncryptCipher,
  decryptRange,
  get,
  add,
  remove,
  states,
  purgeExpired,
  openKey,
  osEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
};
