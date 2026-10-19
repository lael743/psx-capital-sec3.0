/**
 * Utilitário simples para exportar dados como CSV.
 * @param {Array<Object>} data - Array de objetos
 * @param {Array<{key: string, label: string}>} columns - Colunas a exportar
 * @param {string} filename - Nome do arquivo (sem extensão)
 */
export function exportToCsv(data, columns, filename = 'exportacao') {
  const header = columns.map(c => `"${c.label}"`).join(';');
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(';')
  );
  const csv = [header, ...rows].join('\r\n');
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}