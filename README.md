# VideoTuto — Application de bureau (Windows)

Client de bureau sécurisé pour VideoTuto, façon Netflix. Il se connecte au
**même backend et aux mêmes comptes** que l'application Android
(`https://video-backend-sj8q.onrender.com`).

## Sécurité intégrée

- **Anti-capture d'écran** : la fenêtre est exclue des captures et
  enregistrements d'écran de l'OS (`setContentProtection` — l'équivalent PC du
  `FLAG_SECURE` Android). Une capture donne un rectangle noir.
- **Téléchargements chiffrés** : chaque vidéo est chiffrée en AES‑256, la clé
  étant scellée par le magasin de secrets de Windows (DPAPI via `safeStorage`).
  Copier le fichier sur un autre PC ne permet **pas** de le lire.
- **Lecture hors‑ligne sans clair sur disque** : le déchiffrement se fait à la
  volée, tranche par tranche, via un protocole interne `vtmedia://` (jamais de
  fichier en clair, jamais de serveur local exposé).
- **Fenêtre verrouillée** : renderer isolé (pas d'accès Node), outils de
  développement/F12/menu/clic‑droit désactivés, navigation externe bloquée.
- **Liens signés 10 min** pour le streaming, **liaison à l'appareil**
  (`X‑Device‑Id`) et **signature d'app** (appsig) prête à activer.

> Limite honnête (comme pour toute protection logicielle, y compris Netflix sans
> puce matérielle) : un attaquant déterminé sur SON propre PC peut capturer le
> flux décodé. Cette app bloque 100 % des accès navigateur/script/partage grand
> public et la capture d'écran classique — le vrai risque ici.

## Lancer en développement

```bash
cd videotuto-desktop
npm install
npm start
```

### Si « electron.exe » est introuvable au démarrage

Certaines configurations npm bloquent les scripts post‑installation (sécurité).
Le binaire Electron n'est alors pas téléchargé automatiquement. Récupérez‑le :

```bash
node node_modules/electron/install.js
```

S'il annonce « Cache hit » sans rien extraire, le zip en cache est présent mais
non déployé : extrayez‑le à la main dans `node_modules/electron/dist` (sous
Windows : `Expand-Archive`), puis relancez `npm start`.

## Construire l'installateur Windows (.exe)

```bash
npm run dist
```

L'installateur `nsis` est produit dans `release/`. Fournissez une icône
`build/icon.ico` (256×256) avant de construire, sinon une icône par défaut est
utilisée.

## Connexion Google (comptes créés via « Continuer avec Google »)

Le logiciel propose un bouton « Continuer avec Google » qui ouvre la page Google
dans le **navigateur système** (Google interdit sa page dans une fenêtre
intégrée), avec PKCE et redirection sur une boucle locale `127.0.0.1`. Le bouton
n'apparaît que si l'OAuth est configuré (`google-config.json`).

Configuration unique (Google Cloud Console → APIs & Services → Credentials) :
1. **Create Credentials → OAuth client ID → Application type : « Desktop app »**.
2. Copiez le **Client ID** (et le Client secret) obtenus.
3. Collez-les dans `google-config.json` (`clientId`, `clientSecret`) — pour un
   client Desktop, ces valeurs ne sont pas confidentielles (Google les fait
   embarquer dans l'app). Puis reconstruisez : `npm run dist`.
4. Sur le backend (Render → Environment), **ajoutez ce Client ID** à la variable
   `GOOGLE_CLIENT_ID` (liste séparée par des virgules) — c'est ce qui autorise
   le backend à accepter le jeton du logiciel. Aucun autre changement backend.

Rien à pré-enregistrer comme URL de redirection : les clients « Desktop »
autorisent nativement les redirections loopback `http://127.0.0.1:<port>`.

## Notes

- **1 compte = 1 appareil** : le backend n'autorise qu'un appareil par compte.
  Si le compte est déjà lié au téléphone, la connexion sur le PC est refusée
  (message explicite) ; utilisez « Changer d'appareil » dans l'admin pour
  transférer la liaison. (On peut assouplir cette règle côté serveur pour
  autoriser téléphone + PC simultanément — au choix.)
- Variables d'environnement optionnelles : `VT_BACKEND` (autre URL de backend),
  `VT_APP_SIGNING_SECRET` (active la signature d'app quand le serveur passe en
  `APP_SIG_MODE=enforce`).
