// Helper d'export Excel réutilisable. xlsx est chargé à la demande pour ne
// pas alourdir le bundle des modules qui n'exportent qu'occasionnellement.
//
//   exportRowsToXlsx('pertes.xlsx', 'Pertes', headers, rows, colWidths?)
//     headers   : string[]      - ligne d'en-tête
//     rows      : (string|number)[][] - lignes de données
//     colWidths : number[]      - largeurs de colonnes optionnelles (en caractères)
export async function exportRowsToXlsx(filename, sheetName, headers, rows, colWidths) {
  const XLSX = await import('xlsx');
  const aoa = [headers, ...(rows || [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (Array.isArray(colWidths)) {
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Export').slice(0, 31));
  XLSX.writeFile(wb, filename);
}
