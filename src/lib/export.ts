// CSV export of the current result list. Column names are stable and
// language-independent (snake_case English), and numbers are unformatted, so
// exports from any UI locale are interchangeable.

import { analysis, app, model } from './state.svelte';
import { perMillion } from './stats';

function cell(v: string | number | undefined): string {
  if (v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCSV() {
  const m = analysis.matrix;
  const f = analysis.freq;
  const unihan = model.unihan;
  if (!m || !f || !unihan) return;
  const k = analysis.keyness;
  const cum = analysis.cumulative;
  const isChars = app.view === 'chars';

  const header = ['rank', 'item', 'count', 'per_million', 'texts', 'dp_norm'];
  if (isChars) header.push('cumulative_share', 'codepoint', 'mandarin', 'gloss');
  if (k) header.push('ref_count', 'ref_per_million', 'log_ratio', 'log_likelihood');

  const lines = [header.join(',')];
  for (const i of analysis.results) {
    const item = m.items[i];
    const row: (string | number | undefined)[] = [
      f.rank[i] || undefined,
      item,
      f.count[i],
      perMillion(f.count[i], f.sel.total),
      f.range[i],
      f.dp[i],
    ];
    if (isChars) {
      const e = unihan[item];
      row.push(cum?.[i], 'U+' + item.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), e?.cmn?.join(' '), e?.def);
    }
    if (k) row.push(k.refCount[i], perMillion(k.refCount[i], k.refTotal), k.lr[i], k.g2[i]);
    lines.push(row.map(cell).join(','));
  }

  // BOM so spreadsheet software detects UTF-8.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = (tokens: string[]) => (tokens.length > 3 ? 'custom' : tokens.join('+'));
  a.download = `lzh-${app.view}-${name(app.corpus)}${app.ref.length ? '-vs-' + name(app.ref) : ''}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
