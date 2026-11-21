/**
 * Helper to get an asset URL respecting the Vite deployment base path
 * (e.g. for GitHub Pages subpath deployments or root deployments).
 */
export function getAssetUrl(relativePath: string): string {
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}${cleanPath}`;
}

/**
 * Round emblem logo for Navbar, Favicon, PDF Report Headers, and Modals.
 */
export const LOGO_ROUND_URL: string = getAssetUrl('logo-round.png');

/**
 * Horizontal banner logo for the main Login / Auth screen.
 */
export const LOGO_BANNER_URL: string = getAssetUrl('logo-banner.png');

/**
 * Backward-compatible alias pointing to the round ParlourPro POS emblem.
 */
export const AMUL_LOGO_URL: string = LOGO_ROUND_URL;

export default LOGO_ROUND_URL;
