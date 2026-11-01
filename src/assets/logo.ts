import amulLogo from './amul-logo.jpg';

/**
 * Returns the resolved Amul logo image URL.
 * Uses Vite imported asset with automatic hash and base URL resolution,
 * with a fallback to import.meta.env.BASE_URL for public path resolution.
 */
export const AMUL_LOGO_URL: string = amulLogo;

/**
 * Helper to get an asset URL respecting the Vite deployment base path
 * (e.g. for GitHub Pages subpath deployments like /amulparlurpos/).
 */
export function getAssetUrl(relativePath: string): string {
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  const baseUrl = import.meta.env.BASE_URL || '/';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}${cleanPath}`;
}

export default amulLogo;
