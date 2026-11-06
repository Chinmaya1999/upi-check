/**
 * Festival & national-holiday themes. The admin dashboard turns one on ("Go live"); every phone then shows an
 * animated festive banner and floating particles on Home, with no app update. The server sends the full spec to the app.
 */
export type FestivalMotion = 'rise' | 'fall' | 'twinkle' | 'float' | 'burst' | 'sway';

export interface Festival {
  id: string;
  name: string;                       // admin label
  kind: 'festival' | 'national';
  emoji: string;                      // big icon on the banner
  greeting: string;                   // headline on the banner
  tagline: string;                    // one line under it
  gradient: [string, string, string]; // banner background, left→right / top→bottom
  text: string;                       // text colour that reads on the gradient
  accent: string;                     // pill / glow colour
  particles: string[];                // emoji that float over the banner and Home
  motion: FestivalMotion;
  lights: string[];                   // string-light colours along the top ([] = none)
}

const D = '#FFFFFF';
export const FESTIVALS: Festival[] = [
  { id: 'diwali', name: 'Diwali', kind: 'festival', emoji: '🪔', greeting: 'Happy Diwali!', tagline: 'May your life glow with light and prosperity', gradient: ['#7C2D12', '#C2410C', '#F59E0B'], text: D, accent: '#FDE68A', particles: ['✨', '🪔', '🎇', '⭐'], motion: 'rise', lights: ['#FDE047', '#FB923C', '#F87171', '#FDE047'] },
  { id: 'holi', name: 'Holi', kind: 'festival', emoji: '🎨', greeting: 'Happy Holi!', tagline: 'Splash your day with colours of joy', gradient: ['#BE185D', '#7C3AED', '#0EA5E9'], text: D, accent: '#FBCFE8', particles: ['🟣', '🟡', '🩷', '🔵', '🟢', '🟠'], motion: 'burst', lights: [] },
  { id: 'eid', name: 'Eid', kind: 'festival', emoji: '🌙', greeting: 'Eid Mubarak!', tagline: 'Peace, joy and blessings to you and yours', gradient: ['#064E3B', '#047857', '#CA8A04'], text: D, accent: '#FDE68A', particles: ['🌙', '⭐', '✨'], motion: 'twinkle', lights: ['#FDE68A', '#FFFFFF'] },
  { id: 'christmas', name: 'Christmas', kind: 'festival', emoji: '🎄', greeting: 'Merry Christmas!', tagline: 'Wishing you joy, peace and happiness', gradient: ['#7F1D1D', '#B91C1C', '#166534'], text: D, accent: '#FECACA', particles: ['❄️', '⭐', '🎁', '❄️'], motion: 'fall', lights: ['#EF4444', '#22C55E', '#FACC15', '#38BDF8'] },
  { id: 'newyear', name: 'New Year', kind: 'festival', emoji: '🎆', greeting: 'Happy New Year!', tagline: 'Here’s to a fresh start and every goal ahead', gradient: ['#0F172A', '#4C1D95', '#BE185D'], text: D, accent: '#DDD6FE', particles: ['🎉', '✨', '🎊', '⭐'], motion: 'burst', lights: ['#A78BFA', '#F472B6', '#FDE047'] },
  { id: 'republic', name: 'Republic Day', kind: 'national', emoji: '🇮🇳', greeting: 'Happy Republic Day!', tagline: 'Jai Hind! Celebrating the 26th of January', gradient: ['#FF9933', '#FFFFFF', '#138808'], text: '#0B1F3A', accent: '#1E3A8A', particles: ['🇮🇳', '✨', '🕊️'], motion: 'float', lights: ['#FF9933', '#FFFFFF', '#138808'] },
  { id: 'independence', name: 'Independence Day', kind: 'national', emoji: '🇮🇳', greeting: 'Happy Independence Day!', tagline: 'Freedom is worth celebrating — 15th August', gradient: ['#FF9933', '#FFFFFF', '#138808'], text: '#0B1F3A', accent: '#1E3A8A', particles: ['🇮🇳', '🎉', '✨'], motion: 'rise', lights: ['#FF9933', '#FFFFFF', '#138808'] },
  { id: 'gandhi', name: 'Gandhi Jayanti', kind: 'national', emoji: '🕊️', greeting: 'Gandhi Jayanti', tagline: 'Truth, non-violence and peace — 2nd October', gradient: ['#0C4A6E', '#0369A1', '#7DD3FC'], text: D, accent: '#E0F2FE', particles: ['🕊️', '☮️', '✨'], motion: 'float', lights: [] },
  { id: 'navratri', name: 'Navratri / Garba', kind: 'festival', emoji: '💃', greeting: 'Happy Navratri!', tagline: 'Nine nights of devotion, dance and joy', gradient: ['#9D174D', '#DB2777', '#F59E0B'], text: D, accent: '#FDE68A', particles: ['🪔', '🌸', '✨', '💃'], motion: 'sway', lights: ['#F472B6', '#FDE047', '#FB923C', '#A78BFA'] },
  { id: 'dussehra', name: 'Dussehra', kind: 'festival', emoji: '🏹', greeting: 'Happy Dussehra!', tagline: 'Victory of good over evil', gradient: ['#7C2D12', '#DC2626', '#F59E0B'], text: D, accent: '#FED7AA', particles: ['🏹', '🔥', '✨'], motion: 'rise', lights: ['#FB923C', '#FDE047'] },
  { id: 'ganesh', name: 'Ganesh Chaturthi', kind: 'festival', emoji: '🐘', greeting: 'Ganpati Bappa Morya!', tagline: 'Wishing you wisdom, luck and prosperity', gradient: ['#9A3412', '#EA580C', '#FACC15'], text: D, accent: '#FEF3C7', particles: ['🌺', '🪷', '✨', '🌼'], motion: 'float', lights: ['#FDE047', '#FB923C', '#F472B6'] },
  { id: 'rakhi', name: 'Raksha Bandhan', kind: 'festival', emoji: '🧿', greeting: 'Happy Raksha Bandhan!', tagline: 'A bond of love that lasts forever', gradient: ['#9D174D', '#E11D48', '#FBBF24'], text: D, accent: '#FBCFE8', particles: ['🌸', '💖', '✨', '🧿'], motion: 'float', lights: ['#F472B6', '#FDE047'] },
  { id: 'sankranti', name: 'Makar Sankranti / Pongal', kind: 'festival', emoji: '🪁', greeting: 'Happy Sankranti & Pongal!', tagline: 'Harvest, kites and bright new beginnings', gradient: ['#0369A1', '#38BDF8', '#F59E0B'], text: D, accent: '#FEF3C7', particles: ['🪁', '☀️', '🌾', '✨'], motion: 'float', lights: [] },
  { id: 'onam', name: 'Onam', kind: 'festival', emoji: '🌼', greeting: 'Happy Onam!', tagline: 'Pookalam, feast and togetherness', gradient: ['#14532D', '#16A34A', '#FACC15'], text: D, accent: '#FEF9C3', particles: ['🌼', '🌸', '🍃', '✨'], motion: 'fall', lights: ['#FACC15', '#FFFFFF'] },
  { id: 'durga', name: 'Durga Puja', kind: 'festival', emoji: '🔱', greeting: 'Shubho Durga Puja!', tagline: 'May the Goddess bless you with strength', gradient: ['#7F1D1D', '#DC2626', '#FDE047'], text: D, accent: '#FEF08A', particles: ['🌺', '🔱', '✨', '🪔'], motion: 'sway', lights: ['#FDE047', '#F87171', '#FFFFFF'] },
];

export const festivalIds = () => FESTIVALS.map((f) => f.id);

/** The festival to show right now: the chosen one, unless its "until" date (IST, inclusive, YYYY-MM-DD) has passed. */
export function resolveFestival(id?: string | null, until?: string | null, now: Date = new Date()): Festival | null {
  if (!id) return null;
  const f = FESTIVALS.find((x) => x.id === id);
  if (!f) return null;
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until) && now.getTime() > Date.parse(`${until}T23:59:59+05:30`)) return null;
  return f;
}
