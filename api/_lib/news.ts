// News data on the server. Like the leave tables, the news tables and the "intranet" bucket have no policies: only
// this server reads and writes them (secret key), after checking who is asking. Who may do what is decided here.

import { BODY_MAX, excerpt, parseImages, SUMMARY_MAX, TITLE_MAX, type NewsImage } from '../../shared/news.js';
import type { Person } from '../../shared/leaveApi.js';
import type { NewsPostInput, PostStatus, ShownImage } from '../../shared/newsApi.js';
import type { AppUser } from './auth.js';
import { appUrl, HttpError } from './http.js';
import { sendToEach } from './notify.js';
import { personOf, type PersonRow } from './people.js';
import { db } from './supabase.js';
import { logError } from './monitoring.js';

export const BUCKET = 'intranet';
const LINK_SECONDS = 60 * 60;

/** Publishes news: administrators and the editors they chose. */
export async function isEditor(viewer: AppUser): Promise<boolean> {
  if (viewer.isAdmin) return true;
  const { data, error } = await db().from('news_editors').select('user_id').eq('user_id', viewer.id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** The people on a post: the author shown and who wrote it. */
export interface PostOwners {
  author_id?: unknown;
  created_by?: unknown;
}

/** Edits, publishes or deletes a post: its author or the editor who wrote it, while still an editor, or an administrator. */
export const canEditPost = (viewer: AppUser, post: PostOwners, editor: boolean) =>
  viewer.isAdmin || (editor && (post.author_id === viewer.id || post.created_by === viewer.id));

/** The author shown: the account, or the name kept from the old intranet when the person has no account here. */
export function authorOf(people: Map<string, PersonRow>, row: { author_id?: unknown; legacy_author?: unknown }): Person | null {
  if (row.author_id) return personOf(people, row.author_id);
  return typeof row.legacy_author === 'string' && row.legacy_author ? { id: '', name: row.legacy_author, email: '' } : null;
}

export const statusOf = (row: { status?: unknown }): PostStatus => (row.status === 'draft' ? 'draft' : 'published');

/** The date shown on a post: when it was published, else when it was created. */
export const shownAt = (row: { published_at?: unknown; created_at?: unknown }) => String(row.published_at ?? row.created_at);

/** The cover of a post: the one chosen in the editor, else the first photo. */
export function coverOf(row: { cover?: unknown; images?: unknown }): NewsImage | null {
  const cover = row.cover as NewsImage | null | undefined;
  if (cover && typeof cover === 'object' && typeof cover.path === 'string') return cover;
  return toImages(row.images)[0] ?? null;
}

/** E-mails a post that has just been published to everyone with access to News, except the author and the editor. */
export async function notifyPublished(
  request: Request,
  post: { id: string; title: string; summary: string; body: string; images: NewsImage[] },
  people: PersonRow[],
  author: string,
  skip: string[],
): Promise<void> {
  const text = post.summary || (post.body ? excerpt(post.body, 300) : '');
  await sendToEach(
    people.filter((p) => !skip.includes(p.id)).map((p) => p.email),
    {
      label: 'News',
      subject: `Nutri Partners news: ${post.title}`,
      paragraphs: ['Hello,', `${author} has published a new post in Nutri Partners News.`, ...(text ? [text] : [])],
      details: [
        ['Title', post.title],
        ...(post.images.length ? ([['Photos', String(post.images.length)]] as [string, string][]) : []),
      ],
      button: { label: 'Read the post', url: `${appUrl(request)}/news/${post.id}` },
    },
  );
}

/** Edits a comment: its author. Deletes it: its author or an administrator. */
export const canEditComment = (viewer: AppUser, authorId: string | null) => authorId === viewer.id;
export const canDeleteComment = (viewer: AppUser, authorId: string | null) => viewer.isAdmin || authorId === viewer.id;

export const toImages = (value: unknown): NewsImage[] => (Array.isArray(value) ? (value as NewsImage[]) : []);

/** Signed links (one hour) for images; images that cannot be signed are left out. */
export async function signImages(images: NewsImage[]): Promise<ShownImage[]> {
  if (!images.length) return [];
  const { data, error } = await db()
    .storage.from(BUCKET)
    .createSignedUrls(
      images.map((i) => i.path),
      LINK_SECONDS,
    );
  if (error) throw error;
  const urls = new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  return images.flatMap((image) => {
    const url = urls.get(image.path);
    return url ? [{ ...image, url }] : [];
  });
}

/** Deletes images from storage (a failure is logged: a leftover file does no harm). */
export async function removeImages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await db().storage.from(BUCKET).remove(paths);
  if (error) logError('news.removeImages', error);
}

/** Columns of news_posts the API reads. */
export const POST_COLUMNS =
  'id, author_id, created_by, legacy_author, legacy_id, status, title, summary, body, cover, images, created_at, published_at, updated_at';

/** A post from the browser, checked. The author must be someone with access to News (`authors`), the editor by default. */
export function readPost(body: Partial<NewsPostInput>, authors: Set<string>, fallbackAuthor: string) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').trim() : '';
  const summary = typeof body.summary === 'string' ? body.summary.replace(/\s+/g, ' ').trim() : '';
  if (!title) throw new HttpError(400, 'Give the post a title.');
  if (title.length > TITLE_MAX) throw new HttpError(400, `The title can have at most ${TITLE_MAX} characters.`);
  if (summary.length > SUMMARY_MAX) throw new HttpError(400, `The summary can have at most ${SUMMARY_MAX} characters.`);
  if (text.length > BODY_MAX) throw new HttpError(400, `The text can have at most ${BODY_MAX} characters.`);
  const images = parseImages(body.images ?? []);
  const cover = body.cover ? parseImages([body.cover])?.[0] : null;
  if (!images || cover === undefined) throw new HttpError(400, 'Some images could not be saved. Add them again.');
  if (!text && !images.length) throw new HttpError(400, 'Write something or add photos.');
  if (body.status !== undefined && body.status !== 'draft' && body.status !== 'published') throw new HttpError(400, 'Invalid request.');
  const authorId = typeof body.authorId === 'string' ? body.authorId : fallbackAuthor;
  if (!authors.has(authorId)) throw new HttpError(400, 'Choose an author who has access to News.');
  // '' keeps an imported post's author who has no account here (legacy_author).
  return { title, summary, body: text, cover, images, status: (body.status ?? 'published') as PostStatus, author_id: authorId || null };
}

/** All image paths of a post (cover and photos). */
export const pathsOf = (row: { cover?: unknown; images?: unknown }) => {
  const cover = row.cover as NewsImage | null | undefined;
  return [...(cover?.path ? [cover.path] : []), ...toImages(row.images).map((i) => i.path)];
};

/** A search for ilike: characters that PostgREST filters or patterns treat specially are dropped. */
export function searchPattern(q: string | null): string | null {
  const text = (q ?? '').replace(/[,()*%_\\:."']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return text ? `%${text}%` : null;
}

