# Deploiement production

## Build local

```bash
./tools-node/node-v22.22.2-win-x64/npm.cmd run build
```

Le dossier a publier est :

```txt
dist-vite/
```

En production, `dist-vite/index.html` est genere depuis `vite-index.html`.
L'ancien `index.html` du code source reste intact pour la migration locale.

## Vercel

Parametres projet recommandes :

```txt
Framework Preset : Vite
Build Command    : npm run build
Output Directory : dist-vite
Install Command  : npm install
```

`vercel.json` est deja configure pour :

- lancer `npm run build`
- publier `dist-vite`
- rediriger les routes vers `/index.html`

## Variables d'environnement

Ajouter dans l'hebergeur :

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Les valeurs de reference sont dans `.env.example`.

## Nom de domaine

Dans l'hebergeur :

1. Ajouter le domaine dans les parametres du projet.
2. Copier les DNS demandes par l'hebergeur.
3. Chez le registrar du domaine, ajouter les enregistrements DNS.

Cas courant Vercel :

```txt
www.ton-domaine.ch  CNAME  cname.vercel-dns.com
ton-domaine.ch      A      76.76.21.21
```

Les valeurs exactes affichees par ton hebergeur priment toujours.

## Supabase Auth

Dans Supabase, ajouter les URLs de production dans Authentication > URL Configuration :

```txt
Site URL:
https://ton-domaine.ch

Redirect URLs:
https://ton-domaine.ch/*
http://127.0.0.1:5173/*
```

Garder `http://127.0.0.1:5173/*` tant que tu testes localement.
