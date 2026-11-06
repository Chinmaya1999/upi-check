/**
 * App design system: ten complete looks that the admin dashboard can switch live.
 * Pure data, shared by the API (serves the active one), the dashboard (previews) and the app (applies it).
 */

export interface Surface {
  bg: string; card: string; cardAlt: string; text: string; textMuted: string; border: string; skeleton: string; shadow: string;
}
export type MotionName = 'smooth' | 'bouncy' | 'snappy' | 'calm' | 'off';
export type CardStyle = 'elevated' | 'outlined' | 'flat' | 'brutal';
export type TabBarStyle = 'floating' | 'docked' | 'pill' | 'icons' | 'underline';
/** How the Home screen is composed (not just coloured): the structure of the page itself. */
export type HomeLayout = 'classic' | 'bento' | 'minimal' | 'compact' | 'focus';
/** The big "You spent today" banner: gradient card, flat colour card, bare poster type, or a payment-card look. */
export type HeroStyle = 'gradient' | 'solid' | 'poster' | 'card';
/** Transaction lists: one grouped card, a separate card per row, or plain rows with hairlines. */
export type RowStyle = 'grouped' | 'cards' | 'flat';
/** Overall spacing: compact packs more on screen, roomy breathes. */
export type Density = 'compact' | 'cozy' | 'roomy';
export interface Layout { home: HomeLayout; heroStyle: HeroStyle; rows: RowStyle; density: Density }
export const LAYOUT_DEFAULT: Layout = { home: 'classic', heroStyle: 'gradient', rows: 'grouped', density: 'cozy' };

export interface MotionSpec {
  /** spring damping / stiffness for taps and tab changes (higher damping = less bounce) */
  damping: number; stiffness: number;
  /** how far a pressed element shrinks (1 = no feedback) */
  tapScale: number;
  /** entrance animation length, and the delay between successive cards */
  enterMs: number; staggerMs: number;
  /** count-up duration for amounts */
  countMs: number;
  /** animated background orbs on the hero banner */
  orbs: boolean;
}

export const MOTIONS: Record<MotionName, MotionSpec> = {
  smooth: { damping: 16, stiffness: 220, tapScale: 0.97, enterMs: 450, staggerMs: 80, countMs: 900, orbs: true },
  bouncy: { damping: 9, stiffness: 180, tapScale: 0.93, enterMs: 620, staggerMs: 110, countMs: 1100, orbs: true },
  snappy: { damping: 26, stiffness: 420, tapScale: 0.98, enterMs: 220, staggerMs: 35, countMs: 450, orbs: false },
  calm: { damping: 22, stiffness: 90, tapScale: 0.99, enterMs: 800, staggerMs: 140, countMs: 1400, orbs: true },
  off: { damping: 30, stiffness: 500, tapScale: 1, enterMs: 0, staggerMs: 0, countMs: 0, orbs: false },
};
export const MOTION_LABELS: Record<MotionName, string> = {
  smooth: 'Smooth', bouncy: 'Bouncy', snappy: 'Snappy', calm: 'Calm', off: 'No animation',
};

export interface Design extends Layout {
  id: string;
  name: string;
  tagline: string;
  /** Accent colour; `brandLight` overrides it on light backgrounds when the accent would be unreadable there. */
  brand: string;
  brandLight?: string;
  income: string; expense: string; warning: string;
  dark: Surface;
  light: Surface;
  hero: { colors: [string, string, string]; orbs: [string, string, string] };
  shape: { card: number; control: number; tab: number };
  cardStyle: CardStyle;
  tabBar: TabBarStyle;
  motion: MotionName;
}

const status = { income: '#12B886', expense: '#F06565', warning: '#F59F00' };

