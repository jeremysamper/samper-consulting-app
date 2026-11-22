import PosConnectionBar from './components/PosConnectionBar.jsx';

// Section « Ventes POS » de la page des réglages (plan 15, lot 2) : la barre
// de connexion de la caisse Lightspeed telle quelle (état de la connexion,
// dernière synchro, synchroniser, reconnecter). Garde : la direction de la
// maison, les rôles qui synchronisent (consultant, patron, resp_cuisine) ; la
// connexion elle-même reste au consultant et au patron, dans la barre.
export default function SectionReglagesPos({ user, etablissement, signaler }) {
  return <PosConnectionBar etablissement={etablissement} user={user} onSynced={() => signaler?.()} />;
}
