import { ArrowLeft } from 'lucide-react';
import { Btn } from '../../components/ui/index.jsx';
import PhoneLink from '../../components/PhoneLink.jsx';
import { roles as roleConfig } from '../moduleConfig.js';
import { fullName, initialsOf } from './conversations.js';
import { sm } from './messagerie.styles.js';

// Fiche d'une personne (vue Contacts) : nom, rôle, numéro seulement si la base
// le rend (useTeamPhones : consultant et patron), puis les gestes vers elle.
// Écrire seulement pour l'instant ; Vocal (lot C3) et Appeler (lot C4) se
// rangeront à sa suite, empilés au téléphone, en rangée au-delà.
// Au téléphone, la fiche est un calque : « Retour » la referme, comme le geste
// retour (useBackLayer dans Messages.jsx). À la tablette et à l'ordinateur,
// elle prend la colonne de droite.
export default function FicheContact({ profile, tel, onEcrire, onRetour, empile = false, cible = 44 }) {
  const role = roleConfig[profile?.role] || { label: profile?.role || '' };
  return (
    <section role="region" aria-label="Fiche de contact" style={sf.racine}>
      {onRetour && (
        <div style={sm.filTete}>
          <Btn variant="ghost" onClick={onRetour} style={sm.retour}>
            <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Retour</span>
          </Btn>
        </div>
      )}
      <div style={{ ...sf.corps, padding: empile ? '20px 14px' : 24 }}>
        <span style={sf.pastille} data-no-translate>{initialsOf(profile)}</span>
        <div style={sf.nom} data-no-translate>{fullName(profile)}</div>
        <div style={sf.role}>{role.label}</div>
        {tel ? (
          <div style={sf.tel}>
            <span style={sf.telLibelle}>Téléphone</span>
            <PhoneLink tel={tel} style={{ ...sf.telLien, minHeight: cible }} />
          </div>
        ) : null}
        <div style={empile ? sf.actionsEmpilees : sf.actions}>
          <Btn variant="primary" onClick={onEcrire} style={{ minHeight: cible, ...(empile ? { width: '100%' } : null) }}>Écrire</Btn>
        </div>
      </div>
    </section>
  );
}

const sf = {
  racine: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, flex: 1 },
  corps: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0 },
  pastille: { width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--selection)', color: 'var(--text2)', fontWeight: 'var(--g3)', fontSize: 'var(--t3)', flexShrink: 0, marginBottom: 8 },
  nom: { fontSize: 'var(--t4)', fontWeight: 'var(--g3)', color: 'var(--text)', maxWidth: '100%', overflowWrap: 'break-word' },
  role: { fontSize: 'var(--t2)', color: 'var(--text2)' },
  tel: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 },
  telLibelle: { fontSize: 'var(--t1)', color: 'var(--text2)' },
  telLien: { display: 'inline-flex', alignItems: 'center', color: 'var(--lien)', fontSize: 'var(--t3)', fontWeight: 'var(--g2)' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  actionsEmpilees: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20, alignSelf: 'stretch' },
};
