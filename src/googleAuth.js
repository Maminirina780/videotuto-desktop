// src/googleAuth.js — Connexion Google pour application de bureau.
// Flux OAuth 2.0 « natif » recommandé par Google : navigateur SYSTÈME (Google
// interdit sa page de connexion dans une fenêtre intégrée) + PKCE + redirection
// sur une boucle locale 127.0.0.1. On récupère un id_token qu'on envoie ensuite
// à /auth/google (le backend le vérifie auprès de Google).

const { shell } = require("electron");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Lit clientId/clientSecret depuis l'env (prioritaire) ou google-config.json.
function readConfig() {
  const envId = process.env.VT_GOOGLE_CLIENT_ID;
  const envSecret = process.env.VT_GOOGLE_CLIENT_SECRET;
  if (envId) return { clientId: envId.trim(), clientSecret: (envSecret || "").trim() };
  try {
    const p = path.join(__dirname, "..", "google-config.json");
    const c = JSON.parse(fs.readFileSync(p, "utf8"));
    return { clientId: (c.clientId || "").trim(), clientSecret: (c.clientSecret || "").trim() };
  } catch {
    return { clientId: "", clientSecret: "" };
  }
}

function isConfigured() {
  return !!readConfig().clientId;
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Lance le flux et renvoie un id_token Google. Rejette si l'utilisateur annule
 * (fenêtre du navigateur fermée) ou après 3 min.
 */
function signIn() {
  const { clientId, clientSecret } = readConfig();
  if (!clientId) return Promise.reject(new Error("Connexion Google non configurée."));

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { server.close(); } catch {}
      fn(arg);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname !== "/") { res.writeHead(404); res.end(); return; }
        const code = url.searchParams.get("code");
        const gotState = url.searchParams.get("state");
        const err = url.searchParams.get("error");

        // Page renvoyée dans le navigateur de l'utilisateur.
        const page = (msg) =>
          "<!doctype html><meta charset=utf-8><title>VideoTuto</title>" +
          "<body style='font-family:sans-serif;background:#000;color:#fff;display:flex;" +
          "align-items:center;justify-content:center;height:100vh;margin:0;text-align:center'>" +
          "<div><h2 style='color:#0A84FF'>VideoTuto</h2><p>" + msg + "</p></div>";

        if (err) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(page("Connexion annulée. Vous pouvez fermer cet onglet."));
          return done(reject, new Error("Connexion Google annulée."));
        }
        if (!code || gotState !== state) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(page("Requête invalide."));
          return done(reject, new Error("Réponse Google invalide."));
        }

        // Échange du code contre les jetons (avec PKCE).
        const redirectUri = "http://127.0.0.1:" + server.address().port;
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code_verifier: verifier,
        });
        if (clientSecret) body.set("client_secret", clientSecret);

        const tokenRes = await fetch(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        const data = await tokenRes.json().catch(() => ({}));

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Connexion réussie ! Revenez à l'application VideoTuto."));

        if (!tokenRes.ok || !data.id_token) {
          return done(reject, new Error("Échec de l'échange Google (" + tokenRes.status + ")."));
        }
        done(resolve, data.id_token);
      } catch (e) {
        try { res.writeHead(500); res.end(); } catch {}
        done(reject, e);
      }
    });

    server.on("error", (e) => done(reject, e));

    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: "http://127.0.0.1:" + port,
        response_type: "code",
        scope: "openid email profile",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        prompt: "select_account",
      });
      shell.openExternal(AUTH_URL + "?" + params.toString());
    });

    const timer = setTimeout(() => done(reject, new Error("Délai de connexion dépassé.")), 180000);
  });
}

module.exports = { signIn, isConfigured };
