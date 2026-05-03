// ═══════════════════════════════════════════════════════════════
// CONFIGURATION SUPABASE
// ═══════════════════════════════════════════════════════════════
// Remplace ces deux valeurs par celles de TON projet Supabase.
// Tu les trouves dans : Supabase → Settings → Data API
// ═══════════════════════════════════════════════════════════════

// ⚠ NE PAS COMMITER DE VRAIES CLÉS ICI
// Ce fichier est utilisé uniquement par index.html (système legacy).
// En production Vite, les clés viennent des variables d'environnement VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
// Voir .env.example pour le format attendu.
window.SUPABASE_CONFIG = {
  url: 'https://VOTRE-PROJET.supabase.co',
  anonKey: 'votre-cle-anon-publishable-ici'
};
