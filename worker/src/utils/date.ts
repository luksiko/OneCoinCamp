import { parseIsoDate } from '../services/filters';
import { resolveLanguage } from '../services/i18n';

export function formatDateRange(pickup: string, returnDate: string, lang: string): string {
  const p = parseIsoDate(pickup);
  const r = parseIsoDate(returnDate);
  if (!p || !r) return `${pickup} ➔ ${returnDate}`;

  const l = resolveLanguage(lang);
  let locale = 'en-GB';
  if (l === 'ru') locale = 'ru-RU';
  else if (l === 'de') locale = 'de-DE';
  else if (l === 'it') locale = 'it-IT';
  
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
