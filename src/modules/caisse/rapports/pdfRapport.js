// ─────────────────────────────────────────────────────────────────────────────
// Synthèse de période de la caisse en PDF (v8). Vectoriel (jsPDF), construit
// depuis le rapport calculé (rapportCaisse), jamais depuis l'écran : il reste
// en français quelle que soit la langue affichée, et porte les mêmes montants
// que l'écran et les fichiers. Même moteur de mise en page et mêmes polices
// que la quittance et la clôture (documentsCaisse.js).
//
// Un rapport qui porte un jour non clôturé le dit en tête, en toutes lettres.
// ─────────────────────────────────────────────────────────────────────────────

import { chf, coordonneesMaison, plume } from '../documentsCaisse.js';
import { LIBELLES_SERVICES } from './calculRapports.js';
import { dateCH, dateHeureCH } from './exportsRapport.js';
import { libellePeriodeCaisse } from './periodesCaisse.js';

const taux = (t) => `${String(Number(t)).replace('.', ',')} %`;
const pct = (p) => (p == null ? '' : `${(Math.round(p * 1000) / 10).toFixed(1).replace('.', ',')} %`);
const nb = (n, un, plusieurs) => `${Number(n || 0)} ${Number(n || 0) > 1 ? plusieurs : un}`;
const qte = (q) => String(+Number(q).toFixed(3)).replace('.', ',');
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

