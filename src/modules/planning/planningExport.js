// ─────────────────────────────────────────────────────────────────────────────
// Données des exports du Planning : ce que le PDF écrit et ce que le classeur
// Excel range. Pur, sans React : la fenêtre Exporter appelle ces fonctions puis
// passe le résultat à pdfUtils.exportPlanningPdf ou à XLSX.
// ─────────────────────────────────────────────────────────────────────────────
import { ajouterJours, formatDuree, heuresSegment, typeHoraire } from './planningModeles.js';

export const datesEntre = (debut, fin) => {
  const out = [];
  for (let d = debut, i = 0; d <= fin && i < 400; d = ajouterJours(d, 1), i += 1) out.push(d);
  return out;
};

const capitale = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const jourLong = (iso) => capitale(new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' }));
const jourCourt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '');

// « 1er » comme on l'écrit, pas « 1 ».
const jourDuMois = (d) => (d.getDate() === 1 ? '1er' : String(d.getDate()));
const mois = (d, annee) => d.toLocaleDateString('fr-CH', annee ? { month: 'long', year: 'numeric' } : { month: 'long' });

export const libellePeriode = (debut, fin) => {
  const a = new Date(debut + 'T12:00:00');
  const b = new Date(fin + 'T12:00:00');
  if (debut === fin) return `le ${jourDuMois(a)} ${mois(b, true)}`;
  const memeMois = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const memeAnnee = a.getFullYear() === b.getFullYear();
  if (memeMois) return `du ${jourDuMois(a)} au ${jourDuMois(b)} ${mois(b, true)}`;
  const ga = `${jourDuMois(a)} ${mois(a, !memeAnnee)}`;
  return `du ${ga} au ${jourDuMois(b)} ${mois(b, true)}`;
};

const triHeure = (a, b) => (a.debut || '').localeCompare(b.debut || '');
const heuresPointees = (s) => (s.pointageDebut && s.pointageFin
  ? heuresSegment({ debut: s.pointageDebut, fin: s.pointageFin, pause: s.pause })
  : 0);

// ─── Planning de l'équipe : une semaine par page ───────────────────────────
// sections = [{ nom | null, personnes: [user] }]
export function payloadEquipe({ titre, sousTitre, debut, fin, sections, shifts, absenceDe, nomDe }) {
  const jours = datesEntre(debut, fin);
  const semaines = [];
  for (let i = 0; i < jours.length; i += 7) {
    const js = jours.slice(i, i + 7);
    semaines.push({
      titre: `Semaine ${libellePeriode(js[0], js[js.length - 1])}`,
      jours: js.map(d => ({ date: d, court: jourCourt(d) })),
      sections: sections.map(sec => ({
        nom: sec.nom,
        lignes: sec.personnes.map(p => {
          let total = 0;
          const cases = js.map(d => {
            const lignes = [];
            const abs = absenceDe ? absenceDe(p.id, d) : null;
            if (abs) lignes.push(abs);
            shifts.filter(s => s.userId === p.id && s.date === d).sort(triHeure).forEach(s => {
              total += heuresSegment(s);
              lignes.push(typeHoraire(s.typeShift).label.toLowerCase(), `${s.debut}-${s.fin}`);
            });
            return lignes;
          });
          return { nom: nomDe(p.id), total: total ? formatDuree(total) : '', cases };
        }),
      })).filter(sec => sec.lignes.length),
    });
  }
  return { kind: 'equipe', titre, sousTitre, semaines };
}

// ─── Planning de chaque personne : une page par personne ───────────────────
export function payloadPersonnes({ titre, sousTitre, debut, fin, personnes, shifts, absenceDe, nomDe }) {
  const jours = datesEntre(debut, fin);
  return {
    kind: 'personnes',
    titre,
    sousTitre,
    personnes: personnes.map(p => {
      let total = 0;
      return {
        nom: nomDe(p.id),
        jours: jours.map(d => {
          const duJour = shifts.filter(s => s.userId === p.id && s.date === d).sort(triHeure);
          const h = duJour.reduce((t, s) => t + heuresSegment(s), 0);
          total += h;
          const abs = absenceDe ? absenceDe(p.id, d) : null;
          const horaires = duJour.map(s => {
            const pause = s.pause ? `, pause ${s.pause} min` : '';
            return `${typeHoraire(s.typeShift).label}, ${s.debut} à ${s.fin}${pause}${s.poste ? ` (${s.poste})` : ''}`;
          });
          if (abs) horaires.unshift(abs);
          return { label: jourLong(d), horaires, duree: h ? formatDuree(h) : '' };
        }),
        total: formatDuree(total),
      };
    }),
  };
}

