import React from 'react';
import { Fenetre, Options, st } from '../../components/ui/Fenetres.jsx';
import { pdfUtils } from '../../services/pdf.js';
import { categoriesPresentes, categorieDuPlat } from '../../utils/categoriesPlat.js';
import { zurichToday } from '../../utils/zurichTime.js';
import {
  platsImprimables, bilanCarteClient, payloadCarteTable, payloadAllergenesCarte,
  nomFichierCarte, nomFichierAllergenes,
} from './carteClient.js';

// ─── Imprimer pour le client ────────────────────────────────────────────────
// Sort, depuis la carte affichée, « Carte pour la table » (plats, descriptions,
// prix, allergènes en toutes lettres) ou « Allergènes de la carte » (tableau
// plats par allergènes), en PDF vectoriel. Montée seulement par l'entrée du
// menu « Gérer », réservée à qui gère les cartes : aucun test de rôle ici.
// La fenêtre ne lit rien en base : elle part de ce que l'écran a chargé.
//
// Props :
//   carte           : carte affichée
//   plats           : plats de la carte (platsCarte de l'écran)
//   recettesActives : recettes non archivées, cachées comprises
//   etablissement   : établissement courant (nom et logo du document)
//   pret            : lecture des plats et des cartes fiable
//   onClose()

const MSG_ERREUR = 'Le PDF n\'a pas pu être créé. Réessayez.';

const cs = {
  liste: { display: 'flex', flexDirection: 'column', gap: 2 },
  cocher: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', cursor: 'pointer', minHeight: 44, boxSizing: 'border-box' },
  case: { width: 18, height: 18, flexShrink: 0, accentColor: 'var(--accent)', margin: 0 },
  libelle: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  nombre: { fontSize: 'var(--t1)', color: 'var(--text2)', flexShrink: 0, fontFamily: 'var(--font-num)' },
  bilan: { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--piste)' },
  ligne: { fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.45 },
  noms: { margin: 0, paddingLeft: 18, fontSize: 'var(--t1)', color: 'var(--text)', lineHeight: 1.5, overflowWrap: 'anywhere' },
  alerte: { fontSize: 'var(--t1)', color: 'var(--danger-strong)', lineHeight: 1.45 },
};

