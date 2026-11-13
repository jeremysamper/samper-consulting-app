import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import { formatDuree } from './vocal.js';

// Lecteur d'un message vocal : un bouton (Écouter, Pause), le temps écoulé sur
// la durée. Sert dans une bulle du fil et dans la réécoute avant l'envoi, page
// et panneau. Un seul vocal joue à la fois dans toute l'app.
//
//   src      adresse à lire (URL signée, ou blob: pour la réécoute) ; absente,
//            le toucher la demande par onCharger, puis lance la lecture
//   duree    durée enregistrée, en secondes
//   cible    hauteur d'une cible d'action (cibleDe)
let enCours = null;

export default function BulleVocale({ src, duree, onCharger, cible }) {
  const audioRef = React.useRef(null);
  const [lecture, setLecture] = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [illisible, setIllisible] = React.useState(false);
  const [attente, setAttente] = React.useState(false);

  React.useEffect(() => () => {
    const a = audioRef.current;
    if (a && enCours === a) enCours = null;
    if (a) a.pause();
  }, []);

  const jouer = (a) => {
    if (enCours && enCours !== a) enCours.pause();
    enCours = a;
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch((err) => {
        if (err?.name === 'NotSupportedError') setIllisible(true);
        // NotAllowedError : la lecture attend un nouveau toucher.
      });
    }
  };

  const basculer = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) { a.pause(); return; }
    if (a.getAttribute('src')) { jouer(a); return; }
    if (!onCharger) return;
    setAttente(true);
    try {
      const url = await onCharger();
      if (!url) { setIllisible(true); return; }
      a.src = url;
      jouer(a);
    } catch {
      setIllisible(true);
    } finally { setAttente(false); }
  };

  const total = duree || 0;
  return (
    <span style={sv.lecteur}>
      {illisible ? (
        <span style={sv.illisible}>Lecture impossible sur cet appareil</span>
      ) : (
        <Btn
          variant="ghost"
          onClick={basculer}
          disabled={attente}
          style={{ ...sv.bouton, minHeight: cible }}
        >
          {lecture ? 'Pause' : 'Écouter'}
        </Btn>
      )}
      <span style={sv.temps} data-no-translate>
        {lecture || position > 0 ? `${formatDuree(position)} / ${formatDuree(total)}` : formatDuree(total)}
      </span>
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="none"
        onPlay={() => setLecture(true)}
        onPause={() => setLecture(false)}
        onEnded={() => { setLecture(false); setPosition(0); }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime || 0)}
        onError={() => { if (audioRef.current?.getAttribute('src')) setIllisible(true); }}
      />
    </span>
  );
}

const sv = {
  lecteur: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' },
  bouton: { flexShrink: 0, fontSize: 'var(--t2)' },
  temps: { fontFamily: 'var(--font-num)', fontWeight: 'var(--g-chiffre)', fontSize: 'var(--t2)', color: 'var(--text2)', whiteSpace: 'nowrap' },
  illisible: { fontSize: 'var(--t1)', color: 'var(--text2)', fontStyle: 'italic' },
};