// ─── Pointages : un bloc par jour ──────────────────────────────────────────
export function payloadPointages({ titre, sousTitre, debut, fin, personnesIds, shifts, nomDe }) {
  const ids = new Set(personnesIds);
  const jours = datesEntre(debut, fin)
    .map(d => {
      const duJour = shifts.filter(s => s.date === d && ids.has(s.userId)).sort(triHeure);
      return {
        label: jourLong(d),
        lignes: duJour.map(s => {
          const prevu = heuresSegment(s);
          const reel = heuresPointees(s);
          const ecart = s.pointageDebut && s.pointageFin ? reel - prevu : null;
          return {
            nom: nomDe(s.userId),
            prevu: `${s.debut} à ${s.fin}`,
            arrivee: s.pointageDebut || '',
            depart: s.pointageFin || (s.pointageDebut ? 'en cours' : ''),
            duree: reel ? formatDuree(reel) : '',
            ecart: ecart == null || Math.abs(ecart) < 0.01 ? '' : `${ecart > 0 ? '+' : '-'}${formatDuree(Math.abs(ecart))}`,
            alerte: !s.pointageDebut,
          };
        }),
      };
    })
    .filter(j => j.lignes.length);
  return { kind: 'pointages', titre, sousTitre, jours };
}

// ─── Classeur Excel : le détail et les totaux, pour les salaires ───────────
export async function exporterExcel({ nomFichier, debut, fin, personnes, shifts, nomDe, groupeNomDe }) {
  const XLSX = await import('xlsx'); // chargé à la demande (hors bundle du module)
  const ids = new Set(personnes.map(p => p.id));
  const dates = new Set(datesEntre(debut, fin));
  const lignes = shifts
    .filter(s => ids.has(s.userId) && dates.has(s.date))
    .sort((a, b) => a.date.localeCompare(b.date) || nomDe(a.userId).localeCompare(nomDe(b.userId)) || triHeure(a, b));
  const arrondi = (h) => Math.round(h * 100) / 100;

  const detail = lignes.map(s => ({
    Date: s.date.split('-').reverse().join('.'),
    Jour: new Date(s.date + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'long' }),
    Personne: nomDe(s.userId),
    Groupe: groupeNomDe ? groupeNomDe(s.userId) : '',
    Type: typeHoraire(s.typeShift).label,
    Début: s.debut,
    Fin: s.fin,
    'Pause (min)': Number(s.pause) || 0,
    'Heures prévues': arrondi(heuresSegment(s)),
    Arrivée: s.pointageDebut || '',
    Départ: s.pointageFin || '',
    'Heures pointées': arrondi(heuresPointees(s)),
    Poste: s.poste || '',
  }));

  const totaux = personnes.map(p => {
    const siens = lignes.filter(s => s.userId === p.id);
    const prevues = siens.reduce((t, s) => t + heuresSegment(s), 0);
    const pointees = siens.reduce((t, s) => t + heuresPointees(s), 0);
    return {
      Personne: nomDe(p.id),
      Groupe: groupeNomDe ? groupeNomDe(p.id) : '',
      'Jours travaillés': new Set(siens.map(s => s.date)).size,
      'Heures prévues': arrondi(prevues),
      'Heures pointées': arrondi(pointees),
      Écart: arrondi(pointees - prevues),
    };
  }).filter(t => t['Jours travaillés'] > 0);

  const wb = XLSX.utils.book_new();
  const feuilleTotaux = XLSX.utils.json_to_sheet(totaux);
  feuilleTotaux['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
  const feuilleDetail = XLSX.utils.json_to_sheet(detail);
  feuilleDetail['!cols'] = [{ wch: 11 }, { wch: 10 }, { wch: 26 }, { wch: 14 }, { wch: 10 }, { wch: 7 }, { wch: 7 }, { wch: 11 }, { wch: 15 }, { wch: 9 }, { wch: 9 }, { wch: 15 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, feuilleTotaux, 'Totaux');
  XLSX.utils.book_append_sheet(wb, feuilleDetail, 'Horaires');
  XLSX.writeFile(wb, nomFichier);
  return { lignes: detail.length, personnes: totaux.length };
}
