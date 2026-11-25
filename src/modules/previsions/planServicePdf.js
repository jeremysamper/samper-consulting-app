// ─────────────────────────────────────────────────────────────────────────────
// Plan du service en PDF, pour le briefing et le passe : une page par salle
// (le plan dessiné, chaque table avec son numéro et son premier client, puis
// la liste des tables et de leurs clients dans l'ordre des numéros), et une
// page finale avec toutes les réservations du service dans l'ordre d'arrivée.
//
// Vectoriel (jsPDF, chargé à la demande), construit depuis les données et non
// depuis l'écran : il reste en français quelle que soit la langue affichée.
// Même plume et même ouverture que les documents de la caisse.
// ─────────────────────────────────────────────────────────────────────────────

import { formatDateLongue } from '../../utils/dateHelpers.js';
import { ouvrirDocument, plume } from '../caisse/documentsCaisse.js';
import { cadrage } from '../salle/planVue.js';
import { hhmm, minutesDe } from '../salle/planTemps.js';
import { libelleTagAllergene } from '../../utils/allergenes.js';

const L = 842;           // A4 paysage, en points
const H = 595;
const MARGE = 36;
const parNumero = (a, b) => String(a.nom).localeCompare(String(b.nom), undefined, { numeric: true });
const heureDe = (r) => hhmm(minutesDe(r.heure_arrivee) ?? 0);
const allergies = (r) => (Array.isArray(r.reservation_tags) ? r.reservation_tags : [])
  .filter((t) => t.type_tag === 'allergene' && t.valeur).map((t) => libelleTagAllergene(t.valeur));
const vivante = (r) => r.statut !== 'no_show' && r.statut !== 'annule' && r.statut !== 'refuse';
// L'ellipse typographique n'est pas rendue par les polices de jsPDF.
const couper = (doc, texte, largeur) => {
  let t = String(texte || '');
  if (doc.getTextWidth(t) <= largeur) return t;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > largeur) t = t.slice(0, -1);
  return `${t}...`;
};

