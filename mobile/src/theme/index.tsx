import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

export interface Palette {
  navy: string; bg: string; card: string; cardAlt: string; text: string; textMuted: string;
  border: string; income: string; expense: string; brand: string; onBrand: string; shadow: string;
  skeleton: string; warning: string; chipOn: string; onChip: string;
}

const base = { income: '#12B886', expense: '#F06565', brand: '#12B886', warning: '#F59F00' };

export const light: Palette = {
  ...base, navy: '#101827', bg: '#F5F7FA', card: '#FFFFFF', cardAlt: '#EEF2F7', text: '#101827',
  textMuted: '#667085', border: '#E4E8EF', onBrand: '#FFFFFF', shadow: '#101827', skeleton: '#E4E8EF', chipOn: '#101827', onChip: '#FFFFFF',
};
export const dark: Palette = {
  ...base, navy: '#101827', bg: '#0A101C', card: '#141C2E', cardAlt: '#1B2538', text: '#F2F5FA',
  textMuted: '#93A0B8', border: '#243049', onBrand: '#04130E', shadow: '#000000', skeleton: '#1F2A40', chipOn: '#12B886', onChip: '#04130E',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

type Mode = 'system' | 'light' | 'dark';
interface ThemeCtx { colors: Palette; isDark: boolean; mode: Mode; setMode: (m: Mode) => void }
const Ctx = createContext<ThemeCtx>(null as never);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<Mode>('system');
  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';
  const value = useMemo(() => ({ colors: isDark ? dark : light, isDark, mode, setMode }), [isDark, mode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
