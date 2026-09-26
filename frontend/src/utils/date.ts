export function formatDateRange(pickup: string, returnDate: string, lang: string): string {
  if (!pickup || !returnDate) return `${pickup || '...'} — ${returnDate || '...'}`;
  const p = new Date(pickup);
  const r = new Date(returnDate);
  if (isNaN(p.getTime()) || isNaN(r.getTime())) return `${pickup} — ${returnDate}`;

  let locale = 'en-GB';
  if (lang === 'ru' || lang === 'uk') locale = 'ru-RU';
  else if (lang === 'de') locale = 'de-DE';
  else if (lang === 'it') locale = 'it-IT';
  
  const sameYear = p.getFullYear() === r.getFullYear();
  const sameMonth = sameYear && p.getMonth() === r.getMonth();

  if (sameMonth) {
    const rStr = r.toLocaleString(locale, { day: 'numeric', month: 'long' });
    const match = rStr.match(/^(\d+)(\.?)\s*(.*)/);
    if (match) {
      const dot = match[2];
      const rest = match[3];
      return `${p.getDate()}${dot}–${r.getDate()}${dot} ${rest}`;
    }
    return `${p.getDate()}–${rStr}`;
  } else if (sameYear) {
    const pStr = p.toLocaleString(locale, { day: 'numeric', month: 'long' });
    const rStr = r.toLocaleString(locale, { day: 'numeric', month: 'long' });
    return `${pStr} – ${rStr}`;
  } else {
    const pStr = p.toLocaleString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const rStr = r.toLocaleString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    return `${pStr} – ${rStr}`;
  }
}