type BaseDesign = Omit<Design, keyof Layout> & Partial<Layout>;
const BASE: BaseDesign[] = [
  {
    id: 'aurora', name: 'Aurora', tagline: 'The signature look: deep navy, glowing green, floating tab bar.',
    brand: '#12B886', ...status,
    dark: { bg: '#0A101C', card: '#141C2E', cardAlt: '#1B2538', text: '#F2F5FA', textMuted: '#93A0B8', border: '#243049', skeleton: '#1F2A40', shadow: '#000000' },
    light: { bg: '#F5F7FA', card: '#FFFFFF', cardAlt: '#EEF2F7', text: '#101827', textMuted: '#667085', border: '#E4E8EF', skeleton: '#E4E8EF', shadow: '#101827' },
    hero: { colors: ['#0B1224', '#1B2F6B', '#0E7C66'], orbs: ['rgba(61,219,169,0.22)', 'rgba(132,94,247,0.28)', 'rgba(116,192,252,0.22)'] },
    shape: { card: 24, control: 16, tab: 28 }, cardStyle: 'elevated', tabBar: 'floating', motion: 'smooth',
  },
  {
    id: 'midnight', name: 'Midnight Indigo', tagline: 'Rich violet on near-black. Big soft corners and a playful, bouncy feel.',
    brand: '#7C6CFF', ...status,
    dark: { bg: '#0B0A1F', card: '#15142E', cardAlt: '#1D1B3D', text: '#F1F0FF', textMuted: '#9A98C4', border: '#2A2850', skeleton: '#232148', shadow: '#000000' },
    light: { bg: '#F4F3FF', card: '#FFFFFF', cardAlt: '#EBE9FF', text: '#1B1840', textMuted: '#6E6B99', border: '#DDDAF7', skeleton: '#E4E1FA', shadow: '#2A2368' },
    hero: { colors: ['#120F3A', '#3B2FA0', '#7C3AED'], orbs: ['rgba(167,139,250,0.30)', 'rgba(236,72,153,0.24)', 'rgba(96,165,250,0.24)'] },
    shape: { card: 28, control: 18, tab: 30 }, cardStyle: 'elevated', tabBar: 'floating', motion: 'bouncy',
  },
  {
    id: 'paper', name: 'Clean Paper', tagline: 'Calm, minimal and fast. Outlined cards, a docked tab bar, no distractions.',
    brand: '#2563EB', ...status,
    dark: { bg: '#0F1115', card: '#171A20', cardAlt: '#1F232B', text: '#F4F5F7', textMuted: '#8E95A3', border: '#2A2F38', skeleton: '#232830', shadow: '#000000' },
    light: { bg: '#F7F7F8', card: '#FFFFFF', cardAlt: '#F0F1F3', text: '#111318', textMuted: '#6B7280', border: '#E5E7EB', skeleton: '#E5E7EB', shadow: '#111318' },
    hero: { colors: ['#1E3A8A', '#2563EB', '#38BDF8'], orbs: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.12)'] },
    shape: { card: 14, control: 10, tab: 0 }, cardStyle: 'outlined', tabBar: 'docked', motion: 'snappy',
  },
  {
    id: 'sunset', name: 'Sunset', tagline: 'Warm orange and magenta glow with friendly, rounded shapes.',
    brand: '#FF7A45', ...status,
    dark: { bg: '#1A0F12', card: '#26161B', cardAlt: '#321E24', text: '#FFF3EE', textMuted: '#C9A39A', border: '#43282F', skeleton: '#38222A', shadow: '#000000' },
    light: { bg: '#FFF6F1', card: '#FFFFFF', cardAlt: '#FFEADF', text: '#3A1A12', textMuted: '#8F675B', border: '#F6D9CB', skeleton: '#F6DED3', shadow: '#7A2E10' },
    hero: { colors: ['#4A1230', '#C2410C', '#F59E0B'], orbs: ['rgba(253,186,116,0.32)', 'rgba(244,114,182,0.28)', 'rgba(254,240,138,0.22)'] },
    shape: { card: 26, control: 18, tab: 30 }, cardStyle: 'elevated', tabBar: 'floating', motion: 'bouncy',
  },
  {
    id: 'forest', name: 'Forest', tagline: 'Earthy greens, slow gentle motion and a compact pill tab bar.',
    brand: '#84CC16', brandLight: '#4D7C0F', ...status,
    dark: { bg: '#0C130E', card: '#131D16', cardAlt: '#1A271D', text: '#EEF5EC', textMuted: '#94A89A', border: '#243428', skeleton: '#1B2A1F', shadow: '#000000' },
    light: { bg: '#F3F7F1', card: '#FFFFFF', cardAlt: '#E8F0E4', text: '#14231A', textMuted: '#5F7566', border: '#D8E3D3', skeleton: '#DCE7D7', shadow: '#14301F' },
    hero: { colors: ['#0F2A1A', '#1F5E3A', '#6B8E23'], orbs: ['rgba(163,230,53,0.24)', 'rgba(52,211,153,0.22)', 'rgba(253,224,71,0.18)'] },
    shape: { card: 20, control: 14, tab: 24 }, cardStyle: 'outlined', tabBar: 'pill', motion: 'calm',
  },
  {
    id: 'ocean', name: 'Ocean', tagline: 'Cool cyan and deep blue with fluid, smooth transitions.',
    brand: '#06B6D4', brandLight: '#0E7490', ...status,
    dark: { bg: '#07141C', card: '#0E202B', cardAlt: '#142C3A', text: '#E8F6FB', textMuted: '#8DB0BE', border: '#1C3947', skeleton: '#16303E', shadow: '#000000' },
    light: { bg: '#F0F9FC', card: '#FFFFFF', cardAlt: '#E1F2F8', text: '#0B2530', textMuted: '#55798A', border: '#CFE6EE', skeleton: '#D6E9F0', shadow: '#0B4A63' },
    hero: { colors: ['#062B3F', '#0B6E99', '#22D3EE'], orbs: ['rgba(103,232,249,0.28)', 'rgba(56,189,248,0.26)', 'rgba(165,243,252,0.22)'] },
    shape: { card: 28, control: 18, tab: 30 }, cardStyle: 'elevated', tabBar: 'floating', motion: 'smooth',
  },
  {
    id: 'rose', name: 'Rose Quartz', tagline: 'Soft pinks and the roundest corners. Gentle, elegant and light on the eyes.',
    brand: '#EC4899', brandLight: '#DB2777', ...status,
    dark: { bg: '#170D13', card: '#22141C', cardAlt: '#2C1B25', text: '#FFF0F6', textMuted: '#C79BB0', border: '#3B2431', skeleton: '#2F1D28', shadow: '#000000' },
    light: { bg: '#FFF5F9', card: '#FFFFFF', cardAlt: '#FDE7F0', text: '#3A1426', textMuted: '#94607A', border: '#F6D3E2', skeleton: '#F8DCE8', shadow: '#9D174D' },
    hero: { colors: ['#3B0A2A', '#BE185D', '#F472B6'], orbs: ['rgba(251,207,232,0.30)', 'rgba(192,132,252,0.26)', 'rgba(253,164,175,0.24)'] },
    shape: { card: 30, control: 20, tab: 32 }, cardStyle: 'elevated', tabBar: 'floating', motion: 'smooth',
  },
  {
    id: 'mono', name: 'Mono Pro', tagline: 'Pure black and white, razor-sharp corners and instant, no-nonsense motion.',
    brand: '#F5F5F5', brandLight: '#111111', ...status,
    dark: { bg: '#000000', card: '#0E0E0E', cardAlt: '#181818', text: '#FAFAFA', textMuted: '#8A8A8A', border: '#262626', skeleton: '#1C1C1C', shadow: '#000000' },
    light: { bg: '#FAFAFA', card: '#FFFFFF', cardAlt: '#F0F0F0', text: '#0A0A0A', textMuted: '#6B6B6B', border: '#E0E0E0', skeleton: '#E6E6E6', shadow: '#000000' },
    hero: { colors: ['#000000', '#1F1F1F', '#3F3F3F'], orbs: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.09)'] },
    shape: { card: 8, control: 6, tab: 0 }, cardStyle: 'outlined', tabBar: 'docked', motion: 'snappy',
  },
  {
    id: 'neon', name: 'Neon Cyber', tagline: 'Electric lime on midnight, glowing gradients and quick, punchy motion.',
    brand: '#C6FF3D', brandLight: '#6D28D9', ...status,
    dark: { bg: '#07070D', card: '#11111C', cardAlt: '#1A1A2B', text: '#F3F3FF', textMuted: '#8F8FB5', border: '#2A2A45', skeleton: '#1E1E33', shadow: '#000000' },
    light: { bg: '#F4F4FB', card: '#FFFFFF', cardAlt: '#EAEAF6', text: '#12121F', textMuted: '#66668A', border: '#D9D9EE', skeleton: '#E2E2F2', shadow: '#3B1D8F' },
    hero: { colors: ['#0A0A1F', '#4C1D95', '#DB2777'], orbs: ['rgba(198,255,61,0.26)', 'rgba(217,70,239,0.30)', 'rgba(34,211,238,0.26)'] },
    shape: { card: 18, control: 12, tab: 22 }, cardStyle: 'outlined', tabBar: 'floating', motion: 'snappy',
  },
  {
    id: 'royal', name: 'Royal Gold', tagline: 'Deep navy with warm gold. Refined, unhurried and premium.',
    brand: '#E0B040', brandLight: '#A67C00', ...status,
    dark: { bg: '#0A0E1A', card: '#121828', cardAlt: '#1A2236', text: '#F6F1E4', textMuted: '#A59F8A', border: '#2A3350', skeleton: '#1B243A', shadow: '#000000' },
    light: { bg: '#FBF8EF', card: '#FFFFFF', cardAlt: '#F3EDDA', text: '#1C1A12', textMuted: '#7A7358', border: '#E8E0C6', skeleton: '#EDE6CF', shadow: '#5C4A10' },
    hero: { colors: ['#0A1330', '#1E2A5A', '#B8860B'], orbs: ['rgba(250,204,21,0.26)', 'rgba(99,102,241,0.24)', 'rgba(253,230,138,0.20)'] },
    shape: { card: 22, control: 14, tab: 26 }, cardStyle: 'elevated', tabBar: 'pill', motion: 'calm',
  },
];

