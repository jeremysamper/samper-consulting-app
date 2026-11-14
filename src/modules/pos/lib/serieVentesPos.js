// ─────────────────────────────────────────────────────────────────────────────
// Ventes de la caisse reliée (Lightspeed) par tranche, sans React ni service
// (testé par node --test, serieVentesPos.test.mjs), pour le module
// Statistiques. Mêmes règles que l'ancien classement de Ventes POS, parti en S3 : quantités
// vendues par article de la caisse reliée, au jour de la vente ; le chiffre
// est la colonne revenue_cts, que la Comptabilité lit aussi (en centimes).
//   ventes : [{ pos_item_id, date, qty, revenue_cts }]
//   noms   : { pos_item_id: nom de l'article }
// ─────────────────────────────────────────────────────────────────────────────

export function serieVentesPos(ventes, noms, tranches) {
  const datees = (ventes || []).filter((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v?.date || '')));
  return (tranches || []).map((t) => {
    const dedans = datees.filter((v) => v.date.slice(0, 10) >= t.debut && v.date.slice(0, 10) <= t.fin);
    const parPlat = {};
    let qte = 0;
    let centimes = 0;
    dedans.forEach((v) => {
      const q = Number(v.qty) || 0;
      const c = Number(v.revenue_cts) || 0;
      qte += q;
      centimes += c;
      const p = parPlat[v.pos_item_id] || (parPlat[v.pos_item_id] = { nom: noms?.[v.pos_item_id] || v.pos_item_id, qte: 0, centimes: 0 });
      p.qte += q;
      p.centimes += c;
    });
    return {
      debut: t.debut,
      fin: t.fin,
      vide: dedans.length === 0,
      qte,
      chiffre: centimes / 100,
      parPlat: Object.fromEntries(Object.entries(parPlat).map(([id, p]) => [id, { nom: p.nom, qte: p.qte, chiffre: p.centimes / 100 }])),
    };
  });
}
