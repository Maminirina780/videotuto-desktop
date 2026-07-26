// app.js — Logique de l'interface. N'a AUCUN accès au système : tout passe par
// le pont sûr window.vt (défini par preload.js). Un mock est fourni pour la
// prévisualisation dans un navigateur (jamais utilisé dans l'app Electron).

(function () {
  "use strict";

  // ── Mock de prévisualisation (uniquement hors Electron) ──
  if (!window.vt) {
    const demo = [
      { videoKey: "videos/1783795186446-html1.mp4", title: "Html1", expiresAt: null, downloaded: true },
      { videoKey: "videos/1783795202869-css-bases.mp4", title: "Css bases", expiresAt: Date.now() + 2 * 3600 * 1000, downloaded: false },
      { videoKey: "videos/1783932133430-terminal.mp4", title: "Terminal", expiresAt: null, downloaded: false },
      { videoKey: "videos/1783932144000-minute.mp4", title: "Accès minuté", expiresAt: null, durationSec: 300, downloaded: false },
    ];
    window.vt = {
      __mock: true,
      session: async () => ({ loggedIn: false }),
      login: async (e) => ({ ok: true, email: e }),
      loginGoogle: async () => ({ ok: true, email: "demo@gmail.com" }),
      googleAvailable: async () => ({ available: true }),
      logout: async () => ({ ok: true }),
      listVideos: async () => ({ ok: true, videos: demo }),
      // En aperçu, on simule une échéance courte (~70 s) pour montrer le
      // compte à rebours et son passage au rouge sous 1 min.
      playSource: async () => ({ ok: true, type: "stream", src: "", expiresAt: Date.now() + 70 * 1000 }),
      downloadStates: async () => ({}),
      download: async () => ({ ok: true }),
      cancelDownload: async () => ({ ok: true }),
      deleteDownload: async () => ({ ok: true }),
      checkUpdate: async () => ({ ok: true }),
      onDownloadProgress: () => () => {},
      listImages: async () => ({ ok: true, images: [
        { imageKey: "images/1784000000000-schema-reseau.png", title: "Schema reseau", expiresAt: null },
        { imageKey: "images/1784000000001-photo-4k.jpg", title: "Photo 4k", expiresAt: Date.now() + 3 * 3600 * 1000 },
      ] }),
      imageSource: async () => ({ ok: true, src: "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='250'><rect width='400' height='250' fill='#0A84FF'/><text x='200' y='130' fill='#fff' font-size='22' text-anchor='middle'>Aperçu</text></svg>") }),
      assistant: async (msg) => ({
        ok: true,
        reply:
          "Vous avez 4 vidéos accessibles. Pour « Accès minuté », il reste 5 min " +
          "à la lecture. (Aperçu : réponse simulée à « " + msg + " ».)",
      }),
      listFolders: async () => ({ ok: true, folders: [{ id: "f1", name: "Cours HTML", expiresAt: null }] }),
      folderContent: async () => ({ ok: true,
        videos: [{ videoKey: "videos/9-html3.mp4", title: "Html3", expiresAt: null, downloaded: false }],
        images: [{ imageKey: "images/8-diagramme.png", title: "Diagramme", expiresAt: null }] }),
    };
  }

  const $ = (id) => document.getElementById(id);
  const views = { login: $("loginView"), library: $("libraryView"), player: $("playerView"), imageViewer: $("imageViewerView") };
  function show(name) {
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  let toastTimer = null;
  function toast(msg, isErr) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (isErr ? " err" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  // Anti clic-droit (empêche « Enregistrer la vidéo sous… », inspecter, etc.)
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  // Bloque le glisser d'éléments.
  window.addEventListener("dragstart", (e) => e.preventDefault());

  const PLAY_GLYPH =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

  function expiryLabel(ms) {
    const rem = ms - Date.now();
    if (rem <= 0) return "Accès expiré";
    const min = Math.floor(rem / 60000), d = Math.floor(min / 1440),
      h = Math.floor((min % 1440) / 60), m = min % 60;
    if (d >= 1) return "Il reste " + d + " j " + h + " h";
    if (h >= 1) return "Il reste " + h + " h " + m + " min";
    return "Il reste " + m + " min";
  }

  // Durée lisible d'une fenêtre d'accès : « 5 min », « 2 h 30 min », « 45 s »…
  function durationLabel(sec) {
    sec = Math.round(sec || 0);
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600),
      m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d >= 1) return d + " j" + (h ? " " + h + " h" : "");
    if (h >= 1) return h + " h" + (m ? " " + m + " min" : "");
    if (m >= 1) return m + " min" + (s ? " " + s + " s" : "");
    return s + " s";
  }

  // Sous-titre d'accès d'une carte vidéo : décompte en cours, « démarre à la
  // lecture » (durée non entamée), ou accès permanent.
  function accessSub(v) {
    if (v.expiresAt) return '<span class="chip-exp">' + esc(expiryLabel(v.expiresAt)) + "</span>";
    if (v.durationSec) return '<span class="chip-exp">⏳ ' + esc(durationLabel(v.durationSec)) + " à la lecture</span>";
    return "<span>Accès permanent</span>";
  }

  // Formate un temps restant (ms) en TOUJOURS afficher les secondes :
  // « 02:07 » sous 1 h, « 1:04:12 » sous 24 h, « 2j 03:12:40 » au-delà.
  function countdownText(ms) {
    const total = Math.ceil(ms / 1000);
    const days = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600),
      m = Math.floor((total % 3600) / 60), s = total % 60;
    const p2 = (n) => String(n).padStart(2, "0");
    if (days >= 1) return days + "j " + p2(h) + ":" + p2(m) + ":" + p2(s);
    if (h >= 1) return h + ":" + p2(m) + ":" + p2(s);
    return p2(m) + ":" + p2(s);
  }

  // ── Connexion ──
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginErr").textContent = "";
    const btn = $("loginBtn");
    btn.disabled = true;
    btn.textContent = "Connexion…";
    try {
      const r = await window.vt.login($("email").value.trim(), $("password").value);
      if (r.ok) {
        $("password").value = "";
        enterLibrary(r.email);
      } else if (r.deviceLocked) {
        $("loginErr").textContent =
          "Ce compte est déjà utilisé sur un autre appareil. Demandez à l'administrateur de « Changer d'appareil ».";
      } else {
        $("loginErr").textContent = r.error || "Connexion impossible.";
      }
    } catch (_) {
      $("loginErr").textContent = "Erreur inattendue.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Se connecter";
    }
  });

  // Bouton « Continuer avec Google » (affiché seulement si l'OAuth est configuré).
  (async function initGoogle() {
    try {
      const g = await window.vt.googleAvailable();
      if (g && g.available) {
        $("googleWrap").hidden = false;
        $("googleBtn").hidden = false;
      }
    } catch (_) {}
  })();
  $("googleBtn").addEventListener("click", async () => {
    $("loginErr").textContent = "";
    const btn = $("googleBtn");
    btn.disabled = true;
    const prev = btn.innerHTML;
    btn.textContent = "Connexion à Google…";
    try {
      const r = await window.vt.loginGoogle();
      if (r.ok) enterLibrary(r.email);
      else if (r.deviceLocked)
        $("loginErr").textContent =
          "Ce compte est déjà utilisé sur un autre appareil. Demandez à l'administrateur de « Changer d'appareil ».";
      else $("loginErr").textContent = r.error || "Connexion Google impossible.";
    } catch (_) {
      $("loginErr").textContent = "Connexion Google impossible.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await window.vt.logout();
    show("login");
  });
  $("refreshBtn").addEventListener("click", loadLibrary);
  $("updateBtn").addEventListener("click", () => {
    if (window.vt.checkUpdate) window.vt.checkUpdate();
  });

  async function enterLibrary(email) {
    $("whoami").textContent = email || "";
    show("library");
    await loadLibrary();
    detectSections();
  }

  // ── Bibliothèque ──
  let VIDEOS = [];
  async function loadLibrary() {
    const box = $("library");
    box.innerHTML = "";
    const r = await window.vt.listVideos();
    if (!r.ok) {
      if (r.deviceLocked) toast("Appareil non autorisé pour ce compte.", true);
      else toast(r.error || "Chargement impossible.", true);
      if (r.error === "Session expirée." || r.error === "Non connecté.") show("login");
      return;
    }
    VIDEOS = r.videos || [];
    $("libraryEmpty").hidden = VIDEOS.length > 0;
    if (r.offlineMode) toast("Mode hors-ligne — vos téléchargements");
    VIDEOS.forEach((v) => renderCard(v, box, loadLibrary));
  }

  function renderCard(v, container, onReload) {
    container = container || $("library");
    onReload = onReload || loadLibrary;
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.key = v.videoKey;
    const sub = accessSub(v);
    const dlBtn = v.downloaded
      ? '<span class="dl-state">✓ Téléchargée</span><button class="btn danger small act-del">Supprimer</button>'
      : '<button class="btn ghost small act-dl">Télécharger</button>';
    card.innerHTML =
      '<div class="thumb act-play">' + PLAY_GLYPH + "</div>" +
      '<div class="card-body act-play"><div class="card-title" title="' + esc(v.title) + '">' + esc(v.title) + "</div>" +
      '<div class="card-sub">' + sub + "</div></div>" +
      '<div class="card-actions">' + dlBtn + "</div>";

    card.querySelectorAll(".act-play").forEach((el) =>
      el.addEventListener("click", () => playVideo(v))
    );
    const dl = card.querySelector(".act-dl");
    if (dl) dl.addEventListener("click", (e) => { e.stopPropagation(); startDownload(v, dl, onReload); });
    const del = card.querySelector(".act-del");
    if (del) del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.vt.deleteDownload(v.videoKey);
      toast("Téléchargement supprimé");
      onReload();
    });
    container.appendChild(card);
  }

  // ── Téléchargement ──
  const progressUnsub = window.vt.onDownloadProgress(({ videoKey, percent }) => {
    const card = document.querySelector('.card[data-key="' + cssEsc(videoKey) + '"] .act-dl');
    if (card) card.textContent = percent + " %";
  });
  function cssEsc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); }

  async function startDownload(v, btn, onReload) {
    btn.disabled = true;
    btn.textContent = "0 %";
    const r = await window.vt.download(v);
    if (r.ok) { toast("« " + v.title + " » disponible hors-ligne ✓"); (onReload || loadLibrary)(); }
    else if (!r.canceled) { toast(r.error || "Échec du téléchargement", true); btn.disabled = false; btn.textContent = "Télécharger"; }
  }

  // ── Compte à rebours d'accès (dans le lecteur) ──
  let cdInterval = null;
  function stopPlayerCountdown() {
    if (cdInterval) { clearInterval(cdInterval); cdInterval = null; }
    const el = $("playerCountdown");
    el.hidden = true;
    el.classList.remove("danger");
  }
  function startPlayerCountdown(deadlineMs) {
    stopPlayerCountdown();
    if (!deadlineMs || deadlineMs <= Date.now()) return; // illimité / déjà passé
    const el = $("playerCountdown"), txt = $("playerCountdownText");
    const tick = () => {
      const rem = deadlineMs - Date.now();
      if (rem <= 0) {
        stopPlayerCountdown();
        onAccessExpiredPlayer();
        return;
      }
      txt.textContent = countdownText(rem);
      el.classList.toggle("danger", rem <= 60000); // rouge sous 1 min
    };
    el.hidden = false;
    tick();
    cdInterval = setInterval(tick, 1000);
  }
  function onAccessExpiredPlayer() {
    const video = $("video");
    try { video.pause(); } catch (_) {}
    video.removeAttribute("src");
    video.load();
    const msg = $("playerMsg");
    msg.hidden = false;
    msg.textContent = "Votre accès à cette vidéo a expiré.";
  }

  // ── Lecture ──
  async function playVideo(v) {
    show("player");
    $("playerTitle").textContent = v.title;
    stopPlayerCountdown();
    const video = $("video");
    const msg = $("playerMsg");
    msg.hidden = true;
    video.removeAttribute("src");
    video.load();
    const r = await window.vt.playSource(v.videoKey);
    if (!r.ok) {
      msg.hidden = false;
      msg.textContent =
        r.status === 410 ? "Votre accès à cette vidéo a expiré."
        : r.status === 403 ? "Vous n'avez pas accès à cette vidéo."
        : r.error || "Lecture impossible.";
      return;
    }
    video.src = r.src;
    video.play().catch(() => {});
    // Le serveur ancre l'échéance au 1er visionnage et la renvoie : le décompte
    // démarre donc maintenant, quand l'utilisateur regarde vraiment.
    startPlayerCountdown(r.expiresAt || 0);
  }

  $("backBtn").addEventListener("click", () => {
    const video = $("video");
    video.pause();
    video.removeAttribute("src");
    video.load();
    stopPlayerCountdown();
    show("library");
  });

  // ── Onglets Vidéos / Images / Dossiers ──
  let imagesLoaded = false, foldersLoaded = false;

  function switchTab(name) {
    document.querySelectorAll("#tabs .tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === name));
    ["videos", "images", "folders"].forEach((p) => { $("panel-" + p).hidden = p !== name; });
    if (name === "images" && !imagesLoaded) { imagesLoaded = true; loadImages(); }
    if (name === "folders" && !foldersLoaded) { foldersLoaded = true; loadFolders(); }
  }
  document.querySelectorAll("#tabs .tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  // Affiche les onglets Images / Dossiers seulement si l'utilisateur en a.
  async function detectSections() {
    imagesLoaded = false; foldersLoaded = false;
    let hasImages = false, hasFolders = false;
    try { const r = await window.vt.listImages(); hasImages = r.ok && (r.images || []).length > 0; } catch (_) {}
    try { const r = await window.vt.listFolders(); hasFolders = r.ok && (r.folders || []).length > 0; } catch (_) {}
    $("tabImages").hidden = !hasImages;
    $("tabFolders").hidden = !hasFolders;
    $("tabs").hidden = !(hasImages || hasFolders);
    switchTab("videos");
  }

  // ── Images ──
  async function loadImages() {
    const box = $("imagesGrid"); box.innerHTML = "";
    const r = await window.vt.listImages();
    if (!r.ok) { toast(r.error || "Chargement impossible.", true); return; }
    const imgs = r.images || [];
    $("imagesEmpty").hidden = imgs.length > 0;
    imgs.forEach((im) => renderImageCard(im, box));
  }
  function renderImageCard(im, container) {
    const card = document.createElement("div");
    card.className = "card";
    const sub = im.expiresAt
      ? '<span class="chip-exp">' + esc(expiryLabel(im.expiresAt)) + "</span>"
      : '<span>Accès permanent</span>';
    card.innerHTML =
      '<div class="thumb">🖼️</div>' +
      '<div class="card-body"><div class="card-title" title="' + esc(im.title) + '">' + esc(im.title) + "</div>" +
      '<div class="card-sub">' + sub + "</div></div>";
    card.style.cursor = "zoom-in";
    card.addEventListener("click", () => openImage(im));
    container.appendChild(card);
  }
  async function openImage(im) {
    show("imageViewer");
    $("imgTitle").textContent = im.title;
    const el = $("imageEl"), msg = $("imgMsg");
    msg.hidden = true; el.removeAttribute("src");
    const r = await window.vt.imageSource(im.imageKey);
    if (!r.ok) {
      msg.hidden = false;
      msg.textContent = r.status === 410 ? "Votre accès à cette image a expiré."
        : r.status === 403 ? "Vous n'avez pas accès à cette image."
        : r.error || "Image indisponible.";
      return;
    }
    el.src = r.src;
  }
  $("imgBack").addEventListener("click", () => {
    $("imageEl").removeAttribute("src");
    show("library");
  });

  // ── Dossiers ──
  async function loadFolders() {
    const box = $("foldersList"); box.innerHTML = "";
    $("folderContent").hidden = true; box.hidden = false;
    const r = await window.vt.listFolders();
    if (!r.ok) { toast(r.error || "Chargement impossible.", true); return; }
    const folders = r.folders || [];
    $("foldersEmpty").hidden = folders.length > 0;
    folders.forEach((f) => {
      const row = document.createElement("div");
      row.className = "folder-row";
      const exp = f.expiresAt ? '<span class="fexp">' + esc(expiryLabel(f.expiresAt)) + "</span>" : "";
      row.innerHTML = '<span class="fico">📁</span><span class="fname">' + esc(f.name) + "</span>" + exp + '<span style="color:var(--label3)">›</span>';
      row.addEventListener("click", () => openFolder(f));
      box.appendChild(row);
    });
  }
  async function openFolder(f) {
    $("foldersList").hidden = true;
    $("folderContent").hidden = false;
    $("folderName").textContent = f.name;
    const items = $("folderItems"); items.innerHTML = "";
    const r = await window.vt.folderContent(f.id);
    if (!r.ok) { toast(r.error || "Dossier indisponible.", true); return; }
    const reload = () => openFolder(f);
    (r.videos || []).forEach((v) => renderCard(v, items, reload));
    (r.images || []).forEach((im) => renderImageCard(im, items));
    if (!(r.videos || []).length && !(r.images || []).length) {
      items.innerHTML = '<div class="empty">Ce dossier est vide.</div>';
    }
  }
  $("folderBack").addEventListener("click", () => {
    $("folderContent").hidden = true;
    $("foldersList").hidden = false;
  });

  // ── Assistant « Ask Mora Abonner » ──
  // Le serveur répond en connaissant les vidéos et les temps d'accès de
  // l'utilisateur (français ou malgache). On garde l'historique récent pour
  // que la conversation reste cohérente.
  const chatHistory = []; // [{role:'user'|'assistant', text}]
  let chatBusy = false;

  const WELCOME =
    "Bonjour 👋 Je suis Ask Mora Abonner, votre assistant. " +
    "Posez vos questions en français ou en malgache : « combien de vidéos ai-je ? », " +
    "« combien de temps me reste-t-il ? »…";

  function addMsg(text, kind) {
    const div = document.createElement("div");
    div.className = "msg " + kind;
    div.textContent = text;
    $("chatLog").appendChild(div);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
    return div;
  }

  function openChat() {
    $("chatOverlay").hidden = false;
    $("chatPanel").hidden = false;
    if (!$("chatLog").childElementCount) addMsg(WELCOME, "bot");
    $("chatInput").focus();
  }
  function closeChat() {
    $("chatOverlay").hidden = true;
    $("chatPanel").hidden = true;
  }

  $("assistantBtn").addEventListener("click", openChat);
  $("chatClose").addEventListener("click", closeChat);
  $("chatOverlay").addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("chatPanel").hidden) closeChat();
  });

  $("chatForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("chatInput");
    const text = input.value.trim();
    if (!text || chatBusy) return;

    input.value = "";
    addMsg(text, "me");
    chatHistory.push({ role: "user", text });

    chatBusy = true;
    $("chatSend").disabled = true;
    const typing = addMsg("…", "bot typing");

    let reply, failed = false;
    try {
      // On n'envoie que les échanges PRÉCÉDENTS (la question courante est
      // transmise à part), limités aux 8 derniers pour rester léger.
      const r = await window.vt.assistant(text, chatHistory.slice(0, -1).slice(-8));
      if (r && r.ok) reply = r.reply;
      else { reply = (r && r.error) || "Réponse indisponible."; failed = true; }
    } catch (_) {
      reply = "Pas de connexion — vérifiez votre réseau.";
      failed = true;
    }

    typing.remove();
    addMsg(reply, failed ? "bot err" : "bot");
    if (!failed) chatHistory.push({ role: "assistant", text: reply });

    chatBusy = false;
    $("chatSend").disabled = false;
    input.focus();
  });

  // ── Démarrage : session déjà ouverte ? ──
  (async function init() {
    try {
      const s = await window.vt.session();
      if (s.loggedIn) enterLibrary(s.email);
      else show("login");
    } catch (_) {
      show("login");
    }
  })();
})();