/** Ten more designs that differ in structure, not just colour. */
const STRUCTURAL: BaseDesign[] = [
  {
    id: 'bento', name: 'Bento Grid', tagline: 'Home becomes a grid of colourful tiles of different sizes. Each number gets its own block.',
    brand: '#FFB020', brandLight: '#D97706', ...status,
    dark: { bg: '#0D0F14', card: '#171A21', cardAlt: '#20242D', text: '#F5F6F8', textMuted: '#8C93A3', border: '#262B36', skeleton: '#1D2129', shadow: '#000000' },
    light: { bg: '#F2F0EB', card: '#FFFFFF', cardAlt: '#E9E5DC', text: '#1D1B16', textMuted: '#7A7566', border: '#E2DDD0', skeleton: '#E6E1D5', shadow: '#5A4B1A' },
    hero: { colors: ['#B45309', '#F59E0B', '#FCD34D'], orbs: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.14)'] },
    shape: { card: 22, control: 14, tab: 24 }, cardStyle: 'flat', tabBar: 'icons', motion: 'bouncy',
    home: 'bento', heroStyle: 'solid', rows: 'cards', density: 'cozy',
  },
  {
    id: 'poster', name: 'Poster', tagline: 'Giant typography, no boxes. The numbers are the design. Plain rows, underline tabs.',
    brand: '#FFE14D', brandLight: '#111111', ...status,
    dark: { bg: '#0A0A0A', card: '#141414', cardAlt: '#1C1C1C', text: '#FFFFFF', textMuted: '#8E8E8E', border: '#262626', skeleton: '#1A1A1A', shadow: '#000000' },
    light: { bg: '#FFFDF5', card: '#FFFFFF', cardAlt: '#F4F0DF', text: '#0B0B0B', textMuted: '#707070', border: '#E8E3CF', skeleton: '#EFEAD8', shadow: '#000000' },
    hero: { colors: ['#0A0A0A', '#161616', '#222222'], orbs: ['rgba(255,225,77,0.10)', 'rgba(255,225,77,0.06)', 'rgba(255,225,77,0.08)'] },
    shape: { card: 0, control: 8, tab: 0 }, cardStyle: 'flat', tabBar: 'underline', motion: 'snappy',
    home: 'minimal', heroStyle: 'poster', rows: 'flat', density: 'roomy',
  },
  {
    id: 'terminal', name: 'Terminal', tagline: 'Dense, data-first and fast. Everything in one compact summary, tight spacing, hairline rows.',
    brand: '#3DFF7A', brandLight: '#0B7A33', ...status,
    dark: { bg: '#050805', card: '#0B110B', cardAlt: '#122012', text: '#D8FFE4', textMuted: '#6FA383', border: '#16301B', skeleton: '#0F1A10', shadow: '#000000' },
    light: { bg: '#F3F8F3', card: '#FFFFFF', cardAlt: '#E4EEE4', text: '#0F2414', textMuted: '#5E7A66', border: '#D2E1D4', skeleton: '#DCE8DD', shadow: '#0F2414' },
    hero: { colors: ['#04120A', '#0B3B1D', '#0F6B33'], orbs: ['rgba(61,255,122,0.16)', 'rgba(61,255,122,0.10)', 'rgba(61,255,122,0.12)'] },
    shape: { card: 4, control: 4, tab: 0 }, cardStyle: 'outlined', tabBar: 'underline', motion: 'snappy',
    home: 'compact', heroStyle: 'solid', rows: 'flat', density: 'compact',
  },
  {
    id: 'focus', name: 'Focus Ring', tagline: 'One big glowing ring in the middle of the screen. Calm, centred and uncluttered.',
    brand: '#2DD4BF', brandLight: '#0F766E', ...status,
    dark: { bg: '#061312', card: '#0D1E1D', cardAlt: '#132928', text: '#E6FBF8', textMuted: '#86B5B0', border: '#17332F', skeleton: '#102423', shadow: '#000000' },
    light: { bg: '#F0FAF8', card: '#FFFFFF', cardAlt: '#DFF3F0', text: '#0B2523', textMuted: '#5A8580', border: '#CBE7E3', skeleton: '#D3EBE7', shadow: '#0F766E' },
    hero: { colors: ['#052E2B', '#0F766E', '#2DD4BF'], orbs: ['rgba(94,234,212,0.26)', 'rgba(45,212,191,0.20)', 'rgba(204,251,241,0.18)'] },
    shape: { card: 28, control: 18, tab: 30 }, cardStyle: 'flat', tabBar: 'icons', motion: 'calm',
    home: 'focus', heroStyle: 'poster', rows: 'grouped', density: 'roomy',
  },
  {
    id: 'wallet', name: 'Wallet Card', tagline: 'The banner is a real payment card with a chip. Every transaction sits on its own card.',
    brand: '#34D399', brandLight: '#047857', ...status,
    dark: { bg: '#0E1210', card: '#161C19', cardAlt: '#1E2622', text: '#F0F6F3', textMuted: '#8EA399', border: '#26302B', skeleton: '#1A221E', shadow: '#000000' },
    light: { bg: '#F2F5F3', card: '#FFFFFF', cardAlt: '#E7EDE9', text: '#112018', textMuted: '#667A70', border: '#DCE5DF', skeleton: '#E1E9E4', shadow: '#112018' },
    hero: { colors: ['#052E1F', '#0F5E43', '#C9A227'], orbs: ['rgba(250,204,21,0.26)', 'rgba(16,185,129,0.24)', 'rgba(255,255,255,0.14)'] },
    shape: { card: 22, control: 14, tab: 26 }, cardStyle: 'elevated', tabBar: 'floating', motion: 'smooth',
    home: 'classic', heroStyle: 'card', rows: 'cards', density: 'cozy',
  },
  {
    id: 'newsprint', name: 'Newsprint', tagline: 'Cream paper, sharp corners and ink-black type. Reads like a financial newspaper.',
    brand: '#E5484D', brandLight: '#C1121F', ...status,
    dark: { bg: '#15120E', card: '#1D1913', cardAlt: '#26211A', text: '#F3EBDD', textMuted: '#A39A87', border: '#36301F', skeleton: '#211C15', shadow: '#000000' },
    light: { bg: '#F6F0E2', card: '#FBF7EC', cardAlt: '#EDE5D0', text: '#1A1710', textMuted: '#756E5A', border: '#DDD3B9', skeleton: '#E6DEC6', shadow: '#3A311A' },
    hero: { colors: ['#1A1710', '#3A2F1A', '#7A5C1E'], orbs: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.08)'] },
    shape: { card: 2, control: 2, tab: 0 }, cardStyle: 'outlined', tabBar: 'underline', motion: 'calm',
    home: 'minimal', heroStyle: 'poster', rows: 'flat', density: 'cozy',
  },
  {
    id: 'candy', name: 'Candy Pop', tagline: 'Playful pastel colours, super-round shapes, springy bounces and chunky spacing.',
    brand: '#FF5CA8', brandLight: '#E11D74', ...status,
    dark: { bg: '#1A1030', card: '#271A47', cardAlt: '#33235A', text: '#FFF1FA', textMuted: '#C9A9DD', border: '#3F2C6E', skeleton: '#2E2050', shadow: '#000000' },
    light: { bg: '#FFF4FB', card: '#FFFFFF', cardAlt: '#FFE4F3', text: '#3B1140', textMuted: '#9A6B9F', border: '#FAD1EA', skeleton: '#FBDCEE', shadow: '#C2188D' },
    hero: { colors: ['#6D28D9', '#DB2777', '#FB923C'], orbs: ['rgba(253,224,71,0.34)', 'rgba(125,211,252,0.30)', 'rgba(255,255,255,0.24)'] },
    shape: { card: 34, control: 22, tab: 36 }, cardStyle: 'elevated', tabBar: 'icons', motion: 'bouncy',
    home: 'classic', heroStyle: 'gradient', rows: 'cards', density: 'roomy',
  },
  {
    id: 'oled', name: 'OLED Lines', tagline: 'True black with hairline outlines and a cyan glow. Compact, crisp and battery-friendly.',
    brand: '#22D3EE', brandLight: '#0E7490', ...status,
    dark: { bg: '#000000', card: '#000000', cardAlt: '#0F1318', text: '#F1F5F9', textMuted: '#7D8795', border: '#1E2630', skeleton: '#0F1318', shadow: '#000000' },
    light: { bg: '#FFFFFF', card: '#FFFFFF', cardAlt: '#F1F5F9', text: '#0B1220', textMuted: '#64748B', border: '#E2E8F0', skeleton: '#EDF1F6', shadow: '#0B1220' },
    hero: { colors: ['#000000', '#031A22', '#0B5A6B'], orbs: ['rgba(34,211,238,0.20)', 'rgba(34,211,238,0.10)', 'rgba(125,211,252,0.14)'] },
    shape: { card: 12, control: 10, tab: 0 }, cardStyle: 'outlined', tabBar: 'docked', motion: 'snappy',
    home: 'compact', heroStyle: 'solid', rows: 'flat', density: 'compact',
  },
  {
    id: 'zen', name: 'Zen Garden', tagline: 'Sage greens, lots of whitespace and slow, soft transitions. Minimal and peaceful.',
    brand: '#6BA58A', brandLight: '#3F7A5E', ...status,
    dark: { bg: '#101613', card: '#18201C', cardAlt: '#202A25', text: '#EAF2EE', textMuted: '#92A89D', border: '#2A3731', skeleton: '#1C2621', shadow: '#000000' },
    light: { bg: '#F4F7F4', card: '#FFFFFF', cardAlt: '#E8EFEA', text: '#18241E', textMuted: '#6A7F73', border: '#DCE6DF', skeleton: '#E1EAE4', shadow: '#2F4A3C' },
    hero: { colors: ['#1F3A2E', '#3F7A5E', '#A7C4B1'], orbs: ['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.16)'] },
    shape: { card: 26, control: 16, tab: 32 }, cardStyle: 'flat', tabBar: 'pill', motion: 'calm',
    home: 'minimal', heroStyle: 'solid', rows: 'cards', density: 'roomy',
  },
  {
    id: 'bold', name: 'Bold Blocks', tagline: 'Thick black outlines, loud yellow and hard edges. Unapologetically graphic.',
    brand: '#FFD60A', brandLight: '#E6B800', ...status,
    dark: { bg: '#111111', card: '#1B1B1B', cardAlt: '#262626', text: '#FFFFFF', textMuted: '#A3A3A3', border: '#FFFFFF', skeleton: '#262626', shadow: '#FFD60A' },
    light: { bg: '#FFF7CC', card: '#FFFFFF', cardAlt: '#FFE98A', text: '#0A0A0A', textMuted: '#4D4D4D', border: '#0A0A0A', skeleton: '#FFE98A', shadow: '#0A0A0A' },
    hero: { colors: ['#FFD60A', '#FFD60A', '#FFC300'], orbs: ['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.08)'] },
    shape: { card: 6, control: 4, tab: 0 }, cardStyle: 'brutal', tabBar: 'docked', motion: 'snappy',
    home: 'bento', heroStyle: 'solid', rows: 'cards', density: 'cozy',
  },
];

export const DESIGNS: Design[] = [...BASE, ...STRUCTURAL].map((d) => ({ ...LAYOUT_DEFAULT, ...d }));

export const DEFAULT_DESIGN_ID = 'aurora';
export const designIds = () => DESIGNS.map((d) => d.id);

/** What the API sends to phones: the chosen design with an optional admin override of its animation feel. */
export interface ResolvedDesign extends Design { motionSpec: MotionSpec }

export function resolveDesign(id?: string | null, motionOverride?: string | null): ResolvedDesign {
  const base = DESIGNS.find((d) => d.id === id) ?? DESIGNS[0]!;
  const motion = (motionOverride && motionOverride in MOTIONS ? motionOverride : base.motion) as MotionName;
  return { ...base, motion, motionSpec: MOTIONS[motion] };
}

/** Readable text colour (near-black or white) for content drawn on top of `hex`. */
export function contrastOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#0B0F14' : '#FFFFFF';
}
