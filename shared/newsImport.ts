// Import of posts from the old intranet (Firebase, collection newsArticles): the export the administrator uploads
// in News → Manager, its HTML turned into the post format of shared/news.ts, and the size of downloaded images.

import { BODY_MAX, SUMMARY_MAX, TITLE_MAX } from './news.js';

/** One article of the export, as Firestore gives it (only the fields used). */
export interface LegacyArticle {
  _id: string;
  title?: string;
  contentHtml?: string;
  shortDescription?: string;
  imageUrl?: string;
  galleryUrls?: string[];
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
  authorId?: string;
  authorName?: string;
  kudos?: string[];
}

export interface LegacyComment {
  _id: string;
  articleId: string;
  userId?: string;
  userName?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LegacyUser {
  id: string;
  email: string | null;
  name: string | null;
}

/** The file from the export workflow in n8n ("Intranet - News export"). */
export interface LegacyExport {
  articles: LegacyArticle[];
  comments: LegacyComment[];
  users: LegacyUser[];
}

/** POST /api/news/post { action: 'import', … }: one article with its comments and the people it names. */
export interface ImportRequest {
  action: 'import';
  article: LegacyArticle;
  comments: LegacyComment[];
  users: LegacyUser[];
}

export interface ImportResult {
  status: 'imported' | 'skipped';
  id: string;
  /** Images that could not be downloaded (left out). */
  missingImages: number;
}

/** The export file, checked; null when it is not one. */
export function parseExport(value: unknown): LegacyExport | null {
  if (!value || typeof value !== 'object') return null;
  const { articles, comments, users } = value as Record<string, unknown>;
  if (!Array.isArray(articles) || !articles.every((a) => a && typeof a === 'object' && typeof (a as LegacyArticle)._id === 'string')) return null;
  return {
    articles: articles as LegacyArticle[],
    // Only the fields used (the intranet keeps avatars as large data: links in comments).
    comments: Array.isArray(comments)
      ? (comments as LegacyComment[])
          .filter((c) => c && typeof c._id === 'string' && typeof c.articleId === 'string')
          .map(({ _id, articleId, userId, userName, content, createdAt, updatedAt }) => ({ _id, articleId, userId, userName, content, createdAt, updatedAt }))
      : [],
    users: Array.isArray(users) ? (users as LegacyUser[]).filter((u) => u && typeof u.id === 'string') : [],
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Moves spaces out of **…** and _…_ and drops empty marks, so the marks stay valid. */
function tidyMarks(text: string, mark: string): string {
  const m = mark.replace(/\*/g, '\\*');
  return text
    .replace(new RegExp(`${m}(\\s*)${m}`, 'g'), '$1')
    .replace(new RegExp(`${m}(\\s*)([^\\n]*?\\S)(\\s*)${m}`, 'g'), `$1${mark}$2${mark}$3`);
}

/** HTML of an intranet article as the post format: headings, lists, bold, italic, links; other tags are dropped. */
export function htmlToBody(html: string): string {
  let text = html.replace(/\r\n?/g, '\n').replace(/\n/g, ' ');
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
    const url = decodeEntities(href.trim());
    const shown = label.replace(/<[^>]+>/g, '').trim();
    if (!/^https?:\/\//i.test(url)) return shown;
    return shown && shown !== url ? `[${shown.replace(/[[\]]/g, '')}](${url})` : url;
  });
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n\n---\n\n')
    .replace(/<h[12][^>]*>/gi, '\n\n## ')
    .replace(/<h[3-6][^>]*>/gi, '\n\n### ')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(ul|ol)>/gi, '\n\n')
    .replace(/<(ul|ol)[^>]*>/gi, '\n\n')
    .replace(/<\/?(p|div)[^>]*>/gi, '\n\n')
    .replace(/<\/?(b|strong)(\s[^>]*)?>/gi, '**')
    .replace(/<\/?(i|em)(\s[^>]*)?>/gi, '_')
    .replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  const lines = text.split('\n').map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim());
  // A heading or a list item stays on one line: text after a break inside it starts a new paragraph.
  text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  text = tidyMarks(tidyMarks(text, '**'), '_');
  // "## **Title**": headings are already bold.
  text = text.replace(/^(#{2,3} )\*\*(.+)\*\*$/gm, '$1$2');
  return text.replace(/^(- )?\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, BODY_MAX);
}

export const legacyTitle = (a: LegacyArticle) => (a.title ?? '').trim().slice(0, TITLE_MAX) || 'Untitled';
export const legacySummary = (a: LegacyArticle) => decodeEntities((a.shortDescription ?? '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX);

/** Width and height of a JPEG, PNG or WebP from its bytes; null for anything else. */
export function imageInfo(bytes: Uint8Array): { type: 'image/jpeg' | 'image/png' | 'image/webp'; width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) return { type: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  if (bytes.length > 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { type: 'image/webp', width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    if (chunk === 'VP8 ') return { type: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = view.getUint32(21, true);
      return { type: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'image/jpeg', height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}
