import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { Fenetre, st } from '../../components/ui/Fenetres.jsx';
import { notify } from '../../components/toast/index.js';
import { Puce } from '../dashboard/tableauUi.jsx';
import { Champ, h } from './hotelUi.jsx';
import { PIECES_IDENTITE, dateCourte, libelleDe, nomHote, personnes } from './hotelData.js';
import { CHAMPS_REPRIS, accompagnantsDuDernierSejour, completerFormulaire, dernierPassage, lectureTronquee } from './registreReprise.js';

// ─────────────────────────────────────────────────────────────────────────────
// Occupants d'un séjour (lot H4) : les personnes qui dorment, pour le registre
// des nuitées et le bulletin d'arrivée (LHR, RS 935.1), le calcul de la taxe de
// séjour (âge, exonération) et la statistique HESTA (pays de domicile).
// Lecture et saisie avec la case Modifier d'Hébergement ; suppression par la
// direction. Les dates d'un occupant restent dans celles du séjour (la base
// le vérifie).
// ─────────────────────────────────────────────────────────────────────────────

const vide = (s, hote) => ({
  prenom: hote?.prenom || '', nom: hote?.nom || '', dateNaissance: hote?.dateNaissance || '', nationalite: hote?.nationalite || '',
  domicileAdresse: '', domicileLocalite: '', domicilePays: '', pieceType: '', pieceNumero: '',
  arrivee: s.arrivee, depart: s.depart, exonereTaxe: false, exonereMotif: '', hoteId: hote?.id || '',
});

// Domicile et pièce d'une ligne : « Localité, Pays / Passeport X123 ».
const resumeLigne = (o) => [
  o.dateNaissance ? dateCourte(o.dateNaissance) : '', o.nationalite,
  [o.domicileAdresse, o.domicileLocalite, o.domicilePays].filter(Boolean).join(', '),
  o.pieceType ? `${libelleDe(PIECES_IDENTITE, o.pieceType)} ${o.pieceNumero}`.trim() : '',
].filter(Boolean).join(' / ');