export default function CartePourClient({ carte, plats, recettesActives, etablissement, pret, onClose }) {
  const actifs = React.useMemo(() => (plats || []).filter((p) => p && p.actif !== false), [plats]);
  const categories = React.useMemo(() => categoriesPresentes(actifs), [actifs]);
  const nombreParCategorie = React.useMemo(() => {
    const m = new Map();
    actifs.forEach((p) => { const c = categorieDuPlat(p); m.set(c, (m.get(c) || 0) + 1); });
    return m;
  }, [actifs]);

  const [choixDoc, setChoixDoc] = React.useState('table');
  // Catégories décochées plutôt que cochées : une catégorie apparue après
  // l'ouverture (rechargement) arrive cochée, comme les autres.
  const [decochees, setDecochees] = React.useState(() => new Set());
  const [avecPrix, setAvecPrix] = React.useState(true);
  const [enCours, setEnCours] = React.useState(false);
  const [erreur, setErreur] = React.useState('');
  const verrou = React.useRef(false);

  const choisies = React.useMemo(() => categories.filter((c) => !decochees.has(c)), [categories, decochees]);
  const retenus = React.useMemo(() => platsImprimables(actifs, choisies).flatMap(([, ps]) => ps), [actifs, choisies]);
  const bilan = React.useMemo(() => bilanCarteClient(retenus, recettesActives), [retenus, recettesActives]);
  const estTable = choixDoc === 'table';
  const aucuneCategorie = choisies.length === 0;
  const inactif = !pret || aucuneCategorie || enCours;

  const basculer = (cat) => setDecochees((s) => {
    const n = new Set(s);
    if (n.has(cat)) n.delete(cat); else n.add(cat);
    return n;
  });

  const exporter = async (autoPrint) => {
    if (verrou.current || inactif) return; // un second toucher ne lance pas un second fichier
    verrou.current = true;
    setEnCours(true);
    setErreur('');
    try {
      const jour = zurichToday();
      if (estTable) {
        const payload = payloadCarteTable({ carte, plats: retenus, recettesActives, avecPrix, jour });
        await pdfUtils.exportCarteTablePdf(payload, { etablissement, autoPrint, filename: nomFichierCarte(carte) });
      } else {
        const payload = payloadAllergenesCarte({ carte, plats: retenus, recettesActives, jour });
        await pdfUtils.exportAllergenesCartePdf(payload, { etablissement, autoPrint, filename: nomFichierAllergenes(carte) });
      }
    } catch {
      setErreur(MSG_ERREUR);
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };

  const eteint = inactif ? { opacity: 0.65, cursor: 'default' } : null;
  const pied = (
    <>
      <button type="button" style={{ ...st.secondaire, ...eteint }} disabled={inactif} onClick={() => exporter(true)}>Imprimer</button>
      <button type="button" style={{ ...st.primaire, ...eteint }} disabled={inactif} onClick={() => exporter(false)}>Télécharger le PDF</button>
    </>
  );

  return (
    <Fenetre
      id="carte-pour-client"
      titre="Imprimer pour le client"
      sousTitre={<span data-no-translate="">{carte?.nom}</span>}
      onClose={onClose}
      largeur={480}
      pied={pied}
    >
      <div style={st.section}>
        <div style={st.sectionTitre}>Document</div>
        <Options
          nom="Document"
          valeur={choixDoc}
          onChange={setChoixDoc}
          options={[
            { v: 'table', label: 'Carte pour la table', detail: 'Les plats, leur description, leur prix et leurs allergènes.' },
            { v: 'allergenes', label: 'Allergènes de la carte', detail: 'Un tableau des plats par allergène, en paysage.' },
          ]}
        />
      </div>

      <div style={st.section}>
        <div style={st.sectionTitre}>Catégories</div>
        <div style={cs.liste}>
          {categories.map((cat) => (
            <label key={cat} style={cs.cocher}>
              <input type="checkbox" style={cs.case} checked={!decochees.has(cat)} onChange={() => basculer(cat)} />
              <span style={cs.libelle} data-no-translate="">{cat}</span>
              <span style={cs.nombre} data-no-translate="">{nombreParCategorie.get(cat) || 0}</span>
            </label>
          ))}
        </div>
      </div>

      {estTable && (
        <label style={cs.cocher}>
          <input type="checkbox" style={cs.case} checked={avecPrix} onChange={(e) => setAvecPrix(e.target.checked)} />
          <span style={cs.libelle}>Afficher les prix</span>
        </label>
      )}

      <div style={cs.bilan} aria-live="polite">
        {!pret ? (
          <div style={cs.ligne}>Les plats ne sont pas encore chargés. Réessayez dans un instant.</div>
        ) : aucuneCategorie ? (
          <div style={cs.ligne}>Choisissez au moins une catégorie.</div>
        ) : (
          <>
            <div style={cs.ligne}>
              <span data-no-translate="">{bilan.nombre}</span> <span>{bilan.nombre > 1 ? 'plats retenus' : 'plat retenu'}</span>
            </div>
            {bilan.sansFiche.length > 0 && (
              <div>
                <div style={cs.ligne}>Ces plats n'ont pas de fiche. Leurs allergènes ne sont pas connus : le document le dira.</div>
                <ul style={cs.noms} data-no-translate="">
                  {bilan.sansFiche.map((nom, i) => <li key={`${nom}-${i}`}>{nom}</li>)}
                </ul>
              </div>
            )}
            {estTable && avecPrix && bilan.sansPrix > 0 && (
              <div>
                <div style={cs.ligne}>
                  <span data-no-translate="">{bilan.sansPrix}</span> <span>{bilan.sansPrix > 1 ? 'plats sans prix' : 'plat sans prix'}</span>
                </div>
                <div style={cs.ligne}>Ces plats seront imprimés sans prix. Le prix d'un plat se saisit dans le Chiffrage.</div>
              </div>
            )}
          </>
        )}
        {erreur && <div style={cs.alerte} role="alert">{erreur}</div>}
      </div>
    </Fenetre>
  );
}
