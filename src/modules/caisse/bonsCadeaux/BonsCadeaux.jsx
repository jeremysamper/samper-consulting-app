import React from 'react';
import { Gift, HandCoins, Wallet } from 'lucide-react';
import EcranTache from '../../../components/parcours/EcranTache.jsx';
import { Btn, CarteRepere, Panneau, SegmentedTabs } from '../../../components/ui/index.jsx';
import { Fenetre } from '../../../components/ui/Fenetres.jsx';
import SearchToggle from '../../../components/ui/SearchToggle.jsx';
import { notify } from '../../../components/toast/index.js';
import { makeSearchMatcher } from '../../../utils/searchText.js';
import { zurichAjouterJours, zurichToday } from '../../../utils/zurichTime.js';
import { listBonsCadeaux, listMouvementsDepuis, trouverBonCadeau } from '../../../services/caisseBonsCadeauxService.js';
import { coordonneesMaison } from '../documentsCaisse.js';
import { bilanDuMois, dateCH, enCirculation, etatBon } from './codeBon.js';
import FenetreNouveauBon from './FenetreNouveauBon.jsx';
import FicheBonCadeau, { PastilleEtat } from './FicheBonCadeau.jsx';
import LecteurBon from './LecteurBon.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Bons cadeaux (caisse) : vendre un bon sur mesure, le retrouver par le nom, le
// téléphone ou le code (ou en lisant son QR), suivre ce qui reste à honorer.
// Les repères disent ce qui est en circulation (la somme des soldes : ce que
// la maison doit encore en repas), et ce qui s'est vendu et dépensé ce mois.
// Le paiement par bon se fait à l'encaissement d'un ticket (Encaissement.jsx).
// Hors mode test : l'écran ne montre que de vrais bons.
// ─────────────────────────────────────────────────────────────────────────────

const chf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const FILTRES = [
  { id: 'actifs', label: 'Actifs' },
  { id: 'epuises', label: 'Épuisés' },
  { id: 'annules', label: 'Annulés' },
  { id: 'tous', label: 'Tous' },
];

