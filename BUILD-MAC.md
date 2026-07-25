# Construire VideoTuto pour macOS — **gratuitement, sans Mac**

Tu n'as ni Mac ni compte Apple Developer (99 $/an). C'est **suffisant** pour
livrer l'app **de bureau** aux utilisateurs **Mac** : on la compile sur un
**runner macOS GitHub Actions**, qui est **gratuit**.

> ⚠️ Ça ne concerne **que les Mac**. Les **iPhone** restent hors de portée sans
> compte Apple payant — c'est une règle d'Apple, pas un réglage.

L'app produite n'est **pas signée** (pas de compte Apple) : elle s'installe très
bien, mais macOS affiche un avertissement au 1er lancement. Étapes ci-dessous.

---

## Étape 1 — Mettre le dossier sur un dépôt GitHub **privé** (gratuit)

Dans `videotuto-desktop/` :

```bash
git init
git add .
git commit -m "VideoTuto desktop"
```

Puis crée un dépôt **privé** sur https://github.com/new (garde-le **privé** :
ça protège ton code source ; le build marche aussi bien en privé), et pousse :

```bash
git remote add origin https://github.com/<ton-compte>/videotuto-desktop.git
git branch -M main
git push -u origin main
```

> Le fichier `google-config.json` est inclus : le build en a besoin, et pour un
> client OAuth « Desktop » ces identifiants ne sont pas confidentiels. Dépôt
> **privé** quand même, par principe.

## Étape 2 — Lancer la compilation macOS (gratuite)

1. Sur GitHub, onglet **Actions**.
2. Workflow **« Build macOS (VideoTuto) »** → bouton **Run workflow** → **Run**.
3. Attends ~5–10 min (barre verte).
4. Ouvre l'exécution → section **Artifacts** → télécharge **`VideoTuto-macOS`**.
   Il contient les `.dmg` (Intel + Apple Silicon) et les `.zip`.

> Astuce : pousser un **tag** (`git tag v1.0.3 && git push origin v1.0.3`)
> déclenche aussi le build automatiquement.

## Étape 3 — Ce que l'utilisateur Mac fait pour installer

Comme l'app n'est pas notarisée, macOS la met en quarantaine. Deux façons :

- **Simple** : ouvrir le `.dmg`, glisser **VideoTuto** dans *Applications*, puis
  **clic droit sur l'app → Ouvrir → Ouvrir** (au lieu d'un double-clic). À faire
  **une seule fois** ; ensuite elle s'ouvre normalement.
- **Si « app endommagée / ne peut pas être ouverte »** (quarantaine stricte),
  l'utilisateur lance une fois dans le Terminal :
  ```bash
  xattr -cr /Applications/VideoTuto.app
  ```

Choisir le bon `.dmg` : **Apple Silicon** (M1/M2/M3/M4) → `-arm64.dmg` ;
**Intel** → celui sans `arm64`. (Le arm64 marche aussi sur Intel via Rosetta si
besoin.)

---

## Alternative : si tu as accès à **n'importe quel Mac**

Pas besoin de GitHub. Sur le Mac, dans le dossier du projet :

```bash
npm ci
npm run dist:mac
```

Les `.dmg` / `.zip` apparaissent dans `release/`.

## Aller plus loin (optionnel)

- **Icône personnalisée** : dépose `build/icon.icns` (1024×1024) — sinon l'icône
  Electron par défaut est utilisée.
- **Supprimer l'avertissement Gatekeeper** : impossible sans compte Apple
  Developer (99 $/an) pour signer + notariser. C'est le **seul** point qui coûte.
- **Sécurité** : `setContentProtection` (anti-capture) et le coffre chiffré
  (`safeStorage` → Trousseau macOS) fonctionnent nativement sur Mac, comme sous
  Windows.