function dessinerSalle(doc, { tables, elements, groupeDe, resasParGroupe }, zone) {
  const vue = cadrage([...tables, ...elements], 30);
  const k = Math.min(zone.w / vue.w, zone.h / vue.h);
  const ox = zone.x + (zone.w - vue.w * k) / 2 - vue.x0 * k;
  const oy = zone.y - vue.y0 * k;
  const X = (u) => ox + u * k;
  const Y = (u) => oy + u * k;

  doc.setFillColor(244, 246, 248);
  doc.roundedRect(zone.x - 8, zone.y - 8, zone.w + 16, vue.h * k + 16, 8, 8, 'F');

  // Décor : murs et baies en traits, le reste en aplats clairs nommés.
  elements.forEach((el) => {
    const x = X(Number(el.pos_x)); const y = Y(Number(el.pos_y));
    const w = Number(el.largeur) * k; const h = Number(el.hauteur) * k;
    if (el.type === 'mur' || el.type === 'baie') {
      doc.setDrawColor(el.type === 'mur' ? 90 : 150);
      doc.setLineWidth(el.type === 'mur' ? 2.5 : 1.5);
      if (w >= h) doc.line(x, y + h / 2, x + w, y + h / 2);
      else doc.line(x + w / 2, y, x + w / 2, y + h);
      return;
    }
    if (el.type === 'zone') {
      doc.setDrawColor(200);
      doc.setLineWidth(0.6);
      doc.setLineDashPattern([3, 3], 0);
      doc.roundedRect(x, y, w, h, 4, 4, 'S');
      doc.setLineDashPattern([], 0);
    } else {
      doc.setFillColor(226, 231, 235);
      doc.roundedRect(x, y, w, h, 3, 3, 'F');
    }
    const nom = el.libelle || (el.type === 'bar' ? 'Bar' : el.type === 'accueil' ? 'Accueil' : '');
    if (nom && w > 24 && h > 10) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(110);
      doc.text(couper(doc, nom, w - 4), x + w / 2, y + h / 2 + 2.5, { align: 'center' });
    }
  });

  // Tables : contour, aplat clair si un client y est attendu ou assis.
  const parlees = new Set();
  tables.forEach((t) => {
    const g = groupeDe.get(t.id);
    const resas = g ? (resasParGroupe.get(g.id) || []).filter(vivante) : [];
    const x = X(Number(t.pos_x)); const y = Y(Number(t.pos_y));
    const w = Number(t.largeur) * k; const h = Number(t.hauteur) * k;
    doc.setDrawColor(resas.length ? 0 : 150, resas.length ? 48 : 160, resas.length ? 66 : 168);
    doc.setLineWidth(resas.length ? 1.1 : 0.7);
    if (resas.length) doc.setFillColor(232, 240, 246); else doc.setFillColor(255, 255, 255);
    if (t.forme === 'ronde' || t.forme === 'tabouret') doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 'FD');
    else doc.roundedRect(x, y, w, h, Math.min(5, w / 6), Math.min(5, h / 6), 'FD');
    if (g && parlees.has(g.id)) return;
    if (g) parlees.add(g.id);
    const principale = g ? tables.find((x2) => x2.id === g.id) || t : t;
    const px = X(Number(principale.pos_x)); const py = Y(Number(principale.pos_y));
    const pw = Number(principale.largeur) * k; const ph = Number(principale.hauteur) * k;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(Math.max(7, Math.min(12, Math.min(pw, ph) / 3.2)));
    doc.setTextColor(20);
    doc.text(String(principale.nom), px + pw / 2, py + ph / 2 + (resas.length ? -1 : 3), { align: 'center' });
    if (resas.length && t.forme !== 'tabouret' && ph > 22) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(60);
      const premier = [...resas].sort((a, b) => (minutesDe(a.heure_arrivee) ?? 0) - (minutesDe(b.heure_arrivee) ?? 0))[0];
      const complet = `${premier.nom} ${heureDe(premier)}`;
      const texte = doc.getTextWidth(complet) <= pw - 4 ? complet : couper(doc, premier.nom, pw - 4);
      doc.text(texte, px + pw / 2, py + ph / 2 + 8, { align: 'center' });
    }
  });
  return vue.h * k;
}