// codeAOuvrir : un bon ouvert depuis son QR (Caisse.jsx) ; sa fiche s'ouvre une fois.
export default function BonsCadeaux({ etablissement, reglages, role, codeAOuvrir = null, onCodeOuvert, onRetour }) {
  const etabId = etablissement?.id;
  const maison = React.useMemo(() => coordonneesMaison(etablissement, reglages), [etablissement, reglages]);
  const peutGerer = ['consultant', 'patron'].includes(role);
  const [bons, setBons] = React.useState(null);
  const [mouvements, setMouvements] = React.useState([]);
  const [erreur, setErreur] = React.useState(null);
  const [filtre, setFiltre] = React.useState('actifs');
  const [recherche, setRecherche] = React.useState('');
  const [nouveau, setNouveau] = React.useState(false);
  const [lecture, setLecture] = React.useState(false);
  const [recherchant, setRecherchant] = React.useState(false);
  const [fiche, setFiche] = React.useState(null);
  const aujourdhui = zurichToday();
  const mois = aujourdhui.slice(0, 7);

  const charger = React.useCallback(async () => {
    if (!etabId) return;
    const depuis = `${zurichAjouterJours(`${mois}-01`, -2)}T00:00:00Z`;
    const [b, m] = await Promise.all([listBonsCadeaux(etabId), listMouvementsDepuis(etabId, depuis)]);
    if (b.error) { setErreur(b.error); return; }
    setErreur(null);
    setBons(b.data);
    setMouvements(m.data || []);
  }, [etabId, mois]);
  React.useEffect(() => { charger(); }, [charger]);

  const circulation = enCirculation(bons);
  const bilan = bilanDuMois(mouvements, mois);
  const match = makeSearchMatcher(recherche);
  const visibles = (bons || []).filter((b) => {
    const e = etatBon(b, aujourdhui);
    if (filtre === 'actifs' && !(e === 'actif' || e === 'echu')) return false;
    if (filtre === 'epuises' && e !== 'epuise') return false;
    if (filtre === 'annules' && e !== 'annule') return false;
    // Le téléphone se cherche aussi sans ses espaces.
    return match(b.nom, b.code, b.code.replace('-', ''), b.telephone, String(b.telephone).replace(/\s/g, ''), b.message);
  });

  async function codeLu(code) {
    setRecherchant(true);
    try {
      const { data, error } = await trouverBonCadeau(etabId, code);
      if (error) { notify(error, 'error'); return; }
      if (!data) { notify(`Aucun bon ${code} dans cet établissement.`, 'warning'); return; }
      setLecture(false);
      setFiche(data);
    } finally {
      setRecherchant(false);
    }
  }

  const codeLuRef = React.useRef(codeLu);
  codeLuRef.current = codeLu;
  const onCodeOuvertRef = React.useRef(onCodeOuvert);
  onCodeOuvertRef.current = onCodeOuvert;
  React.useEffect(() => {
    if (!codeAOuvrir || !etabId) return;
    onCodeOuvertRef.current?.();
    codeLuRef.current(codeAOuvrir);
  }, [codeAOuvrir, etabId]);

  function bonChange(b) {
    setBons((liste) => (liste || []).map((x) => (x.id === b.id ? b : x)));
    charger();
  }

  return (
    <EcranTache
      titre="Bons cadeaux"
      etat="Vendre un bon sur mesure, le retrouver, suivre ce qu'il reste à honorer"
      onRetour={onRetour}
      actions={(
        <>
          <Btn onClick={() => setLecture(true)} style={s.btn44}>Lire un bon</Btn>
          <Btn variant="primary" onClick={() => setNouveau(true)} style={s.btn44}>Nouveau bon cadeau</Btn>
        </>
      )}
    >
      <div style={s.page} data-bons-cadeaux="">
        {erreur && (
          <Panneau style={s.alerte}>
            <span>{erreur}</span>
            <Btn onClick={charger} style={s.btn44}>Réessayer</Btn>
          </Panneau>
        )}

        {bons && bons.length > 0 && (
          <div style={s.reperes}>
            <CarteRepere
              Icone={Wallet}
              valeur={<span><span>{chf(circulation.montant)}</span> <span style={s.devise}>CHF</span></span>}
              libelle="en circulation"
              detail={<span><span style={s.num}>{circulation.nombre}</span> <span>{circulation.nombre > 1 ? 'bons à honorer' : 'bon à honorer'}</span></span>}
            />
            <CarteRepere
              Icone={Gift}
              valeur={<span><span>{chf(bilan.vendus.montant)}</span> <span style={s.devise}>CHF</span></span>}
              libelle="vendus ce mois"
              detail={<span><span style={s.num}>{bilan.vendus.nombre}</span> <span>{bilan.vendus.nombre > 1 ? 'bons' : 'bon'}</span></span>}
            />
            <CarteRepere
              Icone={HandCoins}
              valeur={<span><span>{chf(bilan.depenses.montant)}</span> <span style={s.devise}>CHF</span></span>}
              libelle="dépensés ce mois"
              detail="réglés à la caisse par des bons"
            />
          </div>
        )}

        <Panneau style={s.panneau}>
          <div style={s.barre}>
            <SegmentedTabs tabs={FILTRES} active={filtre} onChange={setFiltre} size="sm" />
            <SearchToggle value={recherche} onChange={setRecherche} placeholder="Nom, téléphone ou code" />
          </div>
          {bons == null && !erreur && <p style={s.vide}>Lecture des bons.</p>}
          {bons && bons.length === 0 && (
            <p style={s.vide}>Aucun bon cadeau pour l'instant. « Nouveau bon cadeau » en crée un sur mesure : le montant, le nom et le téléphone, et la caisse l'encaisse.</p>
          )}
          {bons && bons.length > 0 && visibles.length === 0 && (
            <p style={s.vide}>{match.active ? 'Aucun bon ne correspond à cette recherche.' : 'Aucun bon dans ce filtre.'}</p>
          )}
          <div className="caisse-bons-liste">
            {visibles.map((b) => {
              const e = etatBon(b, aujourdhui);
              return (
                <button key={b.id} type="button" style={s.ligne} onClick={() => setFiche(b)} data-bon={b.code}>
                  <span style={s.ligneTexte}>
                    <span style={s.nom} data-no-translate>{b.nom}</span>
                    <span style={s.ligneDetail}>
                      <span style={s.num} data-no-translate>{b.code}</span>
                      {b.valable_jusqu_au && <>{', '}<span>jusqu'au</span> <span style={s.num}>{dateCH(b.valable_jusqu_au)}</span></>}
                    </span>
                  </span>
                  <span style={s.ligneDroite}>
                    <span style={s.montant}><span>{chf(b.solde)}</span> <span style={s.devise}>CHF</span></span>
                    {e !== 'actif' && <PastilleEtat etat={e} />}
                  </span>
                </button>
              );
            })}
          </div>
        </Panneau>
      </div>

      {nouveau && (
        <FenetreNouveauBon
          etablissementId={etabId}
          reglages={reglages}
          maison={maison}
          onClose={() => setNouveau(false)}
          onCree={(b) => { setBons((liste) => [b, ...(liste || [])]); charger(); }}
        />
      )}
      {lecture && (
        <Fenetre id="caisse-bon-lire" titre="Lire un bon cadeau" onClose={() => setLecture(false)} largeur={460}>
          <LecteurBon onCode={codeLu} enCours={recherchant} />
        </Fenetre>
      )}
      {fiche && (
        <FicheBonCadeau
          key={fiche.id}
          bon={fiche}
          reglages={reglages}
          maison={maison}
          peutGerer={peutGerer}
          onClose={() => setFiche(null)}
          onChange={bonChange}
        />
      )}
    </EcranTache>
  );
}

const s = {
  btn44: { minHeight: 44 },
  page: { display: 'flex', flexDirection: 'column', gap: 24, marginTop: 16, minWidth: 0 },
  reperes: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 },
  panneau: { padding: '8px 18px 4px', display: 'flex', flexDirection: 'column', minWidth: 0 },
  barre: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '8px 0 10px' },
  alerte: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: 'var(--danger-text)' },
  vide: { margin: '8px 0 16px', fontSize: 'var(--t2)', color: 'var(--text2)', lineHeight: 1.5 },
  ligne: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 'var(--ligne-aeree)',
    padding: '8px 0', background: 'transparent', borderWidth: 0, borderBottomWidth: 1, borderStyle: 'solid', borderColor: 'var(--rule-soft)',
    borderRadius: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', color: 'var(--text)',
  },
  ligneTexte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  ligneDetail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  ligneDroite: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  montant: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t3)' },
  devise: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  num: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)' },
};
