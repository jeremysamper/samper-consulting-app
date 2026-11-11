// ─────────────────────────────────────────────────────────────────────────────
// Documents de la caisse v7 : la quittance d'un ticket et la clôture du jour.
//
// PDF vectoriels (jsPDF), construits depuis les données figées en base, jamais
// depuis l'écran : ils restent en français quelle que soit la langue affichée,
// et se relisent hors du navigateur (banc de relecture des PDF).
//
// Quittance, mentions de l'art. 26 LTVA (relu le 10.11.2026, état au
// 31.03.2025) : nom et localité du fournisseur, numéro sous lequel il est
// inscrit au registre des assujettis, date de la prestation, genre, objet et
// volume (les lignes), montant, taux applicable (et ici la TVA de chaque
// taux). Le destinataire n'est pas obligatoire jusqu'à 400 francs (OTVA
// art. 57) ; au-delà l'écran propose de le saisir. Une coordonnée que la
// maison n'a pas réglée n'est pas imprimée : rien n'est inventé.
//
// Polices standard du PDF (Helvetica) : pas d'espace fine ni d'ellipse, les
// milliers s'écrivent avec une apostrophe droite, à la suisse.
// ─────────────────────────────────────────────────────────────────────────────

import { zurichDateHeure } from '../../utils/zurichTime.js';
import { detailTva, numeroTicket, totalLigne } from './tva.js';
import { detailCarteTexte, ecartBouclement } from './tpe/ecranTpe.js';

const LIBELLES_MOYENS = { especes: 'Espèces', carte: 'Carte bancaire', autre: 'Autre' };

