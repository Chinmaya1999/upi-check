import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { MOTIONS, contrastOn, resolveDesign, type MotionSpec, type ResolvedDesign } from '@upi/core';
import * as db from '../data/db';
import { API_URL } from '../config';

export interface Palette {
  navy: string; bg: string; card: string; cardAlt: string; text: string; textMuted: string;
  border: string; income: string; expense: string; brand: string; onBrand: string; shadow: string;
  skeleton: string; warning: string; chipOn: string; onChip: string;
}

/** The default look (Aurora) is also the fallback until the server's choice has ever been downloaded. */
const DEFAULT_DESIGN: ResolvedDesign = resolveDesign('aurora');

export function paletteFor(d: ResolvedDesign, isDark: boolean): Palette {
  const s = isDark ? d.dark : d.light;
  const brand = isDark ? d.brand : d.brandLight ?? d.brand;
  return {
    navy: '#101827', bg: s.bg, card: s.card, cardAlt: s.cardAlt, text: s.text, textMuted: s.textMuted, border: s.border,
    income: d.income, expense: d.expense, warning: d.warning, brand, onBrand: contrastOn(brand), shadow: s.shadow, skeleton: s.skeleton,
    chipOn: isDark ? brand : s.text, onChip: isDark ? contrastOn(brand) : s.card,
  };
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Mutable on purpose: the active design rewrites the corner sizes, and every themed screen re-renders when it does. */
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
function applyShape(d: ResolvedDesign) {
  radius.lg = d.shape.card;
  radius.md = d.shape.control;
  radius.sm = Math.max(4, Math.round(d.shape.control * 0.65));
}

/** Accept only a well-formed design from the network/cache; anything else keeps the current one. */
function validDesign(x: any): x is ResolvedDesign {
  const okSurface = (s: any) => s && ['bg', 'card', 'cardAlt', 'text', 'textMuted', 'border', 'skeleton', 'shadow'].every((k) => typeof s[k] === 'string');
  return !!x && typeof x.id === 'string' && typeof x.brand === 'string' && okSurface(x.dark) && okSurface(x.light)
    && Array.isArray(x.hero?.colors) && x.hero.colors.length === 3 && Array.isArray(x.hero?.orbs) && x.hero.orbs.length === 3
    && typeof x.shape?.card === 'number' && typeof x.shape?.control === 'number' && typeof x.shape?.tab === 'number'
    && ['elevated', 'outlined', 'flat'].includes(x.cardStyle) && ['floating', 'docked', 'pill'].includes(x.tabBar)
    && typeof x.motionSpec?.damping === 'number' && typeof x.motionSpec?.enterMs === 'number';
}

type Mode = 'system' | 'light' | 'dark';
interface ThemeCtx { colors: Palette; isDark: boolean; mode: Mode; setMode: (m: Mode) => void; design: ResolvedDesign; motion: MotionSpec }
const Ctx = createContext<ThemeCtx>(null as never);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<Mode>('system');
  const [design, setDesign] = useState<ResolvedDesign>(DEFAULT_DESIGN);
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';

  // Live design: show the last one we saw immediately (works offline), then keep asking the server while the app is open.
  useEffect(() => {
    let alive = true;
    const adopt = (d: ResolvedDesign) => { applyShape(d); setDesign((cur) => (JSON.stringify(cur) === JSON.stringify(d) ? cur : d)); };
    (async () => {
      try { const c = await db.getMeta('design'); if (c && alive) { const d = JSON.parse(c); if (validDesign(d)) adopt(d); } } catch { /* use default */ }
    })();
    const poll = async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(`${API_URL}/config`, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
        clearTimeout(t);
        const j = await r.json();
        if (alive && validDesign(j?.design)) { adopt(j.design); db.setMeta('design', JSON.stringify(j.design)).catch(() => {}); }
      } catch { /* offline: keep what we have */ }
    };
    poll();
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { if (!timer) { poll(); timer = setInterval(poll, 20_000); } };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => { alive = false; stop(); sub.remove(); };
  }, []);

  const value = useMemo(() => ({ colors: paletteFor(design, isDark), isDark, mode, setMode, design, motion: design.motionSpec ?? MOTIONS.smooth }), [design, isDark, mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);

// Kept for any code that still imports the original two palettes.
export const light: Palette = paletteFor(DEFAULT_DESIGN, false);
export const dark: Palette = paletteFor(DEFAULT_DESIGN, true);
