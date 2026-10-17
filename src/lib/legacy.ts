import { OWNER_LOOKUP_URL } from '../apps';

/**
 * nutripartners.vercel.app used to be the HubSpot owner lookup, whose search links look like /?q=wellu.eu.
 * Those links now go on to the owner lookup's own address; everything else stays in the hub.
 */
export function legacyRedirect(url: URL): string | null {
  if (url.pathname !== '/' || !url.searchParams.has('q')) return null;
  return `${OWNER_LOOKUP_URL}/${url.search}${url.hash}`;
}
