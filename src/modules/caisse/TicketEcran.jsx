import React from 'react';
import { Btn, Input } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import * as caisse from '../../services/caisseService.js';

// ─────────────────────────────────────────────────────────────────────────────
// L'écran du ticket : la grille d'articles (tap = +1) et le ticket lui-même
// (lignes par suite, envoi du bon, à suivre, encaissement). Gros boutons,
// cibles 44 px : c'est l'écran du service, au doigt, sur iPad.
// Les noms d'articles et de tables sont des données : data-no-translate.
// Chaque nombre vit dans son propre noeud (traduction du DOM).
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

export default function TicketEcran({ ticket, articles, ticketsMemeTable, onDeplacer, onFusionne, onClos, reload }) {
  const [recherche, setRecherche] = React.useState('');
  const [noteLigneId, setNoteLigneId] = React.useState(null);
  const [noteTexte, setNoteTexte] = React.useState('');
  const [libreOuvert, setLibreOuvert] = React.useState(false);
  const [libreNom, setLibreNom] = React.useState('');
  const [librePrix, setLibrePrix] = React.useState('');
  const [paiementOuvert, setPaiementOuvert] = React.useState(false);
  const [envoiEnCours, setEnvoiEnCours] = React.useState(false);

  const lignes = ticket?.lignes || [];
  const total = lignes.reduce((s, l) => s + Number(l.quantite) * Number(l.prix_unitaire), 0);
  const enAttente = lignes.filter((l) => l.statut === 'en_attente');
  // La suite a envoyer : la plus basse qui porte encore des lignes en attente.
  const suiteAEnvoyer = enAttente.length ? Math.min(...enAttente.map((l) => l.suite)) : null;

  const match = makeSearchMatcher(recherche);
  const visibles = (articles || []).filter((a) => match(a.nom, a.categorie));
  // L'ordre du service d'abord, les catégories maison ensuite, par ordre alphabétique.
  const ORDRE_CATEGORIES = ['Entrées', 'Plats', 'Desserts', 'Boissons'];
  const rang = (c) => { const i = ORDRE_CATEGORIES.indexOf(c); return i === -1 ? ORDRE_CATEGORIES.length : i; };
  const categories = [...new Set(visibles.map((a) => a.categorie || 'Plats'))]
    .sort((a, b) => (rang(a) - rang(b)) || a.localeCompare(b));

  const erreur = (e) => { if (e) notify(e, 'error'); return Boolean(e); };

  async function ajouterArticle(plat) {
    // Même plat, même suite 1 par défaut, sans note, pas encore envoyé : +1.
    const existante = lignes.find((l) =>
      l.statut === 'en_attente' && l.plat_id === plat.id && l.suite === 1 && !l.note);
    if (existante) {
      const { error } = await caisse.majLigne(existante.id, { quantite: Number(existante.quantite) + 1 });
      if (erreur(error)) return;
    } else {
      const { error } = await caisse.ajouterLigne({
        ticketId: ticket.id, platId: plat.id, libelle: plat.nom,
        prixUnitaire: plat.prixVente ?? 0, suite: 1,
      });
      if (erreur(error)) return;
    }
    reload();
  }

  async function ajouterLibre() {
    const nom = libreNom.trim();
    if (!nom) return;
    const { error } = await caisse.ajouterLigne({
      ticketId: ticket.id, libelle: nom,
      prixUnitaire: Number(String(librePrix).replace(',', '.')) || 0, suite: 1,
    });
    if (erreur(error)) return;
    setLibreNom(''); setLibrePrix(''); setLibreOuvert(false);
    reload();
  }

  async function changerQuantite(l, delta) {
    const q = Number(l.quantite) + delta;
    if (q <= 0) {
      const { error } = await caisse.supprimerLigne(l.id);
      if (erreur(error)) return;
    } else {
      const { error } = await caisse.majLigne(l.id, { quantite: q });
      if (erreur(error)) return;
    }
    reload();
  }

  async function changerSuite(l) {
    const { error } = await caisse.majLigne(l.id, { suite: l.suite >= 3 ? 1 : l.suite + 1 });
    if (!erreur(error)) reload();
  }

  async function retirerLigne(l) {
    const { error } = await caisse.supprimerLigne(l.id);
    if (!erreur(error)) reload();
  }

  async function enregistrerNote() {
    const { error } = await caisse.majLigne(noteLigneId, { note: noteTexte.trim() || null });
    if (erreur(error)) return;
    setNoteLigneId(null); setNoteTexte('');
    reload();
  }

  async function basculerServi(l) {
    const { error } = await caisse.majLigne(l.id, { statut: l.statut === 'servi' ? 'envoye' : 'servi' });
    if (!erreur(error)) reload();
  }

  // Envoi du bon : la RPC est idempotente (un double tap ne crée pas deux
  // bons), le verrou local n'est là que pour l'affichage.
  async function envoyer() {
    if (envoiEnCours || suiteAEnvoyer == null) return;
    setEnvoiEnCours(true);
    try {
      const { data, error } = await caisse.envoyerBon(ticket.id, suiteAEnvoyer);
      if (erreur(error)) return;
      if (data?.lignes > 0) notify('Bon envoyé en cuisine', 'success');
      reload();
    } finally {
      setEnvoiEnCours(false);
    }
  }

  async function aSuivre() {
    if (suiteAEnvoyer == null) return;
    const { error } = await caisse.passerSuiteSuivante(ticket.id, suiteAEnvoyer);
    if (!erreur(error)) reload();
  }

  async function payer(moyen) {
    const { error } = await caisse.encaisser(ticket.id, moyen, Math.round(total * 100) / 100);
    if (erreur(error)) return;
    notify('Ticket encaissé', 'success');
    onClos();
  }

  async function fusionner() {
    const autre = ticketsMemeTable[0];
    if (!autre) return;
    if (!window.confirm('Réunir les deux tickets de cette table en un seul ?')) return;
    const { error } = await caisse.fusionnerTickets(autre.id, ticket.id);
    if (erreur(error)) return;
    onFusionne();
  }

  async function annuler() {
    if (!window.confirm('Annuler ce ticket ? Les lignes déjà envoyées restent en cuisine.')) return;
    const { error } = await caisse.majTicket(ticket.id, { statut: 'annule', closed_at: new Date().toISOString() });
    if (erreur(error)) return;
    notify('Ticket annulé', 'info');
    onClos();
  }

  if (!ticket) return null;

  return (
    <div style={st.deuxColonnes}>
      {/* ── La grille d'articles ── */}
      <section style={st.colArticles}>
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un article"
          style={{ minHeight: 44 }}
        />
        {categories.map((cat) => (
          <div key={cat}>
            <div style={st.categorie} data-no-translate>{cat}</div>
            <div style={st.grille}>
              {visibles.filter((a) => (a.categorie || 'Plats') === cat).map((a) => (
                <button key={a.id} type="button" data-cadre="" style={st.article} onClick={() => ajouterArticle(a)}>
                  <span style={st.articleNom} data-no-translate>{a.nom}</span>
                  <span style={st.articlePrix}>{chf(a.prixVente)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!visibles.length && (
          <p style={st.vide}>
            {recherche ? 'Aucun article ne correspond.' : 'Aucun article sur les cartes actives.'}
          </p>
        )}
        {libreOuvert ? (
          <div style={st.libreForm}>
            <Input value={libreNom} onChange={(e) => setLibreNom(e.target.value)} placeholder="Libellé" style={{ flex: 2, minWidth: 140, minHeight: 44 }} />
            <Input value={librePrix} onChange={(e) => setLibrePrix(e.target.value)} placeholder="Prix" type="text" inputMode="decimal" style={{ flex: 1, minWidth: 80, minHeight: 44 }} />
            <Btn variant="primary" onClick={ajouterLibre} style={st.btn44}>Ajouter</Btn>
            <Btn variant="ghost" onClick={() => setLibreOuvert(false)} style={st.btn44}>Fermer</Btn>
          </div>
        ) : (
          <Btn variant="ghost" onClick={() => setLibreOuvert(true)} style={st.btn44}>Article libre</Btn>
        )}
      </section>

      {/* ── Le ticket ── */}
      <section style={st.colTicket}>
        {lignes.length === 0 && <p style={st.vide}>Touchez un article pour l'ajouter.</p>}
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((s) => lignes.some((l) => l.suite === s)).map((s) => (
          <div key={s}>
            <div style={st.suiteTitre}><span>Suite</span> <span>{s}</span></div>
            {lignes.filter((l) => l.suite === s).map((l) => (
              <div key={l.id} style={st.ligne}>
                <div style={st.ligneHaut}>
                  <span style={st.ligneQte}>{Number(l.quantite)}</span>
                  <span style={st.ligneNom} data-no-translate>{l.libelle}</span>
                  <span style={st.lignePrix}>{chf(Number(l.quantite) * Number(l.prix_unitaire))}</span>
                </div>
                {l.note && <div style={st.ligneNote} data-no-translate>{l.note}</div>}
                <div style={st.ligneActions}>
                  {l.statut === 'en_attente' ? (
                    <>
                      <Btn variant="ghost" onClick={() => changerQuantite(l, -1)} style={st.btnMini} aria-label="Réduire la quantité">-1</Btn>
                      <Btn variant="ghost" onClick={() => changerQuantite(l, 1)} style={st.btnMini} aria-label="Augmenter la quantité">+1</Btn>
                      <Btn variant="ghost" onClick={() => changerSuite(l)} style={st.btnMini}>
                        <span>Suite</span> <span>{l.suite}</span>
                      </Btn>
                      <Btn variant="ghost" onClick={() => { setNoteLigneId(l.id); setNoteTexte(l.note || ''); }} style={st.btnMini}>Note</Btn>
                      <Btn variant="ghost" onClick={() => retirerLigne(l)} style={st.btnMini}>Retirer</Btn>
                    </>
                  ) : (
                    <Btn variant="ghost" onClick={() => basculerServi(l)} style={st.btnMini}>
                      {l.statut === 'servi' ? 'Servi' : 'Envoyé'}
                    </Btn>
                  )}
                </div>
                {noteLigneId === l.id && (
                  <div style={st.noteForm}>
                    <Input value={noteTexte} onChange={(e) => setNoteTexte(e.target.value)} placeholder="Cuisson, allergie, sans gluten..." style={{ flex: 1, minHeight: 44 }} />
                    <Btn variant="primary" onClick={enregistrerNote} style={st.btn44}>Enregistrer</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={st.totalLigne}>
          <span style={st.totalLibelle}>Total</span>
          <span style={st.totalValeur}><span>{chf(total)}</span> <span>CHF</span></span>
        </div>

        <div style={st.actions}>
          {suiteAEnvoyer != null && (
            <>
              <Btn variant="primary" onClick={envoyer} disabled={envoiEnCours} style={st.btnGrand}>
                <span>Envoyer la suite</span> <span>{suiteAEnvoyer}</span>
              </Btn>
              <Btn variant="ghost" onClick={aSuivre} style={st.btn44}>À suivre</Btn>
            </>
          )}
          {lignes.length > 0 && (
            <Btn variant="success" onClick={() => setPaiementOuvert((v) => !v)} style={st.btnGrand}>Encaisser</Btn>
          )}
        </div>

        {paiementOuvert && (
          <div style={st.paiement}>
            {enAttente.length > 0 && (
              <p style={st.avertissement}>
                <span>{enAttente.length}</span> <span>lignes pas encore envoyées en cuisine.</span>
              </p>
            )}
            <div style={st.moyens}>
              <Btn variant="primary" onClick={() => payer('especes')} style={st.btnGrand}>Espèces</Btn>
              <Btn variant="primary" onClick={() => payer('carte')} style={st.btnGrand}>Carte bancaire</Btn>
              <Btn variant="ghost" onClick={() => payer('autre')} style={st.btnGrand}>Autre</Btn>
            </div>
          </div>
        )}

        <div style={st.gestion}>
          <Btn variant="ghost" onClick={onDeplacer} style={st.btn44}>Déplacer</Btn>
          {ticketsMemeTable.length > 0 && (
            <Btn variant="ghost" onClick={fusionner} style={st.btn44}>Fusionner</Btn>
          )}
          <Btn variant="danger" onClick={annuler} style={st.btn44}>Annuler le ticket</Btn>
        </div>
      </section>
    </div>
  );
}

const st = {
  deuxColonnes: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', minWidth: 0 },
  colArticles: { flex: '3 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  colTicket: { flex: '2 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)', borderRadius: 'var(--r-lg)', padding: 14, borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)' },
  categorie: { fontSize: 13, fontWeight: 600, color: 'var(--text2)', margin: '8px 0 6px' },
  grille: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 },
  article: {
    minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
    gap: 4, padding: '10px 12px', borderRadius: 'var(--r-lg)', background: 'var(--surface2)', color: 'var(--text)',
    border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 14, textAlign: 'left',
  },
  articleNom: { fontWeight: 500, lineHeight: 1.2 },
  articlePrix: { fontSize: 12, color: 'var(--text2)', fontFamily: 'var(--font-num)' },
  libreForm: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  vide: { color: 'var(--text2)', fontSize: 14 },
  suiteTitre: { fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'none', margin: '6px 0 4px' },
  ligne: { padding: '8px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' },
  ligneHaut: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 },
  ligneQte: { fontFamily: 'var(--font-num)', fontWeight: 600, flexShrink: 0 },
  ligneNom: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  lignePrix: { fontFamily: 'var(--font-num)', flexShrink: 0 },
  ligneNote: { fontSize: 12, color: 'var(--text2)', marginTop: 2 },
  ligneActions: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  noteForm: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btnMini: { minHeight: 44, padding: '8px 12px', flexShrink: 0 },
  btn44: { minHeight: 44, flexShrink: 0 },
  btnGrand: { minHeight: 52, fontSize: 16, flex: '1 1 auto' },
  totalLigne: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  totalLibelle: { fontSize: 14, color: 'var(--text2)' },
  totalValeur: { fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-num)' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  paiement: { display: 'flex', flexDirection: 'column', gap: 8 },
  moyens: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  avertissement: { fontSize: 13, color: 'var(--text2)', margin: 0 },
  gestion: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--border)' },
};
