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
      appInfo: async () => ({ version: "1.1.2", email: "demo@gmail.com" }),
      abonner: async () => ({ ok: true, abonner: { nom: "Mora Abonner", slogan: "Services numériques à Madagascar", description: "Mora Abonner t'aide à commander en Chine, à apprendre avec des tutoriels vidéo en malgache et à réussir tes études.", facebook: "https://www.facebook.com/MoraAbonner", instagram: "", whatsapp: "261337247942", telephone: "+261337247942", email: "maminirinaprincy67@gmail.com", site: "https://mora-abonner-pages.pages.dev/", adresse: "Ivato, Antananarivo, Madagascar", horaires: "Réponse sur WhatsApp tous les jours" } }),
      openExternal: async () => ({ ok: true }),
      onDownloadProgress: () => () => {},
      listImages: async () => ({ ok: true, images: [
        { imageKey: "images/1784000000000-schema-reseau.png", title: "Schema reseau", expiresAt: null },
        { imageKey: "images/1784000000001-photo-4k.jpg", title: "Photo 4k", expiresAt: Date.now() + 3 * 3600 * 1000 },
      ] }),
      imageSource: async () => ({ ok: true, src: "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='250'><rect width='400' height='250' fill='#0A84FF'/><text x='200' y='130' fill='#fff' font-size='22' text-anchor='middle'>Aperçu</text></svg>") }),
      assistant: async () => ({
        ok: true,
        reply:
          "Vous avez **4 vidéos** accessibles, dont **1 qui expire bientôt**.\n\n" +
          "| Vidéo | État | Temps restant |\n|---|---|---|\n" +
          "| Html1 | 🟢 Permanent | — |\n" +
          "| Css bases | 🟡 En cours | 1 j 22 h |\n" +
          "| Terminal | 🔴 Expire bientôt | 45 min |\n" +
          "| Accès minuté | 🔵 Démarre à la lecture | 5 min accordées |\n\n" +
          "## Ce qu'il faut retenir\n" +
          "- **Terminal** expire dans moins d'une heure : regardez-la en priorité.\n" +
          "- **Accès minuté** n'a pas encore démarré ; son compte à rebours de 5 minutes " +
          "ne commencera qu'au premier lancement de la lecture.\n" +
          "- **Html1** reste disponible sans limite de temps.\n\n" +
          "### Conseil\n" +
          "Téléchargez les vidéos qui vous intéressent pour les consulter hors connexion : " +
          "elles restent chiffrées sur votre appareil et demeurent lisibles jusqu'à " +
          "l'expiration de votre accès. Vous gagnerez du temps sur un réseau lent, et la " +
          "lecture démarrera instantanément même sans connexion.\n\n" +
          "Pensez à regarder *Terminal* en priorité.",
        actions: [
          { type: "play", label: "Lire « Terminal »", key: "videos/1783932133430-terminal.mp4", title: "Terminal" },
          { type: "download_all", label: "Télécharger toutes mes vidéos", key: "", title: "" },
          { type: "open_images", label: "Voir mes images", key: "", title: "" },
        ],
        videos: [
          { title: "Css bases", status: "active", remainingMs: 165600000, remainingLabel: "1 j 22 h" },
          { title: "Terminal", status: "expiring", remainingMs: 2700000, remainingLabel: "45 min" },
        ],
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

  // les 3 derniers jours d'accès : compteurs en rouge (le serveur notifie aussi 3 j, 1 j et la fin)
  const ALERTE_MS = 3 * 24 * 3600 * 1000;
  const rouge = (ms) => ms && ms - Date.now() <= ALERTE_MS ? " rouge" : "";
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
    if (v.expiresAt) return '<span class="chip-exp' + rouge(v.expiresAt) + '">' + esc(expiryLabel(v.expiresAt)) + "</span>";
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
      el.classList.toggle("danger", rem <= ALERTE_MS); // rouge pendant les 3 derniers jours
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


  // ── À propos de Mora Abonner ──
  // Fiche commune aux apps Mora (réglée dans Mora Admin) : cache immédiat, puis réseau.
  const AB_ICO = {"facebook":"<path d=\"M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z\"/>","instagram":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"1\"/>","whatsapp":"<path d=\"M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4L3 21z\"/><path d=\"M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1.2-1.2 2 .8v1.6c-4 .5-8.5-4-8-8h1.6l.8 2-1.1 1.2\"/>","appel":"<path d=\"M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2\"/>","mail":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"m3 7 9 6 9-6\"/>","web":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18\"/>","adresse":"<path d=\"M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z\"/><circle cx=\"12\" cy=\"9.5\" r=\"2.5\"/>","horaires":"<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>"};
  const chiffres = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 9 && d.length <= 15 ? d : null; };
  // 261337247942 → « 033 72 479 42 »
  const numeroLocal = (d) => { const l = d.startsWith("261") && d.length === 12 ? "0" + d.slice(3) : d; return l.length === 10 ? l.replace(/(\d{3})(\d{2})(\d{3})(\d{2})/, "$1 $2 $3 $4") : "+" + d; };
  const sansSchema = (u) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  const https = (u) => { try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : null; } catch (_) { return null; } };

  function ligneAb(ico, titre, valeur, lien) {
    const el = document.createElement(lien ? "button" : "div");
    el.className = "ab-ligne";
    el.innerHTML = '<span class="ab-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + AB_ICO[ico] + '</svg></span><span class="ab-txt"><b></b><span></span></span>' + (lien ? '<span class="ab-ext" aria-hidden="true">↗</span>' : "");
    el.querySelector("b").textContent = titre;
    el.querySelector(".ab-txt span").textContent = valeur;
    if (lien) {
      el.type = "button";
      el.title = lien;
      el.addEventListener("click", async () => { const r = await window.vt.openExternal(lien); if (!r || !r.ok) toast((r && r.error) || "Impossible d'ouvrir le lien.", true); });
    }
    return el;
  }

  function afficherAbonner(f) {
    $("abNom").textContent = f.nom || "Mora Abonner";
    $("abSlogan").textContent = f.slogan || "";
    $("abSlogan").hidden = !f.slogan;
    $("abDesc").textContent = f.description || "";
    $("abDesc").hidden = !f.description;
    const box = $("abListe"); box.innerHTML = "";
    const fb = https(f.facebook); if (fb) box.appendChild(ligneAb("facebook", "Facebook", sansSchema(fb), fb));
    const ig = https(f.instagram); if (ig) box.appendChild(ligneAb("instagram", "Instagram", sansSchema(ig), ig));
    const wa = chiffres(f.whatsapp); if (wa) box.appendChild(ligneAb("whatsapp", "WhatsApp", numeroLocal(wa), "https://wa.me/" + wa));
    const tel = chiffres(f.telephone); if (tel) box.appendChild(ligneAb("appel", "Appeler", numeroLocal(tel), "tel:+" + tel));
    const em = String(f.email || "").trim(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) box.appendChild(ligneAb("mail", "E-mail", em, "mailto:" + em));
    const site = https(f.site); if (site) box.appendChild(ligneAb("web", "Site web", sansSchema(site), site));
    if (f.adresse) box.appendChild(ligneAb("adresse", "Adresse", f.adresse, "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(f.adresse)));
    if (f.horaires) box.appendChild(ligneAb("horaires", "Horaires", f.horaires, null));
  }

  async function loadApropos() {
    try { const r = await window.vt.abonner(false); if (r && r.abonner) afficherAbonner(r.abonner); } catch (_) {}
    try { const i = await window.vt.appInfo(); $("abVersion").textContent = "Mora Video pour Windows · version " + i.version; } catch (_) {}
    try { const r = await window.vt.abonner(true); if (r && r.abonner) afficherAbonner(r.abonner); } catch (_) {}
  }

  // ── Onglets Vidéos / Images / Dossiers / À propos ──
  let imagesLoaded = false, foldersLoaded = false, aproposLoaded = false;

  function switchTab(name) {
    document.querySelectorAll("#tabs .tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === name));
    ["videos", "images", "folders", "apropos"].forEach((p) => { $("panel-" + p).hidden = p !== name; });
    if (name === "apropos" && !aproposLoaded) { aproposLoaded = true; loadApropos(); }
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
    // pas de vidéo hors dossier (ex. acheteur Mora Ship) : on ouvre directement les dossiers
    switchTab(hasFolders && !$("library").children.length ? "folders" : "videos");
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
      ? '<span class="chip-exp' + rouge(im.expiresAt) + '">' + esc(expiryLabel(im.expiresAt)) + "</span>"
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
      const exp = f.expiresAt ? '<span class="fexp' + rouge(f.expiresAt) + '">' + esc(expiryLabel(f.expiresAt)) + "</span>" : "";
      row.innerHTML = '<span class="fico"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span><span class="fname">' + esc(f.name) + "</span>" + exp + '<span style="color:var(--label3)">›</span>';
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
    // ordre des leçons : « base 1, base 2 … base 10 » (tri naturel sur le titre)
    (r.videos || []).slice().sort((a, b) => String(a.title || a.videoKey).localeCompare(String(b.title || b.videoKey), "fr", { numeric: true, sensitivity: "base" }))
      .forEach((v) => renderCard(v, items, reload));
    (r.images || []).forEach((im) => renderImageCard(im, items));
    // PDF (cours, fiches) et autres fichiers : ouverts dans une fenêtre protégée
    (r.files || []).forEach((fi) => {
      const c = document.createElement("div");
      c.className = "folder-row file-card";
      c.innerHTML = '<span class="fico">' + (/\.pdf$/i.test(fi.name) ? '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>' : '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>') + '</span><span class="fname">' + esc(fi.name) + "</span>" +
        '<span class="fexp">' + esc(/\.pdf$/i.test(fi.name) ? "PDF" : "Fichier") + (fi.sizeBytes ? " · " + Math.max(1, Math.round(fi.sizeBytes / 1024)) + " Ko" : "") + "</span>";
      c.addEventListener("click", async () => {
        const o = window.vt.openFile ? await window.vt.openFile(f.id, fi.name) : { ok: false, error: "Mettez à jour Mora Video." };
        if (!o.ok) toast(o.error || "Fichier indisponible.", true);
      });
      items.appendChild(c);
    });
    if (!(r.videos || []).length && !(r.images || []).length && !(r.files || []).length) {
      items.innerHTML = '<div class="empty">Ce dossier est vide.</div>';
    }
  }
  $("folderBack").addEventListener("click", () => {
    $("folderContent").hidden = true;
    $("foldersList").hidden = false;
  });

  // ── Assistant « Mora Abonner » ──
  // Le serveur répond en connaissant les vidéos et les temps d'accès de
  // l'utilisateur (français ou malgache). On garde l'historique récent pour
  // que la conversation reste cohérente.
  const chatHistory = []; // [{role:'user'|'assistant', text}]
  let chatBusy = false;

  const WELCOME =
    "Bonjour 👋 Je suis Mora Abonner, votre assistant. " +
    "Posez vos questions en français ou en malgache : « combien de vidéos ai-je ? », " +
    "« combien de temps me reste-t-il ? »…";

  // ── Rendu Markdown minimal et SÛR ──
  // L'assistant répond en Markdown (tableaux, gras, listes). On échappe
  // D'ABORD tout le HTML (le texte vient d'une IA : jamais de confiance
  // aveugle), puis on ne réintroduit que nos propres balises de mise en forme.
  function mdInline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  // Une cellule d'état (« 🔴 Expire bientôt ») devient une pastille colorée :
  // beaucoup plus lisible qu'un simple texte dans un tableau dense. Le libellé
  // reste écrit — la couleur ne porte jamais seule l'information.
  const PILLS = [
    { re: /🟢/, cls: "ok" }, { re: /🟡/, cls: "warn" }, { re: /🔴/, cls: "danger" },
    { re: /🔵/, cls: "info" }, { re: /⚫|⚪/, cls: "muted" },
  ];
  function mdCell(raw) {
    const hit = PILLS.find((p) => p.re.test(raw));
    if (hit) {
      const label = raw.replace(/[🟢🟡🔴🔵⚫⚪]\s*/g, "").trim();
      if (label) return '<span class="pill ' + hit.cls + '">' + mdInline(label) + "</span>";
    }
    return mdInline(raw);
  }

  function renderMarkdown(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    let html = "", list = null, i = 0;

    const closeList = () => { if (list) { html += "</" + list + ">"; list = null; } };
    const isTableSep = (l) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");
    const cells = (l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

    while (i < lines.length) {
      const line = lines[i];

      // Tableau : ligne d'en-tête + ligne de séparation + lignes de données
      if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        closeList();
        const head = cells(line);
        i += 2;
        let body = "";
        while (i < lines.length && lines[i].includes("|")) {
          body += "<tr>" + cells(lines[i]).map((c) => "<td>" + mdCell(c) + "</td>").join("") + "</tr>";
          i++;
        }
        html +=
          '<div class="tbl-wrap"><table class="md-tbl"><thead><tr>' +
          head.map((h) => "<th>" + mdInline(h) + "</th>").join("") +
          "</tr></thead><tbody>" + body + "</tbody></table></div>";
        continue;
      }

      // Titre
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { closeList(); html += "<h4>" + mdInline(h[2]) + "</h4>"; i++; continue; }

      // Listes (à puces ou numérotées)
      const li = line.match(/^\s*([-*•]|\d+\.)\s+(.*)$/);
      if (li) {
        const want = /\d/.test(li[1]) ? "ol" : "ul";
        if (list !== want) { closeList(); html += "<" + want + ">"; list = want; }
        html += "<li>" + mdInline(li[2]) + "</li>";
        i++; continue;
      }

      closeList();
      if (line.trim() === "") html += "";
      else html += "<p>" + mdInline(line) + "</p>";
      i++;
    }
    closeList();
    return html;
  }

  function addMsg(text, kind, asMarkdown) {
    const div = document.createElement("div");
    div.className = "msg " + kind;
    if (asMarkdown) div.innerHTML = renderMarkdown(text);
    else div.textContent = text;
    $("chatLog").appendChild(div);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
    return div;
  }

  // ── Graphique « temps restant » (SVG, construit côté app) ──
  // Barres horizontales : lisibles sur petite largeur, et chaque barre porte
  // son libellé exact (pas besoin de survol). Couleur = état, MAIS l'état est
  // aussi écrit en toutes lettres (jamais la couleur seule comme information).
  const STATUS = {
    permanent: { color: "var(--green)", label: "Permanent" },
    active: { color: "var(--accent)", label: "En cours" },
    expiring: { color: "var(--red)", label: "Expire bientôt" },
    pending: { color: "var(--orange)", label: "Démarre à la lecture" },
    expired: { color: "var(--label3)", label: "Expiré" },
  };

  function renderChart(videos) {
    const timed = (videos || []).filter((v) => v.remainingMs != null && v.remainingMs > 0);
    if (!timed.length) return null;
    const max = Math.max(...timed.map((v) => v.remainingMs));
    const rows = timed
      .map((v) => {
        const s = STATUS[v.status] || STATUS.active;
        const pct = Math.max(4, Math.round((v.remainingMs / max) * 100));
        return (
          '<div class="ch-row">' +
          '<div class="ch-name" title="' + esc(v.title) + '">' + esc(v.title) + "</div>" +
          '<div class="ch-track"><div class="ch-bar" style="width:' + pct + "%;background:" + s.color + '"></div></div>' +
          '<div class="ch-val">' + esc(v.remainingLabel || "") + "</div>" +
          "</div>"
        );
      })
      .join("");

    const box = document.createElement("div");
    box.className = "msg bot chart";
    box.innerHTML =
      '<div class="ch-title">Temps d\'accès restant</div>' + rows +
      '<div class="ch-legend">' +
      Object.values(STATUS)
        .filter((s) => timed.some((v) => (STATUS[v.status] || {}).label === s.label))
        .map((s) => '<span><i style="background:' + s.color + '"></i>' + s.label + "</span>")
        .join("") +
      "</div>";
    $("chatLog").appendChild(box);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
    return box;
  }

  // ── Actions proposées par l'assistant (boutons) ──
  // L'assistant ne déclenche JAMAIS rien lui-même : il propose selon la demande,
  // l'utilisateur décide. Les boutons apparaissent sous sa réponse. Le serveur
  // n'envoie que des actions d'un catalogue fermé, visant du contenu réel.
  const CHAT_ACTIONS = {
    download_all: {
      label: "Télécharger toutes mes vidéos", icon: "a-download",
      run: (a, btn) => downloadAll(btn),
    },
    play: {
      label: "Lire cette vidéo", icon: "a-play",
      run: (a) => { closeChat(); playVideo({ videoKey: a.key, title: a.title || a.label }); },
    },
    open_videos: {
      label: "Voir mes vidéos", icon: "a-videos",
      run: () => { closeChat(); show("library"); switchTab("videos"); },
    },
    open_images: {
      label: "Voir mes images", icon: "a-images",
      run: () => { closeChat(); show("library"); switchTab("images"); },
    },
    open_folders: {
      label: "Voir mes dossiers", icon: "a-folders",
      run: () => { closeChat(); show("library"); switchTab("folders"); },
    },
  };

  function renderActions(actions) {
    if (!actions || !actions.length) return;
    const box = document.createElement("div");
    box.className = "chat-actions";
    actions.slice(0, 3).forEach((a) => {
      const def = CHAT_ACTIONS[a.type];
      if (!def || (a.type === "play" && !a.key)) return;
      const btn = document.createElement("button");
      btn.className = "btn small " + def.icon;
      btn.textContent = a.label || def.label;
      btn.addEventListener("click", () => def.run(a, btn));
      box.appendChild(btn);
    });
    if (!box.childElementCount) return;
    $("chatLog").appendChild(box);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
  }

  /** Télécharge, une par une, les vidéos pas encore disponibles hors-ligne. */
  async function downloadAll(btn) {
    btn.disabled = true;
    const r = await window.vt.listVideos();
    const todo = ((r && r.videos) || []).filter((v) => !v.downloaded);
    if (!todo.length) {
      btn.textContent = "Tout est déjà téléchargé ✓";
      return;
    }
    let done = 0;
    for (const v of todo) {
      btn.textContent = "Téléchargement… " + (done + 1) + "/" + todo.length;
      const res = await window.vt.download(v);
      if (res && res.ok) done++;
    }
    btn.textContent = done + " vidéo" + (done > 1 ? "s" : "") + " téléchargée" + (done > 1 ? "s" : "") + " ✓";
    loadLibrary();
    toast(done + " vidéo(s) disponible(s) hors-ligne");
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

    let reply, videos = null, actions = null, failed = false;
    try {
      // On n'envoie que les échanges PRÉCÉDENTS (la question courante est
      // transmise à part), limités aux 8 derniers pour rester léger.
      const r = await window.vt.assistant(text, chatHistory.slice(0, -1).slice(-8));
      if (r && r.ok) { reply = r.reply; videos = r.videos || null; actions = r.actions || null; }
      else { reply = (r && r.error) || "Réponse indisponible."; failed = true; }
    } catch (_) {
      reply = "Pas de connexion — vérifiez votre réseau.";
      failed = true;
    }

    typing.remove();
    addMsg(reply, failed ? "bot err" : "bot", !failed); // Markdown si réponse valide
    if (!failed) {
      chatHistory.push({ role: "assistant", text: reply });
      // Graphique en complément quand la réponse parle de plusieurs vidéos.
      const many = /\|/.test(reply) || /vidéo/i.test(text);
      if (many) renderChart(videos);
      renderActions(actions);
    }

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
