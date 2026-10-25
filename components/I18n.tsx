'use client';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { DICT, LANG_CODES, type LangName } from '../lib/i18n-dict';
import { DICT_EXTRA } from '../lib/i18n-extra';
import { DICT_MEDIA } from '../lib/i18n-media';
import { DICT_EXPLORE } from '../lib/i18n-explore';
import { DICT_COMMUNITIES } from '../lib/i18n-communities';
import { DICT_MARKET } from '../lib/i18n-market';
import { DICT_GROUPS } from '../lib/i18n-groups';
import {useStored} from '../lib/social';

export const LANGUAGES = Object.keys(LANG_CODES) as LangName[];
const KEY = 'intent-language';
type Ctx = { lang: LangName; setLang: (l: string) => void; t: (s: string, vars?: Record<string, string | number>) => string };
const I18nCtx = createContext<Ctx>({ lang: 'English', setLang: () => {}, t: s => s });

const fill = (s: string, vars?: Record<string, string | number>) => vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;

/** Interface translation only. User posts, comments and private messages are never translated automatically. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [storedLang, setLangState] = useStored<LangName>(KEY, 'English');
  const lang = Object.hasOwn(LANG_CODES, storedLang) ? storedLang : 'English';
  useEffect(() => { document.documentElement.lang = LANG_CODES[lang]; }, [lang]);
  const setLang = useCallback((l: string) => {
    if (!Object.hasOwn(LANG_CODES,l)) return;
    setLangState(l as LangName);
  }, [setLangState]);
  const t = useCallback((s: string, vars?: Record<string, string | number>) => {
    const idx = LANGUAGES.indexOf(lang) - 1; // English is the source language
    const row = idx >= 0 ? (DICT[s] || DICT_EXTRA[s] || DICT_MEDIA[s] || DICT_EXPLORE[s] || DICT_COMMUNITIES[s] || DICT_MARKET[s] || DICT_GROUPS[s]) : undefined;
    return fill(row?.[idx] || s.split('|')[0], vars);
  }, [lang]);
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const useT = () => useContext(I18nCtx).t;
