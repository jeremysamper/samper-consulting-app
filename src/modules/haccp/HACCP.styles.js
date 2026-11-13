export const hs = {
  root:{display:'flex',flexDirection:'column',gap:14},
  toolbar:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'},
  tab:{padding:'8px 16px',border:'1px solid var(--border)',borderRadius: 'var(--r)',background:'var(--surface)',color:'var(--text2)',fontSize: 'var(--t2)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)'},
  datePicker:{padding:'7px 10px',borderWidth:1,borderStyle:'solid',borderColor:'var(--champ-bord)',borderRadius: 'var(--r)',fontSize: 'var(--t2)',color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)'},
  // Action principale de l'écran : le seul aplat d'accent.
  addBtn:{padding:'8px 16px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius: 'var(--r)',fontSize: 'var(--t2)',fontWeight: 'var(--g3)',cursor:'pointer',fontFamily:'var(--font)'},
  // Bouton secondaire : jetons --btn-*, contour en borderColor (lint:borders).
  exportBtn:{padding:'8px 14px',background:'var(--btn-fond)',borderWidth:1,borderStyle:'solid',borderColor:'var(--btn-bord)',color:'var(--btn-texte)',borderRadius: 'var(--r)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)'},
  sectionTitle:{fontSize: 'var(--t1)',fontWeight: 'var(--g3)',color:'var(--text2)'},
  zoneGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'4px 40px'},
  zoneTile:{borderRadius: 'var(--r)',padding:'14px 16px',display:'flex',alignItems:'center',gap:12},
  zoneIcon:{fontSize: 'var(--t5)',flexShrink:0},
  zoneInfo:{flex:1,minWidth:0},
  zoneName:{fontSize: 'var(--t2)',fontWeight: 'var(--g2)',color:'var(--text)',lineHeight:1.3},
  zoneCible:{fontSize: 'var(--t1)',color:'var(--text2)',marginTop:3},
  zoneVal:{textAlign:'right',flexShrink:0},
  // Tableau d'un registre : un panneau (fond --zone, filet --rule-soft) que
  // l'élément marque data-cadre ; les lignes sur des filets doux.
  tableCard:{background:'var(--zone)',borderWidth:1,borderStyle:'solid',borderColor:'var(--rule-soft)',borderRadius:'var(--r)',overflow:'hidden'},
  tableCardHeader:{padding:'13px 18px',borderBottom:'1px solid var(--rule-soft)',fontSize: 'var(--t2)',fontWeight: 'var(--g3)',color:'var(--text)'},
  empty:{padding:'18px',color:'var(--text2)',fontSize: 'var(--t2)'},
  relHead:{display:'grid',gridTemplateColumns:'2fr 60px 90px 120px 110px 2fr',padding:'8px 18px',fontSize: 'var(--t1)',fontWeight: 'var(--g3)',color:'var(--text2)',borderBottom:'1px solid var(--rule-soft)',gap:10},
  relRow:{display:'grid',gridTemplateColumns:'2fr 60px 90px 120px 110px 2fr',padding:'11px 18px',borderBottom:'1px solid var(--rule-soft)',gap:10,alignItems:'center'},
  cell:{fontSize: 'var(--t2)',color:'var(--text)'},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16},
  modal:{background:'var(--surface)',borderRadius:'var(--r)',width:500,maxWidth:'100%',boxShadow:'var(--sh-lg)',maxHeight:'90vh',overflowY:'auto'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--rule-soft)',position:'sticky',top:0,background:'var(--surface)',zIndex:2},
  modalTitle:{fontWeight: 'var(--g3)',fontSize: 'var(--t3)',fontFamily: 'var(--font)',color:'var(--text)'},
  closeBtn:{background:'none',border:'none',fontSize: 'var(--t3)',cursor:'pointer',color:'var(--text2)'},
  modalBody:{padding:'20px 22px'},
  field:{display:'flex',flexDirection:'column',gap:6},
  fLabel:{fontSize: 'var(--t1)',fontWeight: 'var(--g2)',color:'var(--text2)'},
  // Champ : contour --champ-bord, fond de surface.
  fInput:{padding:'9px 12px',borderWidth:1,borderStyle:'solid',borderColor:'var(--champ-bord)',borderRadius: 'var(--r)',fontSize: 'var(--t2)',color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)',outline:'none',width:'100%',boxSizing:'border-box'},
  cancelBtn:{padding:'8px 16px',background:'var(--btn-fond)',borderWidth:1,borderStyle:'solid',borderColor:'var(--btn-bord)',color:'var(--btn-texte)',borderRadius: 'var(--r)',fontSize: 'var(--t2)',fontWeight: 'var(--g2)',cursor:'pointer',fontFamily:'var(--font)'},
  saveBtn:{padding:'9px 20px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius: 'var(--r)',fontSize: 'var(--t2)',fontWeight: 'var(--g3)',cursor:'pointer',fontFamily:'var(--font)'},

  // ─── Modale d'export des relevés : options de période (journalier / mensuel) ───
  // Un choix à l'habit du bouton secondaire.
  periodBtn:{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'12px 14px',background:'var(--btn-fond)',borderWidth:1,borderStyle:'solid',borderColor:'var(--btn-bord)',borderRadius: 'var(--r)',cursor:'pointer',fontFamily:'var(--font)',textAlign:'left'},

  // ─── Lien « Revoir l'aide », en bas de l'accueil ───
  // Un lien texte, 44 px au doigt, sans cadre.
  lienAide: { minHeight:44, padding:'8px 0', background:'none', border:'none', color: 'var(--lien)', fontFamily:'var(--font)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', textDecoration:'underline', textUnderlineOffset:3, cursor:'pointer' },

  // ─── Heures de relevé : puce de sélection d'une heure (ajout à la main) ───
  // Un bouton n'est pas une pilule ; l'heure choisie sur --selection, trait --onglet.
  creneauChip: { padding:'7px 12px', borderRadius: 'var(--r)', borderWidth:1, borderStyle:'solid', borderColor:'var(--btn-bord)', background:'var(--btn-fond)', color:'var(--btn-texte)', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', cursor:'pointer', fontFamily:'var(--font)', display:'inline-flex', alignItems:'center', gap:6 },
  creneauChipOn: { borderColor:'var(--onglet)', background:'var(--selection)', color:'var(--text)' },
};

export const hcfg = {
  // Chaque section des réglages est un Panneau (HACCP.jsx) ; son en-tête et
  // ses lignes sur des filets doux.
  sectionHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid var(--rule-soft)'},
  sectionTitle:{fontSize: 'var(--t2)',fontWeight: 'var(--g3)',color:'var(--text)',fontFamily: 'var(--font)'},
  sectionSub:{fontSize: 'var(--t1)',color:'var(--text2)',marginTop:2},
  row:{display:'flex',alignItems:'center',gap:12,padding:'12px 18px',borderBottom:'1px solid var(--rule-soft)',transition:'background .12s'},
  rowIcon:{width:36,height:36,borderRadius: 'var(--r)',background:'var(--selection)',display:'flex',alignItems:'center',justifyContent:'center',fontSize: 'var(--t4)',flexShrink:0},
  toggle:{width:40,height:22,borderRadius:11,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0},
  toggleThumb:{position:'absolute',top:2,width:18,height:18,borderRadius:9,background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'},
  editBtn:{padding:'5px 12px',background:'var(--btn-fond)',borderWidth:1,borderStyle:'solid',borderColor:'var(--btn-bord)',borderRadius: 'var(--r)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)',color:'var(--btn-texte)',cursor:'pointer',fontFamily:'var(--font)'},
  // Supprimer, sur chaque ligne : discret au repos, rouge au survol et au focus (classe btn-suppr-discret, app.css).
  deleteBtn:{padding:'5px 12px',background:'transparent',border:'1px solid transparent',borderRadius: 'var(--r)',fontSize: 'var(--t1)',fontWeight: 'var(--g2)',color:'var(--text3)',cursor:'pointer',fontFamily:'var(--font)'},
};
