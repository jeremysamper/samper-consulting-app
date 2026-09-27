import {
  Check, DoorOpen, Globe, HeartPulse, Leaf, NotebookPen, Pencil, UserRound, X,
} from 'lucide-react';
import {
  Avatar, BoutonFermer, Modale, Puce, dureeLisible, heureFin, jourComplet, metaStatutRdv, nomClient, st,
} from './spaUi.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Un rendez-vous ouvert depuis l'agenda. L'état du soin se lit comme un
// parcours (prévu → confirmé → terminé) ; l'action principale suit le moment :
// « Confirmer » avant le jour J, « Terminer la séance » (compte rendu) ensuite.
// Annuler et absent ne suppriment rien : le rendez-vous reste visible, barré,
// et se rétablit d'un tap.
//
// Une DEMANDE venue du site du client se confirme ou se refuse ici ; le client
// en est prévenu par e-mail (onDemande).
// ─────────────────────────────────────────────────────────────────────────────

const ETAPES = [
  { id: 'prevue', label: 'Prévu' },
  { id: 'confirmee', label: 'Confirmé' },
  { id: 'terminee', label: 'Terminé' },
];

export default function RendezVousDetail({
  reservation: r, client, seanceExiste, peutModifier, aujourdhui,
  onStatut, onDemande, onTerminer, onModifier, onFicheClient, onClose,
}) {
  const demande = r.statut === 'demande';
  const m = metaStatutRdv(r.statut);
  const clos = ['annulee', 'absent'].includes(r.statut);
  const passeOuJour = r.dateRdv <= aujourdhui;
  const rang = ETAPES.findIndex((e) => e.id === r.statut);

  const entete = (
    <div style={s.entete}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={st.surTitre}>{capitaliser(jourComplet(r.dateRdv))}</div>
          <div style={s.heures}>{r.heureDebut} <span style={{ color: 'var(--spa-ink3)' }}>à</span> {heureFin(r.heureDebut, r.dureeMin)}</div>
          <div style={s.soin} data-no-translate>{r.soinLibelle || 'Soin à préciser'}</div>
        </div>
        <BoutonFermer onClose={onClose} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        <Puce>{dureeLisible(r.dureeMin)}</Puce>
        {r.praticien && <Puce icone={UserRound} ton="mizu"><span data-no-translate>{r.praticien}</span></Puce>}
        {r.cabine && <Puce icone={DoorOpen}><span data-no-translate>{r.cabine}</span></Puce>}
        {r.origine === 'en_ligne' && <Puce icone={Globe} ton="kin">Réservé en ligne</Puce>}
        {(clos || demande) && <span style={{ ...st.puce, background: m.fond, color: m.texte }}>{m.label}</span>}
      </div>
    </div>
  );

  return (
    <Modale
      titre={`${r.heureDebut} ${nomClient(client)}`}
      entete={entete}
      onClose={onClose}
      largeur={580}
      feuille
      pied={peutModifier ? (
        clos ? (
          <button type="button" onClick={() => onStatut(r, 'prevue')} style={st.principal}>Rétablir le rendez-vous</button>
        ) : demande ? (
          <>
            <button type="button" onClick={() => onDemande(r, 'refus')} style={st.discret}>
              <X size={16} strokeWidth={1.8} aria-hidden="true" /> Refuser
            </button>
            <button type="button" onClick={() => onModifier(r)} style={st.secondaire}>
              <Pencil size={16} strokeWidth={1.8} aria-hidden="true" /> Modifier
            </button>
            <button type="button" onClick={() => onDemande(r, 'confirmation')} style={st.principal}>
              <Check size={18} strokeWidth={2} aria-hidden="true" /> Confirmer la demande
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onStatut(r, 'annulee')} style={st.discret}>Annuler</button>
            {passeOuJour && r.statut !== 'terminee' && (
              <button type="button" onClick={() => onStatut(r, 'absent')} style={st.discret}>Absent</button>
            )}
            <button type="button" onClick={() => onModifier(r)} style={st.secondaire}>
              <Pencil size={16} strokeWidth={1.8} aria-hidden="true" /> Modifier
            </button>
            {r.statut === 'prevue' && !passeOuJour ? (
              <button type="button" onClick={() => onStatut(r, 'confirmee')} style={st.principal}>
                <Check size={18} strokeWidth={2} aria-hidden="true" /> Confirmer
              </button>
            ) : (
              <button type="button" onClick={() => onTerminer(r)} style={st.principal}>
                <NotebookPen size={17} strokeWidth={1.8} aria-hidden="true" />
                {r.statut === 'terminee' || seanceExiste ? 'Compte rendu' : 'Terminer la séance'}
              </button>
            )}
          </>
        )
      ) : null}
    >
      {/* ── Parcours du soin ── */}
      {demande && (
        <div style={st.encartAttention}>
          <Globe size={18} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--spa-kin)' }} />
          <span>
            <strong>Demande reçue depuis le site.</strong> Le client attend votre réponse : en confirmant ou en refusant,
            il reçoit un e-mail. Le praticien a été attribué automatiquement, vous pouvez le changer avec « Modifier ».
          </span>
        </div>
      )}

      {!clos && !demande && (
        <ol style={s.parcours} aria-label={`État : ${m.label}`}>
          {ETAPES.map((e, i) => {
            const fait = i <= rang;
            const cliquable = peutModifier && e.id === 'confirmee' && r.statut === 'prevue';
            return (
              <li key={e.id} style={s.etape}>
                {i > 0 && <span aria-hidden="true" style={{ ...s.trait, background: fait ? 'var(--spa-mizu)' : 'var(--spa-line)' }} />}
                <span aria-hidden="true" style={{ ...s.pastille, ...(fait ? s.pastilleFaite : null) }}>
                  {fait && <Check size={12} strokeWidth={3} />}
                </span>
                {cliquable
                  ? <button type="button" onClick={() => onStatut(r, 'confirmee')} style={{ ...st.lien, minHeight: 28, padding: 0 }}>Confirmer</button>
                  : <span style={{ fontSize: 12, fontWeight: 600, color: fait ? 'var(--spa-ink)' : 'var(--spa-ink3)' }}>{e.label}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {/* ── Le client ── */}
      {client && (
        <button type="button" onClick={() => onFicheClient(client)} className="spa-carte-action" style={{ ...st.ligne, boxShadow: 'none' }}>
          <Avatar client={client} taille={46} />
          <span style={{ flex: '1 1 auto', minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 18 }} data-no-translate>{nomClient(client)}</span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--spa-ink2)' }} data-no-translate>
              {[client.telephone, client.email].filter(Boolean).join(', ') || 'Pas de coordonnées'}
            </span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--spa-mizu)', flexShrink: 0 }}>Fiche</span>
        </button>
      )}

      {client?.notesSante && (
        <div style={st.encartSante}>
          <HeartPulse size={18} strokeWidth={1.8} color="var(--spa-sakura)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>Santé :</strong> {client.notesSante}</span>
        </div>
      )}
      {client?.preferences && (
        <div style={st.encartInfo}>
          <Leaf size={18} strokeWidth={1.8} color="var(--spa-mizu)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span><strong>Préférences :</strong> {client.preferences}</span>
        </div>
      )}
      {r.notes && <div style={{ fontSize: 14, color: 'var(--spa-ink2)', lineHeight: 1.55 }}><strong style={{ color: 'var(--spa-ink)' }}>Note :</strong> {r.notes}</div>}
    </Modale>
  );
}

const capitaliser = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

const s = {
  entete: {
    padding: '20px 22px 18px', background: 'var(--spa-hero)', borderBottom: '1px solid var(--spa-line)', flexShrink: 0,
  },
  heures: { fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.15, color: 'var(--spa-ink)', fontVariantNumeric: 'tabular-nums' },
  soin: { fontSize: 16, color: 'var(--spa-ink2)', marginTop: 2 },
  parcours: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'flex-start' },
  etape: { position: 'relative', flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  trait: { position: 'absolute', top: 10, right: '50%', width: '100%', height: 2, zIndex: 0 },
  pastille: {
    position: 'relative', zIndex: 1, width: 22, height: 22, borderRadius: 11, boxSizing: 'border-box',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--spa-surface)', border: '2px solid var(--spa-line2)', color: 'var(--spa-on-mizu)',
  },
  pastilleFaite: { background: 'var(--spa-mizu)', border: '2px solid var(--spa-mizu)' },
};
