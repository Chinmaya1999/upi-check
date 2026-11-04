/**
 * Paisa backend. Plain HTTP for now — Android is only allowed cleartext to this host (see network_security_config.xml).
 * CI can override at build time with EXPO_PUBLIC_API_URL (the host must also be allowed in network_security_config.xml).
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://13.201.66.53';
