export const hs = {
  root:{display:'flex',flexDirection:'column',gap:14},
  toolbar:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'},
  tab:{padding:'8px 16px',border:'1px solid var(--border)',borderRadius:8,background:'var(--surface)',color:'var(--text2)',fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  tabActive:{background:'var(--nav)',color:'#fff',borderColor:'var(--nav)'},
  datePicker:{padding:'7px 10px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--surface)',fontFamily:'var(--font)'},
  addBtn:{padding:'8px 16px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  exportBtn:{padding:'8px 14px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:12,cursor:'pointer',fontFamily:'var(--font)'},
  sectionTitle:{fontSize:12,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.5},
  zoneGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'4px 40px'},
  zoneTile:{borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:12},
  zoneIcon:{fontSize:24,flexShrink:0},
  zoneInfo:{flex:1,minWidth:0},
  zoneName:{fontSize:13,fontWeight:500,color:'var(--text)',lineHeight:1.3},
  zoneCible:{fontSize:11,color:'var(--text2)',marginTop:3},
  zoneVal:{textAlign:'right',flexShrink:0},
  tableCard:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)', boxShadow: 'var(--sh-xs)',overflow:'hidden'},
  tableCardHeader:{padding:'13px 18px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700,color:'var(--text)',background:'var(--bg)'},
  empty:{padding:'18px',color:'var(--text2)',fontSize:13},
  relHead:{display:'grid',gridTemplateColumns:'2fr 60px 90px 120px 110px 2fr',padding:'8px 18px',background:'var(--bg)',fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4,borderBottom:'1px solid var(--border)',gap:10},
  relRow:{display:'grid',gridTemplateColumns:'2fr 60px 90px 120px 110px 2fr',padding:'11px 18px',borderBottom:'1px solid var(--border)',gap:10,alignItems:'center'},
  cell:{fontSize:13,color:'var(--text)'},
  overlay:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16},
  modal:{background:'var(--surface)',borderRadius:14,width:500,maxWidth:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.2)',maxHeight:'90vh',overflowY:'auto'},
  modalHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid var(--border)',position:'sticky',top:0,background:'var(--surface)',zIndex:2},
  modalTitle:{fontWeight:700,fontSize:16,fontFamily:'var(--font-serif)',color:'var(--text)'},
  closeBtn:{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'var(--text2)'},
  modalBody:{padding:'20px 22px'},
  field:{display:'flex',flexDirection:'column',gap:6},
  fLabel:{fontSize:11,fontWeight:500,color:'var(--text2)',textTransform:'uppercase',letterSpacing:0.4},
  fInput:{padding:'9px 12px',border:'1px solid var(--border)',borderRadius:8,fontSize:13,color:'var(--text)',background:'var(--bg)',fontFamily:'var(--font)',outline:'none',width:'100%',boxSizing:'border-box'},
  cancelBtn:{padding:'8px 16px',background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text2)',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},
  saveBtn:{padding:'9px 20px',background:'var(--accent)',color:'var(--on-accent)',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',fontFamily:'var(--font)'},

  // ─── Modale d'export des relevés : options de période (journalier / mensuel) ───
  periodBtn:{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'12px 14px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,cursor:'pointer',fontFamily:'var(--font)',textAlign:'left'},

  // ─── Lien « Revoir l'aide », en bas de l'accueil ───
  // Un lien texte, 44 px au doigt, sans cadre.
  lienAide: { minHeight:44, padding:'8px 0', background:'none', border:'none', color:'var(--accent)', fontFamily:'var(--font)', fontSize:14, fontWeight:500, textDecoration:'underline', textUnderlineOffset:3, cursor:'pointer' },

  // ─── Heures de relevé : puce de sélection d'une heure (ajout à la main) ───
  creneauChip: { padding:'7px 12px', borderRadius:20, borderWidth:1, borderStyle:'solid', borderColor:'var(--border)', background:'var(--surface)', color:'var(--text2)', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'var(--font)', display:'inline-flex', alignItems:'center', gap:6 },
  creneauChipOn: { borderColor:'var(--accent)', background:'var(--accent-light)', color:'var(--accent)' },
};

export const hcfg = {
  section:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)', boxShadow: 'var(--sh-xs)',overflow:'hidden'},
  sectionHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid var(--border)',background:'var(--bg)'},
  sectionTitle:{fontSize:14,fontWeight:700,color:'var(--text)',fontFamily:'var(--font-serif)'},
  sectionSub:{fontSize:12,color:'var(--text2)',marginTop:2},
  row:{display:'flex',alignItems:'center',gap:12,padding:'12px 18px',borderBottom:'1px solid var(--border)',transition:'background .12s'},
  rowIcon:{width:36,height:36,borderRadius:8,background:'var(--accent-light)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0},
  toggle:{width:40,height:22,borderRadius:11,position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0},
  toggleThumb:{position:'absolute',top:2,width:18,height:18,borderRadius:9,background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'},
  editBtn:{padding:'5px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,fontSize:12,fontWeight:500,color:'var(--text)',cursor:'pointer',fontFamily:'var(--font)'},
  // Supprimer, sur chaque ligne : discret au repos, rouge au survol et au focus (classe btn-suppr-discret, app.css).
  deleteBtn:{padding:'5px 12px',background:'transparent',border:'1px solid transparent',borderRadius:7,fontSize:12,fontWeight:500,color:'var(--text3)',cursor:'pointer',fontFamily:'var(--font)'},
};
