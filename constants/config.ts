export const SITE_URL = 'https://freedium-mirror.cfd/';

// Matches the mirror's own origin at the start of a URL, with either scheme and
// an optional `www.` — e.g. `http://www.freedium-mirror.cfd/`.
const SITE_ORIGIN_PATTERN = /^https?:\/\/(?:www\.)?freedium-mirror\.cfd\/*/i;

/**
 * Normalises an incoming deep-link into the path appended after {@link SITE_URL}.
 *
 * Links shared from the mirror itself already carry the `https://freedium-mirror.cfd/`
 * prefix, so passing them through verbatim would prepend it a second time.
 */
export const toSitePath = (rawUrl: string | null | undefined): string => {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return '';

  // Strip the mirror's origin; what remains is either the article URL it wraps
  // (e.g. https://medium.com/...) or nothing for the mirror's own home page.
  // Looped so an already-doubled link collapses back to the article URL too.
  let path = rawUrl;
  while (SITE_ORIGIN_PATTERN.test(path)) {
    path = path.replace(SITE_ORIGIN_PATTERN, '');
  }
  return path;
};
