/*
 * Widget de réservation d'une table (module Prévisions, Samper Consulting).
 * Même fonctionnement que widget-spa.js, pour la page /table/<adresse>.
 *
 * À coller sur le site du restaurant :
 *   <script src="https://jouanet.com/widget-table.js" data-table="mon-restaurant" async></script>
 *
 * Attributs :
 *   data-table     adresse de réservation du restaurant (obligatoire)
 *   data-mode      "bouton" (défaut) : bouton qui ouvre la réservation par-dessus le site
 *                  "integre" : réservation affichée directement dans la page
 *   data-cible     sélecteur CSS de l'endroit où placer le bouton ou la réservation
 *                  (défaut : juste après ce script)
 *   data-texte     texte du bouton (défaut : « Réserver une table »)
 *   data-couleur   couleur du bouton et de la réservation, ex. #8a6d3b
 *   data-bouton    "non" : pas de bouton ajouté ; seuls les éléments du site
 *                  ouvrent la réservation (voir plus bas)
 *
 * Dans tous les cas, ouvrent la réservation par-dessus le site : les liens du
 * site vers https://jouanet.com/table/<adresse> (ou l'ancienne adresse
 * samperconsulting-app.com) et les éléments portant l'attribut data-table-reserver.
 *
 * Aucune donnée n'est lue sur le site hôte. La réservation vit dans une iframe
 * servie par l'app ; seuls sa hauteur et deux événements
 * (fermer, réservation envoyée) remontent par postMessage.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var origine = new URL(script.src).origin;
  // L'app répond sous deux noms : jouanet.com, et samperconsulting-app.com qui y
  // renvoie. Une page chargée sous l'un peut donc parler depuis l'autre.
  var ORIGINES_APP = ['https://jouanet.com', 'https://www.jouanet.com', 'https://samperconsulting-app.com', 'https://www.samperconsulting-app.com'];
  var admises = ORIGINES_APP.indexOf(origine) >= 0 ? ORIGINES_APP : [origine];
  function origineAdmise(o) { return admises.indexOf(o) >= 0; }
  var slug = (script.getAttribute('data-table') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) { console.warn('[widget-table] attribut data-table manquant'); return; }

  var mode = script.getAttribute('data-mode') === 'integre' ? 'integre' : 'bouton';
  var texte = script.getAttribute('data-texte') || 'Réserver une table';
  var couleur = (script.getAttribute('data-couleur') || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(couleur)) couleur = '';
  var fond = couleur ? '#' + couleur : '#003042';

  function urlPage(m) {
    return origine + '/table/' + encodeURIComponent(slug) + '?mode=' + m + (couleur ? '&accent=' + couleur : '');
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
      if (!origineAdmise(e.origin) || e.source !== cadre.contentWindow || !e.data || e.data.source !== 'table-reservation') return;
      if (e.data.type === 'hauteur' && e.data.valeur > 200) cadre.style.height = Math.min(e.data.valeur + 8, 4000) + 'px';
    });
    return;
  }

  // ── Bouton + fenêtre par-dessus le site ──
  var voile = null;
  var dernierFocus = null;
  // Entrée et sortie de la fenêtre : un fondu court, la boîte qui monte un
  // peu. Rien quand le système demande moins d'animations.
  var calme = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var douceur = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
  function animer(el, images, duree) {
    if (calme || !el.animate) return null;
    try { return el.animate(images, { duration: duree, easing: douceur, fill: 'both' }); } catch (err) { return null; }
  }

  function fermer() {
    if (!voile) return;
    var v = voile;
    voile = null;
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', surTouche, true);
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
    var retirer = function () { if (v.parentNode) v.parentNode.removeChild(v); };
    var a = animer(v, [{ opacity: 1 }, { opacity: 0 }], 180);
    animer(v.firstChild, [{ transform: 'none' }, { transform: 'translateY(12px) scale(0.985)' }], 180);
    if (a) { a.onfinish = retirer; setTimeout(retirer, 400); } else retirer();
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
    voile.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(9,30,40,0.5);'
      + 'display:flex;align-items:center;justify-content:center;padding:16px;';
    var boite = document.createElement('div');
    var petit = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    boite.style.cssText = 'position:relative;width:100%;max-width:640px;height:' + (petit ? '100%' : 'min(820px, calc(100vh - 32px))')
      + ';border-radius:' + (petit ? '0' : '24px') + ';overflow:hidden;background:#e8ebee;box-shadow:0 24px 64px rgba(9,30,40,0.18);';
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
    animer(voile, [{ opacity: 0 }, { opacity: 1 }], 220);
    animer(boite, [{ transform: petit ? 'translateY(24px)' : 'translateY(16px) scale(0.985)', opacity: 0 }, { transform: 'none', opacity: 1 }], 340);
    cadre.focus();

    window.addEventListener('message', function ecoute(ev) {
      if (!voile) { window.removeEventListener('message', ecoute); return; }
      if (!origineAdmise(ev.origin) || ev.source !== cadre.contentWindow || !ev.data || ev.data.source !== 'table-reservation') return;
      if (ev.data.type === 'fermer') fermer();
    });
  }

  // Éléments du site qui ouvrent la réservation : ceux qui portent
  // data-table-reserver, et les liens vers la page de réservation du restaurant
  // (le bouton « Réserver » du site n'a qu'à pointer vers le lien direct).
  // Ctrl/Cmd + clic garde l'ouverture dans un nouvel onglet.
  var cheminTable = new RegExp('^/table/' + slug + '/?$');
  function versCeRestaurant(lien) {
    try {
      var u = new URL(lien.href, window.location.href);
      return origineAdmise(u.origin) && cheminTable.test(u.pathname);
    } catch (err) { return false; }
  }
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target.closest('[data-table-reserver]');
    if (!el) {
      var lien = e.target.closest('a[href]');
      if (lien && versCeRestaurant(lien)) el = lien;
    }
    if (el) ouvrir(e);
  });

  if (script.getAttribute('data-bouton') === 'non') return;
  var place2 = cible();
  var bouton = document.createElement('button');
  bouton.type = 'button';
  bouton.textContent = texte;
  bouton.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 26px;'
    + 'border:0;border-radius:999px;cursor:pointer;font:500 16px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;'
    + 'background:' + fond + ';color:' + texteClair(fond) + ';transition:opacity .18s ease,transform .14s ease;';
  bouton.addEventListener('mouseenter', function () { bouton.style.opacity = '0.9'; });
  bouton.addEventListener('mouseleave', function () { bouton.style.opacity = ''; bouton.style.transform = ''; });
  bouton.addEventListener('pointerdown', function () { if (!calme) bouton.style.transform = 'scale(0.97)'; });
  bouton.addEventListener('pointerup', function () { bouton.style.transform = ''; });
  bouton.addEventListener('click', ouvrir);
  place2.parent.insertBefore(bouton, place2.avant);
})();
