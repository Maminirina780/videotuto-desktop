// main.js — Processus principal Electron de VideoTuto (bureau).
// Fenêtre verrouillée + protection anti-capture d'écran (façon Netflix) :
//   • setContentProtection(true) : la fenêtre est EXCLUE des captures et
//     enregistrements d'écran de l'OS (équivalent PC du FLAG_SECURE Android).
//   • renderer isolé (contextIsolation, sandbox, pas de nodeIntegration) : la
//     page ne peut PAS toucher au système, seulement l'API sûre du preload.
//   • devtools / F12 / menu / navigation externe : bloqués.
//   • protocole privilégié vtmedia:// : lecture hors-ligne déchiffrée à la
//     volée, le fichier en clair n'existe jamais sur le disque.

const { app, BrowserWindow, Menu, shell, ipcMain, protocol } = require("electron");
const path = require("path");

const backend = require("./src/backend");
const store = require("./src/secureStore");
const media = require("./src/mediaProtocol");
const updater = require("./src/updater");

const SMOKE = process.env.VT_SMOKE === "1"; // démarrage de test : quitte après ready

// Le protocole vtmedia doit être déclaré privilégié AVANT app.ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "vtmedia",
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true },
  },
]);

// Une seule instance de l'app (évite deux fenêtres et les conflits de coffre).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: "#000000",
      show: false,
      autoHideMenuBar: true,
      title: "VideoTuto",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true, // le renderer ne partage rien avec Node
        nodeIntegration: false, // pas d'accès Node depuis la page
        sandbox: true, // bac à sable renderer
        webSecurity: true,
        devTools: false, // pas d'outils de dev en production
        spellcheck: false,
      },
    });

    // ── Protection anti-capture d'écran (le cœur « façon Netflix ») ──
    // La fenêtre devient invisible aux captures/enregistrements de l'OS.
    mainWindow.setContentProtection(true);

    // Aucune barre de menu.
    Menu.setApplicationMenu(null);

    // Bloque l'ouverture de nouvelles fenêtres et la navigation hors de l'app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // Un lien « http(s) » légitime s'ouvre dans le navigateur système, jamais
      // dans l'app (qui reste cloisonnée sur ses propres pages).
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (e, url) => {
      const current = mainWindow.webContents.getURL();
      if (url !== current) e.preventDefault();
    });

    // Referme les devtools si jamais quelque chose tente de les ouvrir.
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
    // Neutralise les raccourcis d'inspection (F12, Ctrl/Cmd+Shift+I/J/C, Ctrl+U).
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = (input.key || "").toLowerCase();
      const mod = input.control || input.meta;
      if (
        key === "f12" ||
        (mod && input.shift && ["i", "j", "c"].includes(key)) ||
        (mod && key === "u")
      ) {
        event.preventDefault();
      }
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
      if (SMOKE) {
        // Démarrage de test réussi : on confirme et on quitte proprement.
        console.log("SMOKE OK — fenêtre créée, protection active");
        setTimeout(() => app.quit(), 300);
        return;
      }
      // Vérifie les mises à jour au démarrage (comme l'app Android). Une MAJ
      // obligatoire télécharge/installe et ferme le logiciel ; une facultative
      // laisse le choix. Silencieux s'il n'y a rien de neuf.
      updater.checkForUpdates(mainWindow, { silent: true }).catch(() => {});
    });

    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  }

  app.whenReady().then(() => {
    // Enregistre le protocole de lecture chiffrée hors-ligne.
    media.register();
    // Enregistre les canaux IPC (login, liste, lecture, téléchargements…).
    registerIpc();

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  // ── Canaux IPC : le renderer ne peut faire QUE ces actions précises ──
  function registerIpc() {
    const send = (channel, payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
      }
    };

    ipcMain.handle("vt:session", () => backend.session());
    ipcMain.handle("vt:login", (_e, { email, password }) => backend.login(email, password));
    ipcMain.handle("vt:login-google", () => backend.loginWithGoogle());
    ipcMain.handle("vt:google-available", () => backend.googleAvailable());
    ipcMain.handle("vt:logout", () => backend.logout());
    ipcMain.handle("vt:list-videos", () => backend.listVideos());
    ipcMain.handle("vt:play-source", (_e, videoKey) => backend.playSource(videoKey));
    ipcMain.handle("vt:list-images", () => backend.listImages());
    ipcMain.handle("vt:image-source", (_e, imageKey) => backend.imageSource(imageKey));
    ipcMain.handle("vt:assistant", (_e, { message, history }) =>
      backend.askAssistant(message, history)
    );
    ipcMain.handle("vt:list-folders", () => backend.listFolders());
    ipcMain.handle("vt:folder-content", (_e, folderId) => backend.folderContent(folderId));
    ipcMain.handle("vt:download-states", () => store.states());
    ipcMain.handle("vt:delete-download", (_e, videoKey) => store.remove(videoKey));
    ipcMain.handle("vt:download", async (_e, item) => {
      return backend.download(item, (pct) =>
        send("vt:download-progress", { videoKey: item.videoKey, percent: pct })
      );
    });
    ipcMain.handle("vt:cancel-download", (_e, videoKey) => backend.cancelDownload(videoKey));
    ipcMain.handle("vt:check-update", () => updater.checkForUpdates(mainWindow, { silent: false }));
  }
}
