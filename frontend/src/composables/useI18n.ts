import { ref, computed } from 'vue';
import { messagesData } from '../locales/messages';
import { countriesData } from '../locales/countries';

export type SupportedLang = 'ru' | 'en' | 'de' | 'it' | 'uk';

const messages = messagesData as Record<SupportedLang, Record<string, string>>;
const countries = countriesData as Record<SupportedLang, Record<string, string>>;

function getInitialLang(): SupportedLang {
  const stored = localStorage.getItem('camper_monitor_lang') as SupportedLang;
  if (stored && ['ru', 'en', 'de', 'it', 'uk'].includes(stored)) return stored;
  
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code) {
    const tgLang = window.Telegram.WebApp.initDataUnsafe.user.language_code.toLowerCase();
    if (tgLang.startsWith('ru')) return 'ru';
    if (tgLang.startsWith('uk')) return 'uk';
    if (tgLang.startsWith('de')) return 'de';
    if (tgLang.startsWith('it')) return 'it';
    if (tgLang.startsWith('en')) return 'en';
  }
  
  const navLang = navigator.language?.toLowerCase() || '';
  if (navLang.startsWith('ru')) return 'ru';
  if (navLang.startsWith('uk')) return 'uk';
  if (navLang.startsWith('de')) return 'de';
  if (navLang.startsWith('it')) return 'it';
  return 'en';
}

const currentLang = ref<SupportedLang>(getInitialLang());

export function useI18n() {
  function setLanguage(lang: SupportedLang) {
    currentLang.value = lang;
    localStorage.setItem('camper_monitor_lang', lang);
    document.documentElement.lang = lang;
  }

  function t(key: string, params?: Record<string, string | number>): string {
    const langDict = messages[currentLang.value] || messages.en || {};
    let text = langDict[key] || messages.en?.[key] || '';
    if (!text) return '';
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return text;
  }

  function getCountryName(code: string): string {
    const langCountries = countries[currentLang.value] || countries.en || {};
    return langCountries[code.toUpperCase()] || code;
  }

function pluralizeDays(days: number): string {
    const lang = currentLang.value;
    if (lang === 'ru') return 'дн.';
    if (lang === 'uk') return 'дн.';
    if (lang === 'de') return days === 1 ? 'Tag' : 'Tage';
    if (lang === 'it') return days === 1 ? 'giorno' : 'giorni';
    return days === 1 ? 'day' : 'days';
  }

  return {
    currentLang,
    setLanguage,
    t,
    getCountryName,
    pluralizeDays,
  };
}
