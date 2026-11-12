// Jeu d'essai des relevés HACCP, partagé par les tests (serieHaccp,
// Statistiques) : 1 460 relevés sur un an, deux par jour et par zone, une
// anomalie de temps en temps.
export const ZONES = [
  { id: 'z1', nom: 'Chambre froide', unite: '°C', min: 0, max: 4 },
  { id: 'z2', nom: 'Congélateur', unite: '°C', min: -25, max: -18 },
];

export function jeuReleves() {
  const out = [];
  for (let n = 0; n < 365; n += 1) {
    const date = new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
    ZONES.forEach((z, k) => {
      ['07:30', '18:00'].forEach((heure, h) => {
        const ecart = (n + k + h) % 17 === 0 ? 3 : 0;
        const valeur = k === 0 ? 2 + (n % 3) * 0.5 + ecart : -20 + (n % 4) * 0.5 + ecart;
        out.push({ id: `r${n}-${k}-${h}`, zoneId: z.id, date, heure, valeur, conforme: valeur >= z.min && valeur <= z.max });
      });
    });
  }
  return out;
}