//   rapport : rapportCaisse(...) ; comparaison : comparaison(...) ou null ;
//   noShow : { tables, couverts } ou null ; date : horodatage de l'édition.
export async function construireSynthese({ rapport, etablissement, reglages, comparaison = null, noShow = null, date = new Date() }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const maison = coordonneesMaison(etablissement, reglages);
  const direction = rapport.niveau === 'direction';
  const p = plume(doc, { gauche: 56, droite: 539, haut: 62 });
  const titre = `Rapport de caisse, ${libellePeriodeCaisse(rapport.periode)}`;
  doc.setProperties({ title: titre });

  // Saut de page quand la place manque pour `h` points.
  const place = (h = 40) => { if (p.y + h > 790) { doc.addPage(); p.y = 62; } };
  const bloc = (t) => { place(70); p.espace(6); p.texte(t, { taille: 11, gras: true, saut: 16 }); };
  const paire = (g, d, o) => { place(16); p.paire(g, d, o); };

  p.texte(maison.nom, { taille: 14, gras: true, saut: 18 });
  const adresse = [maison.adresse, maison.localite].filter(Boolean).join(', ');
  if (adresse) p.texte(adresse, { gris: true });
  if (maison.numeroTva) p.texte(`N° TVA ${maison.numeroTva}`, { gris: true });
  p.espace(10);
  p.texte('Rapport de caisse', { taille: 16, gras: true, saut: 21 });
  p.texte(majuscule(libellePeriodeCaisse(rapport.periode)), { taille: 11 });
  p.texte(`Du ${dateCH(rapport.periode.debut)} au ${dateCH(rapport.periode.fin)}, édité le ${dateHeureCH(date.toISOString())}`, { gris: true });
  if (rapport.provisoire) {
    p.espace(4);
    p.texte(`Rapport provisoire : ${nb(rapport.provisoires.length, 'jour n\'est pas clôturé', 'jours ne sont pas clôturés')} (${rapport.provisoires.map(dateCH).join(', ')}).`, { gras: true });
    p.texte('Un jour non clôturé peut encore changer. Il n\'entre pas dans la sortie comptable.', { gris: true });
  }
  p.filet(9);

  const s = rapport.synthese;
  if (direction) {
    bloc('Chiffre d\'affaires');
    paire('Ventes moins annulations, TVA comprise', `CHF ${chf(s.ttc)}`, { gras: true, taille: 11, saut: 15 });
    s.parTaux.forEach((x) => paire(`${taux(x.taux)} : hors TVA ${chf(x.ht)}, TVA ${chf(x.tva)}`, chf(x.ttc)));
    paire('Total hors TVA', chf(s.ht), { gris: true });
    paire('Total de la TVA', chf(s.tva), { gris: true });
    paire(`Ventes encaissées (${nb(s.tickets, 'ticket', 'tickets')})`, chf(s.ventesTtc));
    if (s.annulations) paire(`Annulations (${nb(s.annulations, 'ticket', 'tickets')})`, chf(-s.annulationsTtc));
    if (comparaison) {
      const c = comparaison.ttc;
      paire(`Période précédente (${libellePeriodeCaisse(comparaison.precedente)})`, `${chf(c.avant)}${c.pct == null ? '' : `, écart ${c.ecart >= 0 ? '+' : ''}${pct(c.pct)}`}`, { gris: true });
    }

    bloc('Fréquentation');
    paire('Couverts', String(s.couverts));
    paire('Ticket moyen', s.ticketMoyen == null ? 'n/a' : chf(s.ticketMoyen));
    paire('Dépense moyenne par couvert', s.parCouvert == null ? 'n/a' : chf(s.parCouvert));
    paire(`Midi ${pct(s.midi.part)}`, chf(s.midi.ttc));
    paire(`Soir ${pct(s.soir.part)}`, chf(s.soir.ttc));
    paire(`Sur place ${pct(s.surPlace.part)}`, chf(s.surPlace.ttc));
    paire(`À emporter ${pct(s.emporter.part)}`, chf(s.emporter.ttc));
    const c = rapport.clients;
    paire(`Sur réservation : ${nb(c.reservation.tickets, 'ticket', 'tickets')}, ${nb(c.reservation.couverts, 'couvert', 'couverts')}`, chf(c.reservation.ttc), { gris: true });
    paire(`De passage, à table : ${nb(c.passage.tickets, 'ticket', 'tickets')}, ${nb(c.passage.couverts, 'couvert', 'couverts')}`, chf(c.passage.ttc), { gris: true });
    paire(`Vente directe : ${nb(c.direct.tickets, 'ticket', 'tickets')}`, chf(c.direct.ttc), { gris: true });
    if (noShow) paire('No-show, selon le rapport des réservations', `${nb(noShow.tables, 'table', 'tables')}, ${nb(noShow.couverts, 'couvert', 'couverts')}`, { gris: true });

    const m = rapport.moyens;
    bloc('Moyens de paiement');
    m.lignes.forEach((l) => paire(`${l.nom} (${l.nombre})${l.annulations ? `, dont annulé ${chf(-l.annulations)}` : ''}`, chf(l.net)));
    paire('Net encaissé', chf(m.net), { gras: true });
    paire('Pourboires saisis, hors chiffre d\'affaires', chf(m.pourboires), { gris: true });
    if (m.arrondis) paire('Écarts d\'arrondi aux 5 centimes', chf(m.arrondis), { gris: true });
    if (rapport.ecartsCaisse?.lignes.length) {
      paire(`Écarts de caisse (${nb(rapport.ecartsCaisse.lignes.length, 'clôture', 'clôtures')})`, chf(rapport.ecartsCaisse.total), { gras: true });
      rapport.ecartsCaisse.lignes.filter((e) => e.ecart).forEach((e) => paire(`${dateCH(e.jour)}, clôture n° ${e.numeroRetenu}`, chf(e.ecart), { gris: true }));
    }
  }

  bloc('Par service');
  rapport.services.forEach((x) => paire(
    `${dateCH(x.jour)} ${LIBELLES_SERVICES[x.service].toLowerCase()} : ${nb(x.tickets, 'ticket', 'tickets')}, ${nb(x.couverts, 'couvert', 'couverts')}`
      + `${x.dureeMoyenneMin == null ? '' : `, table ${x.dureeMoyenneMin} min en moyenne`}`
      + `${rapport.provisoires.includes(x.jour) ? ', provisoire' : ''}`,
    chf(x.ttc),
  ));
  if (!rapport.services.length) p.texte('Aucun service sur cette période.', { gris: true });

  const pl = rapport.plats;
  bloc('Plats vendus');
  paire(`${nb(pl.lignes.length, 'produit', 'produits')}, ${qte(pl.qte)} vendus : midi ${qte(pl.midi.qte)}, soir ${qte(pl.soir.qte)}`, chf(pl.ttc), { gras: true });
  if (pl.offertsQte || pl.remises) paire(`Offerts ${qte(pl.offertsQte)} (valeur ${chf(pl.offertsValeur)}), remises ${chf(pl.remises)}`, '', { gris: true });
  pl.categories.forEach((c) => paire(`${c.nom} : ${qte(c.qte)}`, chf(c.ttc), { gris: true }));
  const liste = (t, lignes) => {
    if (!lignes.length) return;
    place(30 + lignes.length * 13);
    p.espace(4);
    p.texte(t, { taille: 9, gras: true });
    lignes.forEach((l) => paire(`${qte(l.qte)} x ${l.libelle} (midi ${qte(l.midi.qte)}, soir ${qte(l.soir.qte)})`, chf(l.ttc)));
  };
  liste('Les cinq meilleurs', pl.meilleurs);
  liste('Les cinq moins vendus', pl.moinsVendus);

  if (direction && rapport.journal) {
    const j = rapport.journal;
    bloc('Écarts de la période');
    paire(`Annulations (${j.annulations.nombre})`, chf(j.annulations.montant));
    paire(`Remises (${j.remises.nombre})`, chf(j.remises.montant));
    paire(`Offerts (${j.offerts.nombre}), valeur`, chf(j.offerts.montant));
    paire(`Tickets abandonnés avant encaissement (${j.abandons.nombre})`, chf(j.abandons.montant));
    paire(`Corrections de réservation (${j.corrections.nombre})`, '');
    paire(`Mode test : ${j.tests.entrees} entrées, ${j.tests.sorties} sorties, ${nb(j.tests.tickets, 'ticket purgé', 'tickets purgés')}, hors chiffres`, chf(j.tests.montant), { gris: true });
  }

  place(40);
  p.filet(12);
  p.texte('Chiffres calculés sur les tickets encaissés et les clôtures de caisse. Les tickets du mode test ne comptent nulle part.', { taille: 7, gris: true });
  p.texte('Ce document prépare les chiffres pour la fiduciaire : il ne tient pas les comptes et n\'établit pas le décompte TVA officiel.', { taille: 7, gris: true });
  return doc;
}
