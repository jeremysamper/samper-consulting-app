// Page de retour de la connexion Gmail / Outlook du spa (api/spa-oauth.ts).
// Prévient l'onglet de l'app puis ferme la fenêtre ; ouverte dans le même
// onglet que l'app (fenêtre surgissante bloquée), ramène à l'app.
(function () {
  var corps = document.body;
  var info = { source: 'spa-oauth', ok: corps.getAttribute('data-ok') === '1', message: corps.getAttribute('data-message') || '' };

  try {
    var canal = new BroadcastChannel('spa-oauth');
    canal.postMessage(info);
    canal.close();
  } catch (e) { /* navigateur ancien : l'app relit l'état au retour du focus */ }
  try {
    if (window.opener && !window.opener.closed) window.opener.postMessage(info, window.location.origin);
  } catch (e) { /* lien coupé par la page de connexion */ }

  var memeOnglet = false;
  try {
    memeOnglet = sessionStorage.getItem('spa-oauth-meme-onglet') === '1';
    sessionStorage.removeItem('spa-oauth-meme-onglet');
  } catch (e) { /* stockage indisponible */ }

  if (memeOnglet) {
    setTimeout(function () { window.location.replace('/'); }, info.ok ? 1500 : 4000);
    return;
  }
  setTimeout(function () {
    window.close();
    // Si le navigateur refuse la fermeture, on le dit.
    setTimeout(function () {
      var note = document.getElementById('fermer');
      if (note) note.hidden = false;
    }, 300);
  }, info.ok ? 1200 : 3500);
})();
