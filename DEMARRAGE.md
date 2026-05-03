# Demarrage local

## Option recommandee pour ce projet

J'ai installe Node LTS 22 en version portable dans `tools-node/`, car le Node global `v25.9.0`
faisait bloquer `npm install` sur cette machine.

Depuis Git Bash :

```bash
cd "/c/Users/jerem/Desktop/Samper-Consulting-Vite"
./tools-node/node-v22.22.2-win-x64/npm.cmd run dev
```

Puis ouvrir :

```txt
http://127.0.0.1:5173/vite-index.html
```

L'application historique reste aussi disponible :

```txt
http://127.0.0.1:5173/index.html
```

## Depuis PowerShell

```powershell
cd "C:\Users\jerem\Desktop\Samper-Consulting-Vite"
```

Installer les dependances :

```powershell
npm.cmd install
```

Lancer le serveur local :

```powershell
npm.cmd run dev
```

## Depuis Git Bash

```bash
cd "/c/Users/jerem/Desktop/Samper-Consulting-Vite"
npm.cmd install
npm.cmd run dev
```

URLs a tester :

```txt
http://127.0.0.1:5173/index.html
http://127.0.0.1:5173/vite-index.html
```

Build de controle :

```powershell
npm.cmd run build
npm.cmd run preview
```

Avec Node portable :

```bash
./tools-node/node-v22.22.2-win-x64/npm.cmd run build
./tools-node/node-v22.22.2-win-x64/npm.cmd run preview
```

Le build production genere `dist-vite/index.html` pour que le site fonctionne a la racine d'un domaine.

Notes :

- Utiliser `npm.cmd`, pas `npm`, si PowerShell bloque `npm.ps1`.
- Dans Git Bash, `npm.cmd` evite aussi les bizarreries Windows autour de `npm`.
- `.npmrc` desactive audit/fund/progress et reduit le bruit des logs npm.
- Si `npm.cmd install` tourne en boucle sans creer `node_modules`, verifie `node --version`.
  Dans ce projet, Node `v25.9.0` a fait boucler npm pendant les tests. Installe ou selectionne Node LTS 22 ou 20, puis relance `npm.cmd install`.
- Si npm affiche `EPERM` sur `AppData\Local\npm-cache`, ferme les terminaux npm ouverts puis relance Git Bash en administrateur.
- Si npm affiche des paquets `@rollup/...`, c'est normal pour Vite. Laisse-le finir quelques minutes.
- `index.html` est l'application historique.
- `vite-index.html` est la migration Vite.
- Le serveur Vite sert les anciens fichiers `components/*` en brut pour que `index.html` continue de fonctionner pendant la migration.
- Les variables Supabase peuvent etre placees dans `.env` en copiant `.env.example`.
- Voir `DEPLOIEMENT.md` pour publier `dist-vite/` sur un domaine.
