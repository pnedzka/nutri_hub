// News rules shared by the server and the browser: limits, image paths and the body. A post's body is plain text
// with light formatting (headings, lists, bold, italic, links; see `blocks`); comments are plain text with links
// (`paragraphs`). Neither is ever HTML: the browser renders the parsed pieces as React elements.

export const TITLE_MAX = 200;
export const BODY_MAX = 20000;
export const COMMENT_MAX = 2000;
export const SUMMARY_MAX = 300;
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
  const text = plainText(body).replace(/\s+/g, ' ').trim();
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

// ---- Formatting of posts ------------------------------------------------------------------------------------
//   ## Heading        ### Smaller heading
//   - item            (a list; "* item" works too)
//   **bold**  _italic_  [label](https://…)  https://… (a bare link)
//   ---               (a dividing line)
// Paragraphs are separated by an empty line; a single line break stays a line break.

export type Inline = { text: string; bold?: true; italic?: true } | { url: string; label: string };

export type Block =
  | { type: 'heading'; level: 2 | 3; content: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'rule' }
  | { type: 'paragraph'; lines: Inline[][] };

const INLINE_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*(.+?)\*\*|(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)|\bhttps?:\/\/[^\s<>"]+/g;

function plainSegments(text: string, style: { bold?: true; italic?: true }): Inline[] {
  return segments(text).map((s) => ('url' in s ? { url: s.url, label: s.url } : { text: s.text, ...style }));
}

/** One line of a post as text, bold, italic and links. */
export function inline(line: string, style: { bold?: true; italic?: true } = {}): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  const push = (text: string) => {
    if (!text) return;
    const prev = parts[parts.length - 1];
    if (prev && 'text' in prev && prev.bold === style.bold && prev.italic === style.italic) prev.text += text;
    else parts.push({ text, ...style });
  };
  for (const match of line.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    const [whole, label, labelUrl, bold, before, italic] = match;
    push(line.slice(last, start));
    if (label !== undefined) parts.push({ url: labelUrl, label: label.trim() || labelUrl });
    else if (bold !== undefined) parts.push(...inline(bold, { ...style, bold: true }));
    else if (italic !== undefined) {
      push(before);
      parts.push(...inline(italic, { ...style, italic: true }));
    } else {
      const [link] = plainSegments(whole, style);
      parts.push(link);
      const rest = whole.slice('url' in link ? link.url.length : whole.length);
      push(rest);
    }
    last = start + whole.length;
  }
  push(line.slice(last));
  return parts;
}

const LIST_ITEM = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

/** The body of a post as headings, lists, dividing lines and paragraphs. */
export function blocks(body: string): Block[] {
  const result: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: Inline[][] | null = null;
  const close = () => {
    paragraph = null;
    list = null;
  };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      close();
      continue;
    }
    const heading = line.match(HEADING);
    if (RULE.test(line)) {
      close();
      result.push({ type: 'rule' });
    } else if (heading) {
      close();
      result.push({ type: 'heading', level: heading[1].length === 3 ? 3 : 2, content: inline(heading[2].trim()) });
    } else if (LIST_ITEM.test(line)) {
      paragraph = null;
      if (!list) {
        list = [];
        result.push({ type: 'list', items: list });
      }
      list.push(inline(line.match(LIST_ITEM)![1].trim()));
    } else {
      list = null;
      if (!paragraph) {
        paragraph = [];
        result.push({ type: 'paragraph', lines: paragraph });
      }
      paragraph.push(inline(line.trim()));
    }
  }
  return result;
}

const inlineText = (parts: Inline[]) => parts.map((p) => ('url' in p ? p.label : p.text)).join('');

/** The body without formatting marks, for excerpts and e-mails. */
export function plainText(body: string): string {
  return blocks(body)
    .map((b) => {
      if (b.type === 'heading') return inlineText(b.content);
      if (b.type === 'list') return b.items.map(inlineText).join('\n');
      if (b.type === 'rule') return '';
      return b.lines.map(inlineText).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}