export async function exporterPlanServicePdf({ date, nomService, salles, tables, elements, groupes, resasParGroupe, resas, tablesParResa }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true });
  const jour = formatDateLongue(date);
  const titre = `Plan de salle du ${String(nomService || '').toLowerCase()}`;
  doc.setProperties({ title: `${titre}, ${jour}` });
  const groupeDe = new Map();
  groupes.forEach((g) => g.tableIds.forEach((id) => groupeDe.set(id, g)));
  const listeSalles = salles.length ? salles : [{ id: null, nom: 'Salle' }];
  const premiere = listeSalles[0]?.id ?? null;
  const salleDe = (t) => t.salle_id || premiere;
  const vivantes = resas.filter(vivante);
  const couverts = vivantes.reduce((n, r) => n + (Number(r.nb_couverts) || 0), 0);

  let premierePage = true;
  listeSalles.forEach((salle) => {
    const ts = tables.filter((t) => salleDe(t) === salle.id && t.actif !== false);
    if (!ts.length && listeSalles.length > 1) return;
    const els = elements.filter((el) => el.salle_id === salle.id);
    if (!premierePage) doc.addPage();
    premierePage = false;
    const p = plume(doc, { gauche: MARGE, droite: L - MARGE, haut: MARGE + 14 });
    p.texte(titre, { taille: 16, gras: true, saut: 18 });
    p.texte(`${jour}, ${salle.nom}, ${couverts} couverts au service`, { taille: 10, gris: true });
    const zone = { x: MARGE + 8, y: MARGE + 60, w: 520, h: H - MARGE * 2 - 76 };
    dessinerSalle(doc, { tables: ts, elements: els, groupeDe, resasParGroupe }, zone);

    // Colonne de droite : les tables de la salle et leurs clients.
    const col = plume(doc, { gauche: MARGE + 560, droite: L - MARGE, haut: MARGE + 64 });
    col.texte('Tables et clients', { taille: 11, gras: true, saut: 15 });
    const vus = new Set();
    [...ts].sort(parNumero).forEach((t) => {
      const g = groupeDe.get(t.id);
      if (!g || vus.has(g.id)) return;
      vus.add(g.id);
      const rs = (resasParGroupe.get(g.id) || []).filter(vivante)
        .sort((a, b) => (minutesDe(a.heure_arrivee) ?? 0) - (minutesDe(b.heure_arrivee) ?? 0));
      if (!rs.length) return;
      if (col.y > H - MARGE - 20) return;
      const nomTable = g.tableIds.length > 1 ? `Table ${g.nom} (${g.tableIds.length} tables)` : `${t.forme === 'tabouret' ? 'Bar' : 'Table'} ${g.nom}`;
      col.texte(nomTable, { taille: 9, gras: true, saut: 12 });
      rs.forEach((r) => {
        const al = allergies(r);
        col.texte(`${heureDe(r)}  ${r.nom}, ${r.nb_couverts} couv.${al.length ? `, allergies : ${al.join(', ')}` : ''}`, { taille: 8.5, saut: 11 });
      });
      col.espace(3);
    });
  });

  // Dernière page : toutes les réservations, dans l'ordre d'arrivée.
  doc.addPage();
  const p = plume(doc, { gauche: MARGE, droite: L - MARGE, haut: MARGE + 14 });
  p.texte(`Réservations du ${String(nomService || '').toLowerCase()}`, { taille: 16, gras: true, saut: 18 });
  p.texte(`${jour}, ${vivantes.length} réservations, ${couverts} couverts`, { taille: 10, gris: true });
  p.filet(8);
  const colonnes = [MARGE, MARGE + 50, MARGE + 270, MARGE + 330, MARGE + 430];
  const entete = ['Heure', 'Nom', 'Couv.', 'Table', 'Allergies et notes'];
  const ligneEntete = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(95);
    entete.forEach((e, i) => doc.text(e, colonnes[i], p.y));
    p.y += 14;
  };
  ligneEntete();
  [...vivantes]
    .sort((a, b) => (minutesDe(a.heure_arrivee) ?? 0) - (minutesDe(b.heure_arrivee) ?? 0))
    .forEach((r) => {
      if (p.y > H - MARGE) { doc.addPage(); p.y = MARGE + 14; ligneEntete(); }
      const al = allergies(r);
      const notes = [al.length ? `Allergies : ${al.join(', ')}` : null, r.notes_libres || null].filter(Boolean).join('. ');
      const tablesR = tablesParResa.get(r.id) || [];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(20);
      doc.text(heureDe(r), colonnes[0], p.y);
      doc.setFont('helvetica', 'bold');
      doc.text(couper(doc, r.nom, 210), colonnes[1], p.y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(r.nb_couverts || ''), colonnes[2], p.y);
      doc.setTextColor(tablesR.length ? 20 : 140);
      doc.text(tablesR.length ? tablesR.join(' + ') : 'à placer', colonnes[3], p.y);
      doc.setTextColor(al.length ? 140 : 70, al.length ? 30 : 70, al.length ? 30 : 70);
      doc.text(couper(doc, notes, L - MARGE - colonnes[4]), colonnes[4], p.y);
      p.y += 6;
      doc.setDrawColor(225);
      doc.setLineWidth(0.4);
      doc.line(MARGE, p.y, L - MARGE, p.y);
      p.y += 11;
    });

  const nomFichier = `plan-salle-${date}-${String(nomService || 'service').toLowerCase()}.pdf`;
  ouvrirDocument(doc, nomFichier);
  return doc;
}