export const chf = (n) => {
  const v = Number(n || 0);
  const [e, d] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${d}`;
};
const taux = (t) => `${String(Number(t)).replace('.', ',')} %`;
const qte = (q) => String(+Number(q).toFixed(3)).replace('.', ',');
const dateDe = (jour) => {
  const [a, m, j] = String(jour || '').slice(0, 10).split('-');
  return a && m && j ? `${j}.${m}.${a}` : '';
};
const libelleMoyen = (p) => p.libelle || LIBELLES_MOYENS[p.moyen] || p.moyen;
// « 1 ticket », « 4 tickets » : l'accord se fait ici, pas à la lecture.
const nb = (n, un, plusieurs) => `${Number(n || 0)} ${Number(n || 0) > 1 ? plusieurs : un}`;
const parametres = (l) => [
  ...(Array.isArray(l.options) ? l.options : []).map((o) => (o?.type === 'sans' ? `sans ${o.valeur}` : o?.valeur)),
  l.note,
].filter(Boolean).join(', ');

// Les coordonnées imprimées : celles réglées dans la caisse, sinon le nom et
// l'adresse de l'établissement.
export function coordonneesMaison(etablissement, reglages) {
  const l = reglages?.legal || {};
  return {
    nom: l.raison_sociale || etablissement?.nom || '',
    adresse: l.adresse || (l.localite ? '' : etablissement?.adresse || ''),
    localite: l.localite || '',
    numeroTva: l.numero_tva || '',
  };
}

// Petit moteur de mise en page : une colonne, du haut vers le bas. Exporté
// pour la synthèse des rapports (rapports/pdfRapport.js).
export function plume(doc, { gauche, droite, haut }) {
  const p = { y: haut, gauche, droite, largeur: droite - gauche };
  p.texte = (t, { taille = 9, gras = false, gris = false, aligne = 'left', x = null, saut = null, largeur = null } = {}) => {
    doc.setFont('helvetica', gras ? 'bold' : 'normal');
    doc.setFontSize(taille);
    doc.setTextColor(gris ? 95 : 20);
    const lignes = doc.splitTextToSize(String(t ?? ''), largeur || p.largeur);
    const ax = x ?? (aligne === 'right' ? droite : aligne === 'center' ? (gauche + droite) / 2 : gauche);
    lignes.forEach((l) => { doc.text(l, ax, p.y, { align: aligne }); p.y += saut ?? taille * 1.32; });
  };
  // Deux textes sur une même ligne : libellé à gauche, valeur à droite.
  p.paire = (g, d, o = {}) => {
    const y0 = p.y;
    p.texte(g, { ...o, largeur: p.largeur - 70 });
    const y1 = p.y;
    p.y = y0;
    p.texte(d, { ...o, aligne: 'right' });
    p.y = Math.max(y1, p.y);
  };
  p.filet = (marge = 5) => {
    p.y += marge - 3;
    doc.setDrawColor(190);
    doc.setLineWidth(0.5);
    doc.line(gauche, p.y, droite, p.y);
    p.y += marge + 5;
  };
  p.espace = (h) => { p.y += h; };
  return p;
}

// ── Quittance ────────────────────────────────────────────────────────────────
// ticket : la ligne caisse_tickets avec lignes[], paiements[] et tableNom.
// client : { nom, adresse } facultatif (proposé au-dessus de 400 francs).
function dessinerQuittance(doc, p, { ticket, maison, client }) {
  const numero = numeroTicket(ticket);
  const quand = ticket.closed_at ? zurichDateHeure(ticket.closed_at) : null;

  p.texte(maison.nom, { taille: 13, gras: true, saut: 16 });
  if (maison.adresse) p.texte(maison.adresse);
  if (maison.localite) p.texte(maison.localite);
  if (maison.numeroTva) p.texte(`N° TVA ${maison.numeroTva}`);
  p.filet(7);

  p.texte(ticket.test ? 'Quittance de test' : `Quittance n° ${numero || 'non attribué'}`, { taille: 11, gras: true, saut: 15 });
  if (quand) p.texte(`Le ${quand.date} à ${quand.heure}`);
  p.texte([
    ticket.tableNom ? `Table ${ticket.tableNom}` : 'Vente directe',
    ticket.couverts ? nb(ticket.couverts, 'couvert', 'couverts') : null,
  ].filter(Boolean).join(', '));
  if (ticket.a_emporter) p.texte('Vente à emporter', { gras: true });
  if (client?.nom || client?.adresse) {
    p.espace(4);
    p.texte('Client', { gris: true, taille: 8 });
    if (client.nom) p.texte(client.nom);
    if (client.adresse) p.texte(client.adresse);
  }
  p.filet(7);

  const plusieursTaux = new Set((ticket.lignes || []).map((l) => Number(l.taux_tva ?? 8.1))).size > 1;
  (ticket.lignes || []).forEach((l) => {
    p.paire(`${qte(l.quantite)} x ${l.libelle}`, l.offert ? 'offert' : chf(totalLigne(l)));
    const details = [];
    // Deux taux sur le ticket (vente à emporter avec alcool) : chaque ligne dit le sien.
    if (plusieursTaux) details.push(`TVA ${taux(l.taux_tva ?? 8.1)}`);
    const params = parametres(l);
    if (params) details.push(params);
    if (l.offert) details.push(`valeur ${chf(Number(l.quantite) * Number(l.prix_origine))}`);
    else if (l.prix_origine != null && Number(l.remise_montant) > 0) {
      details.push(`prix ${chf(Number(l.quantite) * Number(l.prix_origine))}, remise ${chf(l.remise_montant)}`);
    }
    if (details.length) p.texte(details.join(' ; '), { taille: 8, gris: true });
    p.espace(1.5);
  });
  p.filet(5);

  const total = ticket.total_ttc != null ? Number(ticket.total_ttc) : (ticket.lignes || []).reduce((s, l) => s + totalLigne(l), 0);
  p.paire('Total TVA comprise', `CHF ${chf(total)}`, { taille: 12, gras: true, saut: 17 });
  p.espace(3);

  p.texte('Détail de la TVA', { gris: true, taille: 8 });
  detailTva(ticket.lignes).forEach((t) => {
    p.paire(`${taux(t.taux)} sur ${chf(t.ttc)}`, `TVA ${chf(t.tva)}`, { taille: 8.5 });
    p.texte(`hors TVA ${chf(t.ht)}`, { taille: 8, gris: true });
  });
  p.filet(6);

  p.texte('Règlement', { gris: true, taille: 8 });
  (ticket.paiements || []).forEach((r) => {
    p.paire(libelleMoyen(r), chf(Number(r.montant) + Number(r.arrondi || 0)));
    // v9 : une carte passée par le terminal relié dit ce que le terminal a
    // rendu (marque, quatre derniers chiffres, autorisation), et rien d'autre.
    // Le reçu du porteur reste celui du terminal.
    if (r.tpe_transaction_id) {
      p.texte(`${detailCarteTexte(r.transaction)}, terminal relié`, { taille: 8, gris: true });
      if (r.transaction?.rembourse_statut === 'fait') p.texte('remboursé sur le terminal', { taille: 8, gris: true });
    }
    if (Number(r.arrondi)) p.texte(`dont arrondi aux 5 centimes ${chf(r.arrondi)}`, { taille: 8, gris: true });
    if (Number(r.rendu)) p.texte(`rendu ${chf(r.rendu)}`, { taille: 8, gris: true });
    if (Number(r.pourboire)) p.texte(`pourboire ${chf(r.pourboire)}, hors total`, { taille: 8, gris: true });
  });

  if (ticket.statut === 'annule' && ticket.annule_at) {
    const a = zurichDateHeure(ticket.annule_at);
    p.filet(6);
    p.texte(`Ticket annulé le ${a.date} à ${a.heure}`, { gras: true });
    if (ticket.annule_motif) p.texte(`Motif : ${ticket.annule_motif}`);
  }
  if (ticket.empreinte) {
    p.espace(8);
    p.texte(`Empreinte ${String(ticket.empreinte).slice(0, 24)}`, { taille: 6.5, gris: true });
  }
  if (ticket.test) {
    p.espace(8);
    p.texte('Ticket du mode test : sans valeur, aucun numéro attribué.', { taille: 8, gras: true });
  }
}

export async function construireQuittance({ ticket, etablissement, reglages, client = null }) {
  const { jsPDF } = await import('jspdf');
  const maison = coordonneesMaison(etablissement, reglages);
  const largeur = 226.77; // 80 mm
  const marge = 14;
  // Première passe sur une page haute pour mesurer, seconde à la bonne hauteur :
  // la quittance tient toujours sur une page, quelle que soit sa longueur.
  const mesure = new jsPDF({ unit: 'pt', format: [largeur, 4000], compress: true });
  const pm = plume(mesure, { gauche: marge, droite: largeur - marge, haut: marge + 10 });
  dessinerQuittance(mesure, pm, { ticket, maison, client });
  const hauteur = Math.max(260, pm.y + marge);

  const doc = new jsPDF({ unit: 'pt', format: [largeur, hauteur], compress: true });
  doc.setProperties({ title: ticket.test ? 'Quittance de test' : `Quittance ${numeroTicket(ticket) || ''}` });
  const p = plume(doc, { gauche: marge, droite: largeur - marge, haut: marge + 10 });
  dessinerQuittance(doc, p, { ticket, maison, client });
  if (ticket.test) {
    // En travers de la page, sous le texte : lisible sans masquer les montants.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(200);
    doc.text('TEST, sans valeur', largeur / 2, hauteur / 2, { align: 'center', angle: 55 });
    doc.setTextColor(20);
  }
  return doc;
}

// ── Clôture du jour ──────────────────────────────────────────────────────────
// cloture : la ligne caisse_clotures (totaux figés par la base).
// bouclements (v9) : [{ terminal_id, montant }], le dernier total de
// bouclement saisi pour chaque terminal ce jour-là ; ils sont hors de la
// clôture figée, et le document le dit.
export async function construireCloture({ cloture, etablissement, reglages, bouclements = [] }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const maison = coordonneesMaison(etablissement, reglages);
  const t = cloture.totaux || {};
  const p = plume(doc, { gauche: 56, droite: 539, haut: 62 });
  doc.setProperties({ title: `Clôture de caisse Z${cloture.numero}` });

  p.texte(maison.nom, { taille: 14, gras: true, saut: 18 });
  p.texte([maison.adresse, maison.localite].filter(Boolean).join(', '), { gris: true });
  if (maison.numeroTva) p.texte(`N° TVA ${maison.numeroTva}`, { gris: true });
  p.espace(10);
  p.texte(`Clôture de caisse n° ${cloture.numero}${cloture.complement_de ? ' (complémentaire)' : ''}`, { taille: 16, gras: true, saut: 21 });
  p.texte(`Jour d'exploitation du ${dateDe(cloture.jour_exploitation)}`, { taille: 11 });
  const quand = zurichDateHeure(cloture.cloture_at);
  p.texte(`Clôturée le ${quand.date} à ${quand.heure}${cloture.cloture_par_nom ? ` par ${cloture.cloture_par_nom}` : ''}`, { gris: true });
  if (cloture.motif) p.texte(`Motif de la clôture complémentaire : ${cloture.motif}`);
  p.filet(9);

  const bloc = (titre) => { p.espace(4); p.texte(titre, { taille: 11, gras: true, saut: 16 }); };
  const ligneTaux = (x) => p.paire(`${taux(x.taux)} : hors TVA ${chf(x.ht)}, TVA ${chf(x.tva)}`, chf(x.ttc));

  const v = t.ventes || {};
  bloc('Ventes encaissées');
  p.paire(
    `${nb(v.tickets, 'ticket', 'tickets')}${v.tickets ? `, du n° ${v.premier_numero} au n° ${v.dernier_numero}` : ''}, ${nb(v.couverts, 'couvert', 'couverts')}`,
    chf(v.ttc),
    { gras: true },
  );
  (v.par_taux || []).forEach(ligneTaux);
  p.paire('Total hors TVA', chf(v.ht), { gris: true });
  p.paire('Total de la TVA', chf(v.tva), { gris: true });

  const a = t.annulations || {};
  if (a.tickets) {
    bloc('Annulations du jour');
    p.paire(`${nb(a.tickets, 'ticket annulé', 'tickets annulés')} : ${(a.numeros || []).join(', ')}`, chf(-Number(a.ttc)), { gras: true });
    (a.par_taux || []).forEach((x) => p.paire(`${taux(x.taux)} : hors TVA ${chf(-x.ht)}, TVA ${chf(-x.tva)}`, chf(-x.ttc)));
    (a.moyens || []).forEach((m) => p.paire(`rendu en ${libelleMoyen(m).toLowerCase()}`, chf(-Number(m.montant)), { gris: true }));
  }

  const n = t.net || {};
  bloc('Net du jour, TVA comprise');
  p.paire('Ventes moins annulations', chf(n.ttc), { gras: true });
  (n.par_taux || []).forEach(ligneTaux);
  p.paire('Net hors TVA', chf(n.ht), { gris: true });
  p.paire('TVA due sur le net', chf(n.tva), { gris: true });

  bloc('Moyens de paiement des ventes');
  (t.moyens || []).forEach((m) => p.paire(`${libelleMoyen(m)} (${m.nombre})`, chf(m.montant)));
  if (Number(t.arrondis)) p.paire('dont écarts d\'arrondi aux 5 centimes', chf(t.arrondis), { gris: true });

  // v9 : les cartes, par terminal relié d'un côté, saisies à la main de
  // l'autre. Le bloc n'existe que si un terminal relié a encaissé ou si un
  // bouclement a été saisi : sans terminal, le document est celui de la v7.
  const c = t.cartes || null;
  const terminauxCartes = c?.terminaux || [];
  const bouclementDe = (id) => (bouclements || []).find((b) => b.terminal_id === id) || null;
  const bouclesSeuls = (bouclements || []).filter((b) => !terminauxCartes.some((x) => x.terminal_id === b.terminal_id));
  if (c && (terminauxCartes.length || bouclesSeuls.length)) {
    bloc('Cartes bancaires');
    terminauxCartes.forEach((x) => {
      p.paire(`Terminal relié ${x.nom} (${x.nombre})${Number(x.annulees) ? `, dont annulé ${chf(-Number(x.annulees))}` : ''}`, chf(x.net));
      const b = bouclementDe(x.terminal_id);
      if (b) {
        p.paire('Bouclement du terminal, saisi à la main', chf(b.montant), { gris: true });
        p.paire('Écart, bouclement moins caisse', chf(ecartBouclement(x.net, b.montant)), { gris: true });
      }
    });
    bouclesSeuls.forEach((b) => p.paire('Bouclement d\'un terminal sans carte ce jour, saisi à la main', chf(b.montant), { gris: true }));
    p.paire('Cartes par terminal relié', chf(c.relie?.net), { gras: true });
    p.paire(`Cartes saisies à la main, terminal non relié (${c.manuel?.nombre || 0})`, chf(c.manuel?.net));
    if ((bouclements || []).length) p.texte('Le bouclement du terminal est saisi après la clôture : il n\'entre pas dans les totaux figés.', { taille: 8, gris: true });
  }

  if ((t.services || []).length) {
    bloc('Par service');
    t.services.forEach((s) => p.paire(`${s.service === 'midi' ? 'Midi' : 'Soir'} : ${nb(s.tickets, 'ticket', 'tickets')}, ${nb(s.couverts, 'couvert', 'couverts')}`, chf(s.ttc)));
  }

  bloc('Remises, offerts, pourboires');
  p.paire(`Remises (${nb(t.remises?.lignes, 'ligne', 'lignes')})`, chf(t.remises?.montant));
  p.paire(`Offerts (${nb(t.offerts?.lignes, 'ligne', 'lignes')}), valeur`, chf(t.offerts?.valeur));
  p.paire('Pourboires saisis, hors chiffre d\'affaires', chf(t.pourboires?.total));
  (t.pourboires?.par_moyen || []).forEach((m) => p.paire(`dont ${libelleMoyen(m).toLowerCase()}`, chf(m.montant), { gris: true }));
  if (t.abandons?.tickets) p.paire(`Tickets abandonnés avant encaissement (${t.abandons.tickets}), lignes déjà envoyées`, chf(t.abandons.montant));
  if (t.ouverts?.tickets) p.paire(`Tickets encore ouverts à la clôture (${t.ouverts.tickets}), reportés au jour suivant`, chf(t.ouverts.montant));

  const e = t.especes || {};
  bloc('Espèces');
  p.paire('Ventes en espèces', chf(e.ventes));
  if (Number(e.annulees)) p.paire('Espèces rendues pour annulation', chf(-Number(e.annulees)));
  p.paire('Espèces attendues, hors fond de caisse et pourboires', chf(e.attendues), { gras: true });
  p.paire('Fond de caisse', chf(cloture.fond_caisse));
  p.paire('Espèces comptées', chf(cloture.especes_comptees));
  p.espace(4);
  p.paire('Écart de caisse', chf(cloture.ecart), { gras: true, taille: 11 });

  p.filet(12);
  p.texte(`Empreinte ${cloture.empreinte}`, { taille: 7, gris: true });
  p.texte(`Empreinte précédente ${cloture.empreinte_precedente}`, { taille: 7, gris: true });
  p.texte('Document figé : une correction passe par une clôture complémentaire.', { taille: 7, gris: true });
  return doc;
}

// Ouvre un document dans un onglet (aperçu et impression par le navigateur),
// ou le télécharge si la fenêtre est refusée.
export function ouvrirDocument(doc, nom) {
  try {
    const url = doc.output('bloburl');
    const w = window.open(url, '_blank');
    if (w) return;
  } catch { /* repli : téléchargement */ }
  doc.save(nom);
}
