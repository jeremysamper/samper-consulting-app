// Point d'entrée de la démo (/demo). Ordre imposé :
// 1. isoler le stockage de la page (rien n'est écrit pour la vraie app) ;
// 2. installer le Supabase simulé (fetch, WebSocket, session) ;
// 3. seulement ensuite, charger la vraie application.
// Les imports statiques ci-dessous ne tirent aucun module de l'app qui créerait
// le client Supabase : il est créé au chargement de lancement.jsx.
import { installerIsolation } from './isolation.js';
import { installerFauxSupabase, sessionDemo, choisirRole, DEMO_URL } from './fauxSupabase.js';
import { ROLES_DEMO } from './donnees/base.js';
import { writeLegacyGlobal } from '../legacy/legacyApi.js';

installerIsolation();

// ?role= (lien du site) et ?theme= (thème du site qui intègre la démo).
const params = new URLSearchParams(window.location.search);
const roleDemande = params.get('role');
if (roleDemande && ROLES_DEMO.some((r) => r.role === roleDemande)) choisirRole(roleDemande);
const theme = params.get('theme');
if (theme === 'dark' || theme === 'light') window.localStorage.setItem('sc_theme', theme);

// ?maisons=2 (lot 02 du panel) : une seconde maison fictive, pour la reprise
// des réglages d'un autre établissement. Sans lui, la démo ne change pas.
installerFauxSupabase(params.get('maisons') === '2' ? { maisons: 2 } : {});
writeLegacyGlobal('SAMPER_DEMO_SUPABASE', { url: DEMO_URL, anonKey: 'demo-cle-publique' });

// Session de la personne du rôle choisi, dans le stockage isolé de la démo.
window.localStorage.setItem('samper-auth', JSON.stringify(sessionDemo()));

import('./lancement.jsx');
