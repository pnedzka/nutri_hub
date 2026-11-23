// News data on the server. Like the leave tables, the news tables and the "intranet" bucket have no policies: only
// this server reads and writes them (secret key), after checking who is asking. Who may do what is decided here.

import { BODY_MAX, excerpt, parseImages, SUMMARY_MAX, TITLE_MAX, type NewsImage } from '../../shared/news.js';
import type { Person } from '../../shared/leaveApi.js';
import type { NewsPostInput, PostStatus, ShownImage } from '../../shared/newsApi.js';
import type { AppUser } from './auth.js';
import { appUrl, HttpError } from './http.js';
import { notify } from './notifications.js';
import { appPeople, personOf, type PersonRow } from './people.js';
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

/** N1: a post has just been published; everyone with access to News (except the author and the editor) gets it in the
 * bell and by e-mail (README "Powiadomienia"). */
export async function notifyPublished(
  request: Request,
  post: { id: string; title: string; summary: string; body: string; images: NewsImage[] },
  people: PersonRow[],
  author: string,
  skip: string[],
): Promise<void> {
  const text = post.summary || (post.body ? excerpt(post.body, 300) : '');
  await notify(appUrl(request), {
    module: 'news',
    kind: 'news.published',
    to: people.filter((p) => !skip.includes(p.id)),
    title: `New post: ${post.title}`,
    body: text ? excerpt(text, 200) : `By ${author}.`,
    link: `/news/${post.id}`,
    email: {
      module: 'News',
      title: post.title,
      lead: `${author} opublikował(a) nowy wpis w Nutri Partners News.${text ? ` ${text}` : ''}`,
      details: post.images.length ? [['Zdjęcia', String(post.images.length)]] : [],
      button: 'Przeczytaj wpis',
    },
  });
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


async function postFacts(postId: string): Promise<{ title: string; authorId: string | null } | null> {
  const { data, error } = await db().from('news_posts').select('title, author_id').eq('id', postId).maybeSingle();
  if (error) throw error;
  return data ? { title: String(data.title), authorId: (data.author_id as string | null) ?? null } : null;
}

/** N2 + N3: a new comment; the post's author and the people who commented before get it in the bell. */
export async function notifyComment(request: Request, viewer: AppUser, postId: string, text: string): Promise<void> {
  try {
    const post = await postFacts(postId);
    if (!post) return;
    const [people, { data: earlier, error }] = await Promise.all([
      appPeopleById(),
      db().from('news_comments').select('author_id').eq('post_id', postId).neq('author_id', viewer.id),
    ]);
    if (error) throw error;
    const me = people.get(viewer.id)?.name ?? viewer.email;
    const author = post.authorId ? people.get(post.authorId) : undefined;
    const link = `/news/${postId}`;
    const snippet = excerpt(text, 160);
    if (author) {
      await notify(appUrl(request), { module: 'news', kind: 'news.comment', to: [author], actorId: viewer.id, title: `${me} commented on your post “${post.title}”`, body: snippet, link });
    }
    const others = [...new Set((earlier ?? []).map((c) => String(c.author_id)))].filter((id) => id !== post.authorId).flatMap((id) => people.get(id) ?? []);
    await notify(appUrl(request), { module: 'news', kind: 'news.reply', to: others, actorId: viewer.id, title: `${me} also commented on “${post.title}”`, body: snippet, link });
  } catch (error) {
    logError('notifications', error, { kind: 'news.comment' });
  }
}

/** N4: likes of a post, gathered into one unread notification for its author ("Anna and 2 others liked …"). */
export async function notifyLike(request: Request, viewer: AppUser, postId: string): Promise<void> {
  try {
    const post = await postFacts(postId);
    if (!post?.authorId || post.authorId === viewer.id) return;
    const people = await appPeopleById();
    const author = people.get(post.authorId);
    if (!author) return;
    const link = `/news/${postId}`;
    const { data: open, error } = await db()
      .from('notifications')
      .select('id, created_at')
      .eq('user_id', author.id)
      .eq('kind', 'news.liked')
      .eq('link', link)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const since = open?.[0]?.created_at as string | undefined;
    let likers: string[] = [];
    if (since) {
      const { data: likes, error: likesError } = await db().from('news_likes').select('user_id').eq('post_id', postId).gte('created_at', since).order('created_at', { ascending: false });
      if (likesError) throw likesError;
      likers = (likes ?? []).map((l) => String(l.user_id));
    }
    if (!likers.includes(viewer.id)) likers.unshift(viewer.id);
    const first = people.get(likers[0])?.name ?? viewer.email;
    const title = likers.length > 1 ? `${first} and ${likers.length - 1} other${likers.length > 2 ? 's' : ''} liked “${post.title}”` : `${first} liked your post “${post.title}”`;
    if (open?.[0]) {
      const { error: updateError } = await db().from('notifications').update({ title: title.slice(0, 200), actor_id: viewer.id }).eq('id', open[0].id);
      if (updateError) throw updateError;
    } else {
      await notify(appUrl(request), { module: 'news', kind: 'news.liked', to: [author], actorId: viewer.id, title, link });
    }
  } catch (error) {
    logError('notifications', error, { kind: 'news.liked' });
  }
}

/** N5: an administrator made the person a news editor. */
export async function notifyEditor(request: Request, viewer: AppUser, userId: string): Promise<void> {
  const people = await appPeopleById();
  const person = people.get(userId);
  if (!person) return;
  await notify(appUrl(request), {
    module: 'news',
    kind: 'news.editor',
    to: [person],
    actorId: viewer.id,
    title: 'You can now publish news',
    body: `${people.get(viewer.id)?.name ?? viewer.email} made you a News editor. Write a post with “New post” in News.`,
    link: '/news',
  });
}

async function appPeopleById(): Promise<Map<string, PersonRow>> {
  return new Map((await appPeople('news')).map((p) => [p.id, p]));
}
