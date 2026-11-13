import React from 'react';
import { Btn } from '../../../components/ui/index.jsx';
import SamperMark from '../../../components/brand/SamperMark.jsx';
import { useShell } from '../../../layouts/ShellContext.js';

// ─────────────────────────────────────────────────────────────────────────────
// Deux réglages portés par la coque, à l'ordinateur, pour le consultant :
// l'ordre du menu et le logo de l'établissement. Les gestes sont ceux de la
// coque (AppLayout, par ShellContext), les mêmes écritures qu'avant.
//
//   Ordre du menu : la liste se range dans la barre latérale elle-même
//   (NavOrganizer) ; la section lance ce rangement, comme « Organiser le
//   menu » de Mon compte et de la palette.
//   Logo : changer ou retirer le logo, comme le menu du logo de la barre
//   latérale (mêmes limites : une image, 500 Ko au plus).
// ─────────────────────────────────────────────────────────────────────────────

export function SectionOrdreMenu() {
  const shell = useShell();
  const organiser = shell?.reglages?.organiserMenu;
  if (!organiser) return null;
  return (
    <div style={st.bloc}>
      <p style={st.texte}>
        Rangez les modules et leurs rubriques dans la barre latérale : glissez la poignée ou utilisez les flèches, puis « Terminé ». L'ordre vaut pour tous les comptes.
      </p>
      <div><Btn variant="primary" onClick={organiser} style={st.btn44}>Organiser le menu</Btn></div>
    </div>
  );
}

export function SectionLogo() {
  const shell = useShell();
  const logo = shell?.reglages?.logo;
  const fichierRef = React.useRef(null);
  if (!logo) return null;
  return (
    <div style={st.bloc}>
      <div style={st.rang}>
        <div style={st.apercu} aria-hidden="true">
          {logo.url
            ? <img src={logo.url} alt="" style={st.image} />
            : <SamperMark size={64} radius={0} title="Ritmo" style={{ width: '100%', height: '100%', display: 'block' }} />}
        </div>
        <p style={st.texte}>
          <span>Le logo de</span> <span data-no-translate="">{logo.nom || ''}</span> <span>dans la barre latérale, sur la page d'accueil et sur les factures.</span>
        </p>
      </div>
      <input ref={fichierRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={logo.onUpload} />
      <div style={st.actions}>
        <Btn variant="primary" onClick={() => fichierRef.current?.click()} style={st.btn44}>Changer le logo</Btn>
        {logo.url && <Btn variant="danger" onClick={logo.onRemove} style={st.btn44}>Retirer le logo</Btn>}
      </div>
      <p style={st.note}>Max 500 Ko. PNG, JPG ou SVG.</p>
    </div>
  );
}

const st = {
  bloc: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 },
  rang: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  apercu: { width: 64, height: 64, borderRadius: 'var(--r)', overflow: 'hidden', flexShrink: 0 },
  image: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  texte: { margin: 0, flex: '1 1 240px', fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.5 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  note: { margin: 0, fontSize: 'var(--t1)', color: 'var(--text2)' },
  btn44: { minHeight: 44 },
};
