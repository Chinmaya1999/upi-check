import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { LAYOUT_DEFAULT, MOTIONS, contrastOn, resolveDesign, type Festival, type MotionSpec, type ResolvedDesign } from '@upi/core';
import * as db from '../data/db';
import { pushWidgetFestival } from '../data/inbox';
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

const BASE_SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Mutable on purpose, like `radius`: the design's density (compact / cozy / roomy) rescales it. */
export const space = { ...BASE_SPACE };
/** Mutable on purpose: the active design rewrites the corner sizes, and every themed screen re-renders when it does. */
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
function applyShape(d: ResolvedDesign) {
  const k = d.density === 'compact' ? 0.78 : d.density === 'roomy' ? 1.2 : 1;
  (Object.keys(BASE_SPACE) as (keyof typeof BASE_SPACE)[]).forEach((key) => { space[key] = Math.round(BASE_SPACE[key] * k); });
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
    && ['elevated', 'outlined', 'flat', 'brutal'].includes(x.cardStyle) && ['floating', 'docked', 'pill', 'icons', 'underline'].includes(x.tabBar)
    && typeof x.motionSpec?.damping === 'number' && typeof x.motionSpec?.enterMs === 'number';
}

/** Older servers / cached designs may lack the structural options: fill them with the classic defaults. */
const withLayout = (d: ResolvedDesign): ResolvedDesign => ({ ...LAYOUT_DEFAULT, ...d });

type Mode = 'system' | 'light' | 'dark';
interface ThemeCtx { colors: Palette; isDark: boolean; mode: Mode; setMode: (m: Mode) => void; design: ResolvedDesign; motion: MotionSpec; festival: Festival | null }
const Ctx = createContext<ThemeCtx>(null as never);

const MOTION_NAMES = ['rise', 'fall', 'twinkle', 'float', 'burst', 'sway'];
/** Light shape check on what the server sent: a malformed festival must never crash Home. */
const validFestival = (f: any): f is Festival => !!f && typeof f.id === 'string' && typeof f.greeting === 'string' && typeof f.tagline === 'string' && typeof f.emoji === 'string'
  && Array.isArray(f.gradient) && f.gradient.length === 3 && f.gradient.every((c: unknown) => typeof c === 'string')
  && typeof f.text === 'string' && Array.isArray(f.particles) && f.particles.length > 0 && f.particles.every((p: unknown) => typeof p === 'string')
  && MOTION_NAMES.includes(f.motion) && Array.isArray(f.lights) && f.lights.every((c: unknown) => typeof c === 'string');

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<Mode>('system');
  const [design, setDesign] = useState<ResolvedDesign>(DEFAULT_DESIGN);
  const [festival, setFestival] = useState<Festival | null>(null);
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';

  // Live design: show the last one we saw immediately (works offline), then keep asking the server while the app is open.
  useEffect(() => {
    let alive = true;
    const adopt = (d: ResolvedDesign) => { applyShape(d); setDesign((cur) => (JSON.stringify(cur) === JSON.stringify(d) ? cur : d)); };
    (async () => {
      try { const c = await db.getMeta('design'); if (c && alive) { const d = JSON.parse(c); if (validDesign(d)) adopt(withLayout(d)); } } catch { /* use default */ }
      try { const c = await db.getMeta('festival'); if (c && alive) { const f = JSON.parse(c); if (validFestival(f)) setFestival(f); } } catch { /* none */ }
    })();
    const poll = async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(`${API_URL}/config`, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
        clearTimeout(t);
        const j = await r.json();
        if (alive && validDesign(j?.design)) { adopt(withLayout(j.design)); db.setMeta('design', JSON.stringify(j.design)).catch(() => {}); }
        // Festival: present = show it, null = the admin turned it off (or it ended). Anything malformed is ignored.
        if (alive && j && 'festival' in j) {
          const f = validFestival(j.festival) ? j.festival : null;
          setFestival((cur) => (JSON.stringify(cur) === JSON.stringify(f) ? cur : f));
          db.setMeta('festival', f ? JSON.stringify(f) : '').catch(() => {});
        }
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

  useEffect(() => { pushWidgetFestival(festival ? { greeting: festival.greeting, particles: festival.particles, accent: festival.accent } : null); }, [festival]);

  const value = useMemo(() => ({ colors: paletteFor(design, isDark), isDark, mode, setMode, design, motion: design.motionSpec ?? MOTIONS.smooth, festival }), [design, isDark, mode, festival]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);

// Kept for any code that still imports the original two palettes.
export const light: Palette = paletteFor(DEFAULT_DESIGN, false);
export const dark: Palette = paletteFor(DEFAULT_DESIGN, true);
