// Famille HACCP du catalogue des Statistiques : chaque mesure lit un chiffre
// rendu par serieHaccp (haccp/serieHaccp.js), la règle des chiffres du
// registre des relevés. Sans React ni service.
//
// La température est une mesure à choix : une zone à la fois (une chambre
// froide à 3 °C et un congélateur à -20 °C ne se lisent pas ensemble). C'est
// un relevé, pas un flux : un pas vaut le dernier relevé de la zone dans le
// pas, la période son dernier relevé. Une tranche sans relevé vaut « n/a ».

import { serieHaccp } from '../../haccp/serieHaccp.js';

const sauf = (p, f) => (p.vide ? null : f(p));

export const familleHaccp = {
  id: 'haccp',
  libelle: 'HACCP',
  journee: 'la date du relevé',
  calculer(donnees, tranches) {
    return serieHaccp(donnees.releves, tranches).map((p) => ({ ...p, zones: donnees.zones || [] }));
  },
  mesures: [
    {
      id: 'haccp.releves', libelle: 'Relevés de température', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.releves),
      phrase: 'Nombre de relevés de température enregistrés, toutes zones.',
    },
    {
      id: 'haccp.anomalies', libelle: 'Relevés hors plage', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.anomalies),
      phrase: 'Relevés marqués non conformes à la saisie : la valeur sortait de la plage de la zone.',
    },
    {
      id: 'haccp.conformite', libelle: 'Taux de conformité', unite: 'pct', nature: 'taux',
      valeur: (p) => p.taux,
      phrase: 'Relevés conformes divisés par tous les relevés, comme les chiffres du registre ; recalculé sur chaque pas.',
    },
    {
      id: 'haccp.temperature', libelle: 'Température d\'une zone', unite: 'temp', nature: 'stock',
      choix: {
        libelle: 'Zone',
        options: (total) => {
          const vues = new Set(Object.keys(total.parZone || {}));
          const zones = (total.zones || []).map((z) => ({ cle: z.id, libelle: z.nom || z.id }));
          zones.forEach((z) => vues.delete(z.cle));
          return [...zones, ...[...vues].map((id) => ({ cle: id, libelle: id }))]
            .sort((a, b) => String(a.libelle).localeCompare(String(b.libelle), 'fr'));
        },
      },
      valeur: (p, zone) => p.parZone?.[zone]?.valeur ?? null,
      phrase: 'Dernière température relevée dans la zone choisie, sur chaque pas ; un relevé ne s\'additionne pas.',
    },
  ],
};
