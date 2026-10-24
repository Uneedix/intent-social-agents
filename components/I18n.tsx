'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DICT, LANG_CODES, type LangName } from '../lib/i18n-dict';
import { DICT_EXTRA } from '../lib/i18n-extra';

export const LANGUAGES = Object.keys(LANG_CODES) as LangName[];
const KEY = 'intent-language';
type Ctx = { lang: LangName; setLang: (l: string) => void; t: (s: string, vars?: Record<string, string | number>) => string };
const I18nCtx = createContext<Ctx>({ lang: 'English', setLang: () => {}, t: s => s });

const fill = (s: string, vars?: Record<string, string | number>) => vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;

/** Interface translation only. User posts, comments and private messages are never translated automatically. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangName>('English');
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '"English"'); if (v in LANG_CODES) setLangState(v); } catch { /* keep English */ }
  }, []);
  useEffect(() => { document.documentElement.lang = LANG_CODES[lang]; }, [lang]);
  const setLang = useCallback((l: string) => {
    if (!(l in LANG_CODES)) return;
    setLangState(l as LangName);
    try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked */ }
  }, []);
  const t = useCallback((s: string, vars?: Record<string, string | number>) => {
    const idx = LANGUAGES.indexOf(lang) - 1; // English is the source language
    const row = idx >= 0 ? (DICT[s] || DICT_EXTRA[s]) : undefined;
    return fill(row?.[idx] || s.split('|')[0], vars);
  }, [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;