export default function SejourOccupants({ sejour: s, chambre, hote, hotes, occupants, sejours = [], reglages, peutGerer, peutSupprimer, etablissement, onClose }) {
  const mesOccupants = occupants.rows.filter((o) => o.sejourId === s.id);
  const [form, setForm] = React.useState(null); // { occupant: null | occupant }
  const [f, setF] = React.useState(null);
  const [erreur, setErreur] = React.useState('');
  const [enCours, setEnCours] = React.useState(false);
  // Lot 13 du panel : d'où viennent les données reprises (jour du séjour).
  const [origine, setOrigine] = React.useState(null);
  const [reprise, setReprise] = React.useState(null); // null | { coches: Set<id> }
  const verrou = React.useRef(false);
  const registrePret = occupants.status === 'ready';
  const tronque = lectureTronquee(occupants.rows.length, 20000);
  const aReprendre = registrePret ? accompagnantsDuDernierSejour({ sejours, occupants: occupants.rows, sejour: s }) : [];
  const champ = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.value }));
  const coche = (k) => (ev) => setF((p) => ({ ...p, [k]: ev.target.checked }));
  // Remplit les champs vides depuis le dernier passage de la fiche hôte, une
  // fois le registre lu. Rend le formulaire et le passage utilisé (ou null).
  const avecPassage = (form0, hoteId, ho) => {
    const passage = registrePret && hoteId ? dernierPassage(occupants.rows, hoteId, s.id) : null;
    const complet = completerFormulaire(form0, ho, passage);
    const utile = passage && CHAMPS_REPRIS.some((k) => complet[k] !== form0[k] && complet[k] === passage[k]);
    return { complet, passage: utile ? passage : null };
  };
  const ouvrir = (occupant) => {
    setErreur('');
    setReprise(null);
    setForm({ occupant });
    if (occupant) { setOrigine(null); setF({ ...occupant, hoteId: occupant.hoteId || '' }); return; }
    const ho = mesOccupants.length ? null : hote;
    const { complet, passage } = avecPassage(vide(s, ho), ho?.id, ho);
    setOrigine(passage ? passage.arrivee : null);
    setF(complet);
  };
  const choisirFiche = (id) => {
    const ho = hotes.find((x) => x.id === id);
    // La fiche hôte garde la priorité pour l'identité, comme avant le lot 13 ;
    // le domicile et la pièce ne remplissent que des champs vides, et jamais
    // pour une personne ouverte par « Modifier ».
    const base = { ...f, hoteId: id, ...(ho ? { prenom: ho.prenom, nom: ho.nom, dateNaissance: ho.dateNaissance || f.dateNaissance, nationalite: ho.nationalite || f.nationalite } : {}) };
    if (form?.occupant || !ho) { setF(base); return; }
    const { complet, passage } = avecPassage(base, id, ho);
    if (passage) setOrigine(passage.arrivee);
    setF(complet);
  };

  const ouvrirReprise = () => {
    setErreur('');
    setReprise({ coches: new Set(aReprendre.map((o) => o.id)) });
  };
  const basculer = (id) => setReprise((p) => {
    const coches = new Set(p.coches);
    if (coches.has(id)) coches.delete(id); else coches.add(id);
    return { coches };
  });
  // Inscrit les personnes cochées, une à une, aux dates du séjour courant,
  // sans exonération. La liste se recalcule depuis occupants.rows : une
  // personne déjà ajoutée n'y figure plus et ne s'inscrit pas deux fois.
  const ajouterReprise = async () => {
    if (verrou.current) return;
    verrou.current = true;
    setErreur('');
    setEnCours(true);
    const choisies = aReprendre.filter((o) => reprise.coches.has(o.id));
    let ajoutees = 0;
    let premiereErreur = '';
    for (const o of choisies) {
      const res = await occupants.inserer({
        sejour_id: s.id, hote_id: o.hoteId || null, prenom: o.prenom.trim() || null, nom: o.nom.trim() || null, date_naissance: o.dateNaissance || null,
        nationalite: o.nationalite.trim() || null, domicile_adresse: o.domicileAdresse.trim() || null, domicile_localite: o.domicileLocalite.trim() || null,
        domicile_pays: o.domicilePays.trim() || null, piece_type: o.pieceType || null, piece_numero: o.pieceNumero.trim() || null,
        arrivee: s.arrivee, depart: s.depart, exonere_taxe: false, exonere_motif: null,
      });
      if (res.error) { if (!premiereErreur) premiereErreur = res.error; } else ajoutees += 1;
    }
    setEnCours(false);
    verrou.current = false;
    if (!premiereErreur) {
      notify(ajoutees > 1 ? `${ajoutees} personnes ajoutées au registre.` : 'Personne ajoutée au registre.', 'success');
      setReprise(null);
      return;
    }
    notify(`${ajoutees} sur ${choisies.length} ajoutées au registre.`, 'warning');
    setErreur(`${ajoutees > 1 ? `${ajoutees} personnes ajoutées` : `${ajoutees} personne ajoutée`}. ${premiereErreur}`);
  };

  const enregistrer = async () => {
    setErreur('');
    if (!`${f.prenom}${f.nom}`.trim()) { setErreur('Le nom ou le prénom est obligatoire.'); return; }
    if (f.arrivee < s.arrivee || f.depart > s.depart || f.depart <= f.arrivee) { setErreur('Les dates de la personne doivent rester dans celles du séjour.'); return; }
    setEnCours(true);
    const valeurs = {
      sejour_id: s.id, hote_id: f.hoteId || null, prenom: f.prenom.trim() || null, nom: f.nom.trim() || null, date_naissance: f.dateNaissance || null,
      nationalite: f.nationalite.trim() || null, domicile_adresse: f.domicileAdresse.trim() || null, domicile_localite: f.domicileLocalite.trim() || null,
      domicile_pays: f.domicilePays.trim() || null, piece_type: f.pieceType || null, piece_numero: f.pieceNumero.trim() || null,
      arrivee: f.arrivee, depart: f.depart, exonere_taxe: !!f.exonereTaxe, exonere_motif: f.exonereTaxe ? f.exonereMotif.trim() || null : null,
    };
    const res = form.occupant ? await occupants.modifier(form.occupant.id, valeurs) : await occupants.inserer(valeurs);
    setEnCours(false);
    if (res.error) { setErreur(res.error); return; }
    notify(form.occupant ? 'Personne modifiée.' : 'Personne ajoutée au registre.', 'success');
    setForm(null);
  };

  const supprimer = async (o) => {
    setErreur('');
    const r = await occupants.supprimer(o.id);
    if (r.error) setErreur(r.error); else notify('Personne retirée du registre.', 'success');
  };

  const bulletin = async (liste) => {
    setErreur('');
    try {
      const { pdfUtils } = await import('../../services/pdf.js');
      await pdfUtils.exportFichePolicePdf({
        commune: reglages?.commune || '', chambre: chambre?.numero || '', arrivee: s.arrivee, depart: s.depart,
        accompagnants: `${Math.max(0, personnes(s) - 1)}`,
        occupants: liste.map((o) => ({ ...o })),
      }, { etablissement, filename: `bulletin-${(s.nomHote || 'sejour').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${s.arrivee}.pdf` });
    } catch (e) {
      setErreur(e?.message || 'Impression impossible.');
    }
  };

  const candidats = hotes.filter((x) => !x.archive).sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr')).slice(0, 500);

  return (
    <Fenetre
      id="sejour-occupants"
      titre="Personnes hébergées"
      sousTitre={<><span data-no-translate>{s.nomHote}</span>, <span data-no-translate>{dateCourte(s.arrivee)} - {dateCourte(s.depart)}</span>, <span>{personnes(s)}</span> <span>{personnes(s) > 1 ? 'personnes attendues' : 'personne attendue'}</span></>}
      onClose={onClose}
      largeur={680}
      pied={form ? (
        <>
          <button type="button" style={st.secondaire} onClick={() => setForm(null)}>Annuler</button>
          <button type="button" style={st.primaire} onClick={enregistrer} disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
        </>
      ) : reprise ? (
        <>
          <button type="button" style={st.secondaire} onClick={() => { setReprise(null); setErreur(''); }}>Annuler</button>
          <button type="button" style={st.primaire} onClick={ajouterReprise} disabled={enCours || !aReprendre.some((o) => reprise.coches.has(o.id))}>{enCours ? 'Enregistrement…' : 'Ajouter au registre'}</button>
        </>
      ) : (
        <>
          {mesOccupants.length > 0 && <button type="button" style={st.secondaire} onClick={() => bulletin(mesOccupants)}>Bulletins d'arrivée</button>}
          {peutGerer && aReprendre.length > 0 && <button type="button" style={st.secondaire} onClick={ouvrirReprise}>Reprendre le dernier séjour</button>}
          {peutGerer && <button type="button" style={st.primaire} onClick={() => ouvrir(null)}>Ajouter une personne</button>}
        </>
      )}
    >
      {!form && reprise && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.45 }}>Vérifiez la pièce d'identité de chaque personne avant d'enregistrer.</div>
          {aReprendre.length === 0 && <div style={h.detail}>Toutes les personnes du dernier séjour sont inscrites.</div>}
          {aReprendre.map((o) => (
            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--ligne-aeree)', padding: '6px 0', cursor: 'pointer', minWidth: 0, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--rule-soft)' }}>
              <input type="checkbox" checked={reprise.coches.has(o.id)} onChange={() => basculer(o.id)} disabled={enCours} style={{ width: 20, height: 20, flex: '0 0 auto', accentColor: 'var(--accent)' }} />
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                <span style={{ ...h.nomHote, display: 'block', whiteSpace: 'normal' }} data-no-translate>{`${o.prenom} ${o.nom}`.trim()}</span>
                <span style={{ ...h.detail, display: 'block', overflowWrap: 'anywhere' }} data-no-translate>{resumeLigne(o)}</span>
              </span>
            </label>
          ))}
          {tronque && <div style={h.erreur}>Le registre est trop long pour être lu en entier. Vérifiez les chiffres.</div>}
        </div>
      )}
      {!form && !reprise && mesOccupants.length === 0 && <div style={h.vide}>Personne n'est encore inscrite au registre pour ce séjour.</div>}
      {!form && !reprise && mesOccupants.map((o) => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: 'var(--border)' }}>
          <span style={{ flex: '1 1 200px', minWidth: 0 }}>
            <span style={h.nomHote} data-no-translate>{`${o.prenom} ${o.nom}`.trim()}</span>
            <span style={{ ...h.detail, display: 'block' }} data-no-translate>
              {[o.dateNaissance ? dateCourte(o.dateNaissance) : '', o.nationalite, [o.domicileLocalite, o.domicilePays].filter(Boolean).join(', '), o.pieceType ? `${libelleDe(PIECES_IDENTITE, o.pieceType)} ${o.pieceNumero}`.trim() : ''].filter(Boolean).join(' / ')}
            </span>
            <span style={{ ...h.detail, display: 'block' }}><span data-no-translate>{dateCourte(o.arrivee)} - {dateCourte(o.depart)}</span>{o.exonereTaxe && <> <span>(exonéré de taxe)</span></>}</span>
          </span>
          {o.hoteId && <Puce ton="info">Fiche hôte</Puce>}
          <Btn small onClick={() => bulletin([o])}>Bulletin</Btn>
          {peutGerer && <Btn small onClick={() => ouvrir(o)}>Modifier</Btn>}
          {peutSupprimer && <Btn small onClick={() => supprimer(o)}>Retirer</Btn>}
        </div>
      ))}

      {form && f && (
        <div style={h.grille}>
          <Champ label="Fiche hôte">
            <select style={h.saisie} value={f.hoteId} onChange={(ev) => choisirFiche(ev.target.value)} data-no-translate>
              <option value="">{'Aucune'}</option>
              {candidats.map((x) => <option key={x.id} value={x.id}>{nomHote(x)}</option>)}
            </select>
          </Champ>
          <Champ label="Prénom"><input style={h.saisie} value={f.prenom} onChange={champ('prenom')} autoFocus /></Champ>
          <Champ label="Nom"><input style={h.saisie} value={f.nom} onChange={champ('nom')} /></Champ>
          <Champ label="Date de naissance"><input type="date" style={h.saisie} value={f.dateNaissance} onChange={champ('dateNaissance')} /></Champ>
          <Champ label="Nationalité"><input style={h.saisie} value={f.nationalite} onChange={champ('nationalite')} /></Champ>
          <Champ label="Adresse de domicile" large><input style={h.saisie} value={f.domicileAdresse} onChange={champ('domicileAdresse')} /></Champ>
          <Champ label="Localité"><input style={h.saisie} value={f.domicileLocalite} onChange={champ('domicileLocalite')} /></Champ>
          <Champ label="Pays de domicile"><input style={h.saisie} value={f.domicilePays} onChange={champ('domicilePays')} placeholder="CH, DE, FR…" /></Champ>
          <Champ label="Pièce d'identité">
            <select style={h.saisie} value={f.pieceType} onChange={champ('pieceType')}>
              {PIECES_IDENTITE.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Champ>
          <Champ label="Numéro de la pièce"><input style={h.saisie} value={f.pieceNumero} onChange={champ('pieceNumero')} /></Champ>
          <Champ label="Arrivée"><input type="date" style={h.saisie} min={s.arrivee} max={s.depart} value={f.arrivee} onChange={champ('arrivee')} /></Champ>
          <Champ label="Départ"><input type="date" style={h.saisie} min={s.arrivee} max={s.depart} value={f.depart} onChange={champ('depart')} /></Champ>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={!!f.exonereTaxe} onChange={coche('exonereTaxe')} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 14, color: 'var(--text)' }}>Exonéré de la taxe de séjour</span>
          </label>
          {f.exonereTaxe && <Champ label="Motif de l'exonération" large><input style={h.saisie} value={f.exonereMotif} onChange={champ('exonereMotif')} placeholder="Résident de la commune, chauffeur, accompagnant médical…" /></Champ>}
          {origine && (
            <div style={{ ...h.detail, gridColumn: '1 / -1' }}>
              <span>Ces données viennent du séjour du</span> <span data-no-translate>{`${dateCourte(origine)}.`}</span> <span>Vérifiez-les avec la personne.</span>
            </div>
          )}
          {origine && tronque && <div style={{ ...h.erreur, gridColumn: '1 / -1' }}>Le registre est trop long pour être lu en entier. Vérifiez les chiffres.</div>}
        </div>
      )}
      {erreur && <div style={h.erreur} role="alert">{erreur}</div>}
    </Fenetre>
  );
}
