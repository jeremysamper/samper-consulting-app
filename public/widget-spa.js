/*
 * Widget de réservation d'un spa (module Spa, Samper Consulting).
 *
 * À coller sur le site du spa :
 *   <script src="https://samperconsulting-app.com/widget-spa.js" data-spa="mizukii" async></script>
 *
 * Attributs :
 *   data-spa       adresse de réservation du spa (obligatoire)
 *   data-mode      "bouton" (défaut) : bouton qui ouvre la réservation par-dessus le site
 *                  "integre" : réservation affichée directement dans la page
 *   data-cible     sélecteur CSS de l'endroit où placer le bouton ou la réservation
 *                  (défaut : juste après ce script)
 *   data-texte     texte du bouton (défaut : « Réserver un soin »)
 *   data-couleur   couleur du bouton et de la réservation, ex. #8a6d3b
 *   data-bouton    "non" : pas de bouton, seulement les éléments du site portant
 *                  l'attribut data-spa-reserver (un lien de menu, par exemple)
 *
 * Aucune donnée n'est lue sur le site hôte. La réservation vit dans une iframe
 * servie par samperconsulting-app.com ; seuls sa hauteur et deux événements
 * (fermer, demande envoyée) remontent par postMessage.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var origine = new URL(script.src).origin;
  var slug = (script.getAttribute('data-spa') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) { console.warn('[widget-spa] attribut data-spa manquant'); return; }

  var mode = script.getAttribute('data-mode') === 'integre' ? 'integre' : 'bouton';
  var texte = script.getAttribute('data-texte') || 'Réserver un soin';
  var couleur = (script.getAttribute('data-couleur') || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(couleur)) couleur = '';
  var fond = couleur ? '#' + couleur : '#2f6f77';

  function urlPage(m) {
    return origine + '/reserver/' + encodeURIComponent(slug) + '?mode=' + m + (couleur ? '&accent=' + couleur : '');
  }

  function cible() {
    var sel = script.getAttribute('data-cible');
    var el = sel ? document.querySelector(sel) : null;
    if (el) return { parent: el, avant: null };
    return { parent: script.parentNode, avant: script.nextSibling };
  }

  function texteClair(hex) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#1d2422' : '#ffffff';
  }

  // ── Réservation intégrée dans la page ──
  if (mode === 'integre') {
    var place = cible();
    var cadre = document.createElement('iframe');
    cadre.src = urlPage('integre');
    cadre.title = 'Réservation en ligne';
    cadre.loading = 'lazy';
    cadre.setAttribute('allow', 'clipboard-write');
    cadre.style.cssText = 'display:block;width:100%;max-width:680px;margin:0 auto;border:0;height:720px;background:transparent;color-scheme:light;';
    place.parent.insertBefore(cadre, place.avant);
    window.addEventListener('message', function (e) {
      if (e.origin !== origine || e.source !== cadre.contentWindow || !e.data || e.data.source !== 'spa-reservation') return;
      if (e.data.type === 'hauteur' && e.data.valeur > 200) cadre.style.height = Math.min(e.data.valeur + 8, 4000) + 'px';
    });
    return;
  }

  // ── Bouton + fenêtre par-dessus le site ──
  var voile = null;
  var dernierFocus = null;

  function fermer() {
    if (!voile) return;
    voile.parentNode.removeChild(voile);
    voile = null;
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', surTouche, true);
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }

  function surTouche(e) {
    if (e.key === 'Escape') { e.preventDefault(); fermer(); }
  }

  function ouvrir(e) {
    if (e) e.preventDefault();
    if (voile) return;
    dernierFocus = document.activeElement;
    voile = document.createElement('div');
    voile.setAttribute('role', 'dialog');
    voile.setAttribute('aria-modal', 'true');
    voile.setAttribute('aria-label', texte);
    voile.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,26,25,0.55);'
      + 'display:flex;align-items:center;justify-content:center;padding:16px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);';
    var boite = document.createElement('div');
    var petit = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    boite.style.cssText = 'position:relative;width:100%;max-width:640px;height:' + (petit ? '100%' : 'min(820px, calc(100vh - 32px))')
      + ';border-radius:' + (petit ? '0' : '22px') + ';overflow:hidden;background:#f4f1eb;box-shadow:0 24px 70px rgba(0,0,0,0.35);';
    if (petit) voile.style.padding = '0';
    var cadre = document.createElement('iframe');
    cadre.src = urlPage('modal');
    cadre.title = texte;
    cadre.style.cssText = 'display:block;width:100%;height:100%;border:0;color-scheme:light;';
    boite.appendChild(cadre);
    voile.appendChild(boite);
    voile.addEventListener('click', function (ev) { if (ev.target === voile) fermer(); });
    document.body.appendChild(voile);
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', surTouche, true);
    cadre.focus();

    window.addEventListener('message', function ecoute(ev) {
      if (!voile) { window.removeEventListener('message', ecoute); return; }
      if (ev.origin !== origine || ev.source !== cadre.contentWindow || !ev.data || ev.data.source !== 'spa-reservation') return;
      if (ev.data.type === 'fermer') fermer();
    });
  }

  // Éléments du site qui ouvrent la réservation (lien de menu, image…).
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-spa-reserver]') : null;
    if (el) ouvrir(e);
  });

  if (script.getAttribute('data-bouton') === 'non') return;
  var place2 = cible();
  var bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.textContent = texte;
  bouton.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 26px;'
    + 'border:0;border-radius:999px;cursor:pointer;font:600 16px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:0.01em;'
    + 'background:' + fond + ';color:' + texteClair(fond) + ';box-shadow:0 6px 18px rgba(0,0,0,0.15);transition:filter .2s ease;';
  bouton.addEventListener('mouseenter', function () { bouton.style.filter = 'brightness(1.08)'; });
  bouton.addEventListener('mouseleave', function () { bouton.style.filter = ''; });
  bouton.addEventListener('click', ouvrir);
  place2.parent.insertBefore(bouton, place2.avant);
})();
