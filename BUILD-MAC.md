# Publier VideoTuto pour macOS — **gratuitement, sans Mac**

Tu n'as ni Mac ni compte Apple Developer (99 $/an). C'est **suffisant** pour
livrer l'app **de bureau** aux utilisateurs **Mac** : GitHub compile le `.dmg`
sur un **runner macOS gratuit**, puis publie une **Release** que la page de
téléchargement branche automatiquement.

> ⚠️ Ça ne concerne **que les Mac**. Les **iPhone** restent hors de portée sans
> compte Apple payant — règle d'Apple, pas un réglage.
>
> L'app n'est **pas signée** (pas de compte Apple) : elle s'installe très bien,
> mais macOS affiche un avertissement au 1er lancement (voir Étape 4).

Le dépôt distant est **déjà configuré** sur `Maminirina780/videotuto-desktop`.

---

## Étape 1 — Créer le dépôt privé sur GitHub

Crée un dépôt **privé** nommé exactement **`videotuto-desktop`** sur
https://github.com/new (laisse-le vide, sans README). Garde-le **privé** : ça
protège ton code ; le build et les Releases marchent aussi bien en privé.

## Étape 2 — Pousser le code (remote déjà en place)

Dans `videotuto-desktop/` :

```bash
git push -u origin main
```

## Étape 3 — Publier une version macOS (build + Release automatiques)

Il suffit de créer un **tag** `v…` : GitHub compile et publie la Release seul.

```bash
git tag v1.0.2
git push origin v1.0.2
```

- Onglet **Actions** → le workflow **« Build & Release macOS »** tourne (~8 min).
- Il crée une **Release** avec `VideoTuto-mac-arm64.dmg` et `VideoTuto-mac-x64.dmg`.
- **La page de téléchargement active alors toute seule les boutons macOS**
  (elle interroge l'API GitHub — aucune modification à faire). Pour une nouvelle
  version : incrémente le tag (`v1.0.3`, …) et repousse.

> Test sans publier : Actions → « Build & Release macOS » → **Run workflow**.
> Ça compile et dépose les `.dmg` en **Artifacts** de l'exécution, sans Release.

## Étape 4 — Ce que l'utilisateur Mac fait pour installer

L'app n'étant pas notarisée, macOS la met en quarantaine :

- **Simple** : ouvrir le `.dmg`, glisser **VideoTuto** dans *Applications*, puis
  **clic droit sur l'app → Ouvrir → Ouvrir** (au lieu d'un double-clic). Une seule
  fois ; ensuite elle s'ouvre normalement.
- **Si « app endommagée »** (quarantaine stricte) :
  ```bash
  xattr -cr /Applications/VideoTuto.app
  ```

Apple Silicon (M1/M2/M3/M4) → le `.dmg` **arm64** ; Intel → le `.dmg` **x64**.

---

## Alternative : si tu as accès à **n'importe quel Mac**

```bash
npm ci
npm run dist:mac
```

Les `.dmg` / `.zip` apparaissent dans `release/`.

## Aller plus loin (optionnel)

- **Icône personnalisée** : dépose `build/icon.icns` (1024×1024) — sinon l'icône
  Electron par défaut est utilisée.
- **Supprimer l'avertissement Gatekeeper** : impossible sans compte Apple
  Developer (99 $/an) pour signer + notariser. Seul point qui coûterait.
- **Sécurité** : `setContentProtection` (anti-capture) et le coffre chiffré
  (`safeStorage` → Trousseau macOS) fonctionnent nativement sur Mac.
