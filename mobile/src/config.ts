/**
 * Paisa backend, served over HTTPS (Caddy + Let's Encrypt). Android blocks cleartext traffic entirely (see network_security_config.xml).
 * CI overrides at build time with EXPO_PUBLIC_API_URL.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.paisaduniya.in';

/** The Google Play build ships without SMS reading (Play restricts READ_SMS). CI sets EXPO_PUBLIC_SMS=0 for it. */
export const SMS_ENABLED = process.env.EXPO_PUBLIC_SMS !== '0';

/** Shown to the team next to feedback. The exact build number is stamped by CI; this is the release line. */
export const APP_VERSION = '0.6';
