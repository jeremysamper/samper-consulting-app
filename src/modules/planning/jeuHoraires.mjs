// Jeu d'essai des horaires d'une équipe sur un an, partagé par les tests
// (soldesHeures, Statistiques) : 1 460 horaires, quatre personnes, service
// coupé un jour sur trois, arrivées en retard, absences et contrats.
export const PERSONNES = ['u1', 'u2', 'u3', 'u4'];

const pad = (n) => String(n).padStart(2, '0');
const jourDe = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

export function jeuHoraires({ nuit = false } = {}) {
  const shifts = [];
  for (let n = 0; n < 365; n += 1) {
    const date = jourDe(n);
    PERSONNES.forEach((userId, k) => {
      if ((n + k) % 7 === 0) return;
      const retard = (n + k) % 11 === 0 ? 7 : ((n + k) % 13 === 0 ? 3 : 0);
      shifts.push({
        id: `s${n}-${k}`, userId, date, debut: '08:00', fin: k === 3 && nuit ? '01:30' : '14:30', pause: 30,
        pointageDebut: n < 300 ? `08:${pad(retard)}` : null, pointageFin: n < 300 ? '14:40' : null,
      });
      if ((n + k) % 3 === 0) shifts.push({ id: `s${n}-${k}b`, userId, date, debut: '18:00', fin: '22:15', pause: 0, pointageDebut: null, pointageFin: null });
    });
  }
  const contrats = [
    { id: 'k1', profileId: 'u1', taux: 100, heuresSemaine: 42, debut: '2026-01-01', fin: null },
    { id: 'k2', profileId: 'u2', taux: 80, heuresSemaine: 42, debut: '2026-03-15', fin: null },
    { id: 'k3', profileId: 'u3', taux: 50, heuresSemaine: 42, debut: '2025-06-01', fin: '2026-09-30' },
  ];
  const absences = [
    { userId: 'u1', motif: 'vacances', dateDebut: '2026-07-06', dateFin: '2026-07-19' },
    { userId: 'u2', motif: 'absence', dateDebut: '2026-02-02', dateFin: '2026-02-04' },
    { userId: 'u4', motif: 'conge', dateDebut: '2026-12-24', dateFin: '2027-01-02' },
  ];
  return { shifts, contrats, absences };
}
