// News rules shared by the server and the browser: limits, image paths and the plain-text body (paragraphs and
// links, never HTML).

export const TITLE_MAX = 200;
export const BODY_MAX = 20000;
export const COMMENT_MAX = 2000;
export const IMAGES_MAX = 30;
/** Images are resized in the browser to at most this many pixels on the longer side. */
export const IMAGE_MAX_SIDE = 2000;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const IMAGE_EXTENSIONS: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface NewsImage {
  /** Path in the private "intranet" bucket: news/<upload id>/<file id>.<ext> */
  path: string;
  width: number;
  height: number;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const IMAGE_PATH = new RegExp(`^news/${UUID}/${UUID}\\.(jpg|png|webp)$`);

/** The images of a post as sent by the browser; null when anything is off. */
export function parseImages(value: unknown): NewsImage[] | null {
  if (!Array.isArray(value) || value.length > IMAGES_MAX) return null;
  const images: NewsImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { path, width, height } = item as Record<string, unknown>;
    if (typeof path !== 'string' || !IMAGE_PATH.test(path)) return null;
    const w = Number(width);
    const h = Number(height);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 10000 || h > 10000) return null;
    images.push({ path, width: w, height: h });
  }
  return new Set(images.map((i) => i.path)).size === images.length ? images : null;
}

/** The start of the body for the list of posts, cut at a word. */
export function excerpt(body: string, max = 220): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?–-]+$/, '')}…`;
}

export type Segment = { text: string } | { url: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/g;

/** A line of text as plain text and links (trailing punctuation stays outside the link). */
export function segments(line: string): Segment[] {
  const parts: Segment[] = [];
  let last = 0;
  for (const match of line.matchAll(URL_PATTERN)) {
    let url = match[0];
    const trailing = url.match(/[.,;:!?)\]]+$/)?.[0] ?? '';
    if (trailing) url = url.slice(0, -trailing.length);
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: line.slice(last, start) });
    parts.push({ url });
    last = start + url.length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts;
}

/** The body as paragraphs (split at blank lines) of lines of segments. */
export function paragraphs(body: string): Segment[][][] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split('\n').map(segments));
}
