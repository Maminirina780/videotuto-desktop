// src/mediaProtocol.js — Protocole privilégié vtmedia:// pour lire une vidéo
// TÉLÉCHARGÉE (chiffrée) sans jamais écrire le clair sur le disque.
//
// Le lecteur <video> lit une URL vtmedia://play/<token>. Ce schéma n'est
// utilisable QUE depuis l'app (pas depuis un navigateur, pas via le réseau) et
// le token est aléatoire, valable le temps de la session de lecture. À chaque
// requête (y compris les « seeks » avec en-tête Range), on déchiffre à la volée
// UNIQUEMENT la tranche demandée, puis on la renvoie. Aucun serveur local n'est
// exposé, aucun fichier en clair n'est créé.

const { protocol } = require("electron");
const fs = require("fs");
const crypto = require("crypto");
const store = require("./secureStore");

// token -> videoKey (sessions de lecture en cours)
const sessions = new Map();

// Taille max renvoyée par requête (le lecteur redemande les tranches suivantes).
const CHUNK = 3 * 1024 * 1024;

/** Ouvre une session de lecture pour une vidéo hors-ligne et renvoie l'URL. */
function createSession(videoKey) {
  if (!store.get(videoKey)) return null;
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, videoKey);
  return "vtmedia://play/" + token;
}

/** Ferme une session (facultatif — les sessions sont de toute façon éphémères). */
function endSession(token) {
  sessions.delete(token);
}

function register() {
  protocol.handle("vtmedia", async (request) => {
    try {
      const url = new URL(request.url);
      const token = (url.pathname || "").replace(/^\/+/, "") || url.hostname;
      const videoKey = sessions.get(token);
      if (!videoKey) return new Response("session inconnue", { status: 404 });

      const entry = store.get(videoKey);
      if (!entry) return new Response("introuvable", { status: 404 });

      const encPath = store.encPath(videoKey);
      const size = fs.statSync(encPath).size; // clair = même taille qu'en CTR
      const mime = entry.mime || "video/mp4";
      const dataKey = store.openKey(entry);
      const fileIv = Buffer.from(entry.fileIv, "base64");

      const rangeHeader = request.headers.get("Range") || request.headers.get("range");

      const fd = fs.openSync(encPath, "r");
      try {
        if (rangeHeader) {
          const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
          if (Number.isNaN(start) || start < 0) start = 0;
          if (Number.isNaN(end) || end >= size) end = size - 1;
          if (start > end || start >= size) {
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${size}` },
            });
          }
          // Sert au plus CHUNK octets : le lecteur redemandera la suite.
          if (end - start + 1 > CHUNK) end = start + CHUNK - 1;
          const length = end - start + 1;
          const plain = store.decryptRange(fd, dataKey, fileIv, start, length);
          return new Response(plain, {
            status: 206,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(length),
              "Content-Range": `bytes ${start}-${end}/${size}`,
              "Accept-Ranges": "bytes",
              "Cache-Control": "no-store",
            },
          });
        }

        // Sans Range : on renvoie une première tranche (le lecteur enchaîne).
        const length = Math.min(CHUNK, size);
        const plain = store.decryptRange(fd, dataKey, fileIv, 0, length);
        return new Response(plain, {
          status: length < size ? 206 : 200,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(length),
            "Accept-Ranges": "bytes",
            ...(length < size ? { "Content-Range": `bytes 0-${length - 1}/${size}` } : {}),
            "Cache-Control": "no-store",
          },
        });
      } finally {
        fs.closeSync(fd);
        dataKey.fill(0); // efface la clé en clair de la mémoire
      }
    } catch (err) {
      return new Response("erreur de lecture : " + (err && err.message), { status: 500 });
    }
  });
}

module.exports = { register, createSession, endSession };
