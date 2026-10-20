// News data on the server. Like the leave tables, the news tables and the "intranet" bucket have no policies: only
// this server reads and writes them (secret key), after checking who is asking. Who may do what is decided here.

import { BODY_MAX, parseImages, TITLE_MAX, type NewsImage } from '../../shared/news.js';
import type { NewsPostInput, ShownImage } from '../../shared/newsApi.js';
import type { AppUser } from './auth.js';
import { HttpError } from './http.js';
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

/** Edits or deletes a post: its author while still an editor, or an administrator. */
export const canEditPost = (viewer: AppUser, authorId: string | null, editor: boolean) => viewer.isAdmin || (editor && authorId === viewer.id);

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
export const POST_COLUMNS = 'id, author_id, title, body, images, created_at, updated_at';

/** Title, body and images of a post from the browser, checked. */
export function readPost(body: Partial<NewsPostInput>) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!title) throw new HttpError(400, 'Give the post a title.');
  if (title.length > TITLE_MAX) throw new HttpError(400, `The title can have at most ${TITLE_MAX} characters.`);
  if (text.length > BODY_MAX) throw new HttpError(400, `The text can have at most ${BODY_MAX} characters.`);
  const images = parseImages(body.images ?? []);
  if (!images) throw new HttpError(400, 'Some images could not be saved. Add them again.');
  if (!text && !images.length) throw new HttpError(400, 'Write something or add photos.');
  return { title, body: text, images };
}
