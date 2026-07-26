// preload.js — Pont SÛR entre la page (renderer) et le processus principal.
// Le renderer n'a AUCUN accès à Node : il ne peut appeler que les fonctions
// exposées ci-dessous, qui délèguent au main via IPC. C'est l'isolation.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vt", {
  // Session / authentification
  session: () => ipcRenderer.invoke("vt:session"),
  login: (email, password) => ipcRenderer.invoke("vt:login", { email, password }),
  loginGoogle: () => ipcRenderer.invoke("vt:login-google"),
  googleAvailable: () => ipcRenderer.invoke("vt:google-available"),
  logout: () => ipcRenderer.invoke("vt:logout"),

  // Bibliothèque
  listVideos: () => ipcRenderer.invoke("vt:list-videos"),

  // Lecture : renvoie { type:'stream'|'offline', src } — src va dans <video>.
  playSource: (videoKey) => ipcRenderer.invoke("vt:play-source", videoKey),

  // Images (vue sécurisée)
  listImages: () => ipcRenderer.invoke("vt:list-images"),
  imageSource: (imageKey) => ipcRenderer.invoke("vt:image-source", imageKey),

  // Assistant « Ask Mora Abonner » (chat)
  assistant: (message, history) =>
    ipcRenderer.invoke("vt:assistant", { message, history }),

  // Dossiers
  listFolders: () => ipcRenderer.invoke("vt:list-folders"),
  folderContent: (folderId) => ipcRenderer.invoke("vt:folder-content", folderId),

  // Téléchargements chiffrés hors-ligne
  downloadStates: () => ipcRenderer.invoke("vt:download-states"),
  download: (item) => ipcRenderer.invoke("vt:download", item),
  cancelDownload: (videoKey) => ipcRenderer.invoke("vt:cancel-download", videoKey),
  deleteDownload: (videoKey) => ipcRenderer.invoke("vt:delete-download", videoKey),

  // Mise à jour du logiciel (vérification manuelle)
  checkUpdate: () => ipcRenderer.invoke("vt:check-update"),

  // Progression des téléchargements (abonnement)
  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("vt:download-progress", handler);
    return () => ipcRenderer.removeListener("vt:download-progress", handler);
  },
});
