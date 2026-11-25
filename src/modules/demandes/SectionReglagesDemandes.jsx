import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { notify } from '../../components/toast/index.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { CATEGORIES_DEMANDE_DEFAUT } from '../../utils/reglagesModules.js';
import { Ligne, ui } from '../compte/sections/reglagesUi.jsx';
import { EtatModule, st as stm } from '../compte/sections/reglagesModulesUi.jsx';
import { POLES, PRIORITES, libelleDe } from '../hebergement/hotelData.js';
import { delaiLisible } from './demandesCourantes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Section « Demandes » de la page des réglages (plan 15, lot 6b) : les
// demandes courantes de la maison. Chacune a un pôle, une priorité et un
// délai ; un toucher dans le formulaire « Nouvelle demande » remplit tout, et
// l'échéance se calcule depuis le délai.
// reglages_modules, module 'demandes', categories. Sans réglage : la liste
// d'origine (CATEGORIES_DEMANDE_DEFAUT). Écriture : direction de la maison
// (RLS) ; la section n'est proposée qu'à la direction de l'hôtel.
// ─────────────────────────────────────────────────────────────────────────────

const VIDE = { libelle: '', pole: 'etages', priorite: 'normale', delai: '30' };

export default function SectionReglagesDemandes({ etablissement }) {
  const etabId = etablissement?.id || null;
  const { reglages, status, enregistrer } = useReglagesModule(etabId, 'demandes');
  const [enCours, setEnCours] = React.useState(false);
  const [f, setF] = React.useState(VIDE);
  if (!etabId) return null;
  if (status !== 'ready') return <EtatModule status={status} />;

  const ecrire = async (categories) => {
    if (enCours) return false;
    setEnCours(true);
    const { error } = await enregistrer({ categories });
    setEnCours(false);
    if (error) { notify(error, 'error'); return false; }
    return true;
  };

  const liste = reglages.categories;
  const ajouter = async () => {
    const libelle = f.libelle.trim();
    if (!libelle) return;
    if (libelle.length > 60) { notify('60 caractères au plus.', 'warning'); return; }
    if (liste.some((c) => c.libelle.toLowerCase() === libelle.toLowerCase())) { notify('Cette demande est déjà dans la liste.', 'warning'); return; }
    if (liste.length >= 40) { notify('40 demandes au plus.', 'warning'); return; }
    const delai = String(f.delai).trim() === '' ? null : Number(f.delai);
    if (delai != null && (!Number.isInteger(delai) || delai < 5 || delai > 10080)) { notify('Un délai entre 5 et 10 080 minutes, ou vide.', 'warning'); return; }
    if (await ecrire([...liste, { libelle, pole: f.pole, priorite: f.priorite, delai_minutes: delai }])) setF({ ...VIDE, pole: f.pole });
  };

  return (
    <div style={ui.liste} data-section-reglages="demandes">
      <Ligne colonne titre="Demandes courantes" aide="Elles s'affichent en tête du formulaire « Nouvelle demande ». Un toucher remplit la demande, son pôle, sa priorité et son échéance.">
        <div style={stm.liste}>
          {liste.length === 0 && <p style={stm.vide}>Aucune demande courante : le formulaire s'ouvre vide.</p>}
          {liste.map((c) => (
            <div key={c.libelle} style={stm.ligne} data-valeur-liste="">
              <span style={st.texte}>
                <span style={stm.texte} data-no-translate="">{c.libelle}</span>
                <span style={st.detail}>
                  <span>{libelleDe(POLES, c.pole)}</span>, <span>{libelleDe(PRIORITES, c.priorite).toLowerCase()}</span>
                  {c.delai_minutes ? <>, <span>dans</span> <span data-no-translate="">{delaiLisible(c.delai_minutes)}</span></> : null}
                </span>
              </span>
              <Btn variant="ghost" disabled={enCours} style={stm.btn44} onClick={() => ecrire(liste.filter((x) => x.libelle !== c.libelle))}>Retirer</Btn>
            </div>
          ))}
          <div style={stm.ajout}>
            <input type="text" value={f.libelle} maxLength={60} aria-label="Nouvelle demande courante" placeholder="Peignoir en plus"
              onChange={(e) => setF((p) => ({ ...p, libelle: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') ajouter(); }} style={stm.champ} />
            <select aria-label="Pôle" value={f.pole} onChange={(e) => setF((p) => ({ ...p, pole: e.target.value }))} style={{ ...stm.champ, flex: '0 1 160px' }}>
              {POLES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <select aria-label="Priorité" value={f.priorite} onChange={(e) => setF((p) => ({ ...p, priorite: e.target.value }))} style={{ ...stm.champ, flex: '0 1 140px' }}>
              {PRIORITES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <span style={st.delai}>
              <input type="text" inputMode="numeric" value={f.delai} aria-label="Délai en minutes" onChange={(e) => setF((p) => ({ ...p, delai: e.target.value }))}
                style={{ ...stm.champ, width: 88, flex: '0 0 auto', textAlign: 'right', fontFamily: 'var(--font-num)' }} />
              <span style={stm.unite}>min</span>
            </span>
            <Btn variant="primary" disabled={enCours || !f.libelle.trim()} style={stm.btn44} onClick={ajouter}>Ajouter</Btn>
          </div>
        </div>
      </Ligne>
      <Ligne colonne derniere titre="Liste d'origine" aide="Les neuf demandes proposées avant tout réglage.">
        <div>
          <Btn variant="ghost" disabled={enCours || !reglages.categoriesReglees} style={ui.btn44} onClick={() => ecrire(CATEGORIES_DEMANDE_DEFAUT)}>Reprendre la liste d'origine</Btn>
        </div>
      </Ligne>
    </div>
  );
}

const st = {
  texte: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  delai: { display: 'inline-flex', alignItems: 'center', gap: 8 },
};
