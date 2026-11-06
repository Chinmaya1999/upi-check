/**
 * Paisa backend, served over HTTPS (Caddy + Let's Encrypt). Android blocks cleartext traffic entirely (see network_security_config.xml).
 * CI overrides at build time with EXPO_PUBLIC_API_URL.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.paisaduniya.in';
