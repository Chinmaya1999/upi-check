import type { Paise } from './types';

/** ₹1,25,000 (Indian digit grouping), no Intl dependency so it works on Hermes. */
export function formatINR(paise: Paise, opts: { decimals?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  // Without decimals, round to the nearest rupee (₹219.60 -> ₹220) so every screen, widget and notification agrees.
  const roundWhole = opts.decimals === false;
  const whole = (roundWhole ? Math.round(abs / 100) : Math.floor(abs / 100)).toString();
  const frac = abs % 100;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = rest ? `${rest},${last3}` : last3;
  const showFrac = opts.decimals ?? frac !== 0;
  return `${neg ? '-' : ''}₹${grouped}${showFrac ? '.' + String(frac).padStart(2, '0') : ''}`;
}
