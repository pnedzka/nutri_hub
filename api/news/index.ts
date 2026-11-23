//   GET  /api/news?before=ISO&q=text&limit=n → NewsListResponse (shared/newsApi.ts): published posts, newest first,
//                                               12 at a time (limit: fewer, e.g. the hub's home page)
//   GET  /api/news?view=manager&q=&status=  → ManagerResponse: every post with drafts (administrators and editors)
//   GET  /api/news?view=authors             → AuthorsResponse: who can be shown as the author (same)
//   POST /api/news                body NewsPostInput → { id }   (administrators and editors)
//
// A post is e-mailed to everyone with access to News (except its author and the editor) when it is first published,
// either at once or later from a draft (api/news/post.ts).

import { excerpt } from '../../shared/news.js';
import type { AuthorsResponse, ManagedPost, ManagerResponse, NewsListResponse, NewsPostInput, NewsPostSummary } from '../../shared/newsApi.js';
import { requireApp, type AppUser } from '../_lib/auth.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { authorOf, canEditPost, coverOf, isEditor, notifyPublished, POST_COLUMNS, readPost, searchPattern, shownAt, signImages, statusOf, toImages } from '../_lib/news.js';
import { db } from '../_lib/supabase.js';

const PAGE = 12;
const MANAGER_MAX = 500;

async function counts(ids: string[]) {
  if (!ids.length) return { likes: [], comments: [] };
  const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
    db().from('news_likes').select('post_id, user_id').in('post_id', ids),
    db().from('news_comments').select('post_id').in('post_id', ids),
  ]);
  if (likesError) throw likesError;
  if (commentsError) throw commentsError;
  return { likes: likes ?? [], comments: comments ?? [] };
}

async function manager(viewer: AppUser, params: URLSearchParams): Promise<Response> {
  if (!(await isEditor(viewer))) throw new HttpError(403, 'Only administrators and news editors can manage news.');
  let query = db().from('news_posts').select(POST_COLUMNS).order('created_at', { ascending: false }).limit(MANAGER_MAX);
  const status = params.get('status');
  if (status === 'draft' || status === 'published') query = query.eq('status', status);
  const pattern = searchPattern(params.get('q'));
  if (pattern) query = query.or(`title.ilike.${pattern},summary.ilike.${pattern},body.ilike.${pattern}`);
  const [{ data: rows, error }, people] = await Promise.all([query, appPeople('news')]);
  if (error) throw error;
  const list = rows ?? [];
  const { likes, comments } = await counts(list.map((r) => String(r.id)));
  const byId = new Map(people.map((p) => [p.id, p]));
  const covers = await signImages(list.flatMap((r) => coverOf(r) ?? []));
  const coverByPath = new Map(covers.map((c) => [c.path, c]));
  const posts: ManagedPost[] = list.map((row) => {
    const id = String(row.id);
    const cover = coverOf(row);
    return {
      id,
      title: String(row.title),
      author: authorOf(byId, row),
      status: statusOf(row),
      createdAt: String(row.created_at),
      publishedAt: row.published_at ? String(row.published_at) : null,
      updatedAt: String(row.updated_at),
      cover: cover ? (coverByPath.get(cover.path) ?? null) : null,
      likeCount: likes.filter((l) => l.post_id === id).length,
      commentCount: comments.filter((c) => c.post_id === id).length,
      imported: Boolean(row.legacy_id),
      canEdit: canEditPost(viewer, row, true),
    };
  });
  const response: ManagerResponse = { posts, isAdmin: viewer.isAdmin, authors: people.map(toPerson) };
  return json(response);
}

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const params = new URL(request.url).searchParams;
    if (params.get('view') === 'manager') return manager(viewer, params);
    if (params.get('view') === 'authors') {
      if (!(await isEditor(viewer))) throw new HttpError(403, 'Only administrators and news editors can publish.');
      return json({ authors: (await appPeople('news')).map(toPerson) } satisfies AuthorsResponse);
    }

    const before = params.get('before');
    const limit = Math.min(PAGE, Math.max(1, Number(params.get('limit')) || PAGE));
    let query = db()
      .from('news_posts')
      .select(POST_COLUMNS)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit + 1);
    if (before) {
      if (Number.isNaN(Date.parse(before))) throw new HttpError(400, 'Invalid request.');
      query = query.lt('published_at', before);
    }
    const pattern = searchPattern(params.get('q'));
    if (pattern) query = query.or(`title.ilike.${pattern},summary.ilike.${pattern},body.ilike.${pattern}`);
    const [{ data: rows, error }, people, canPublish] = await Promise.all([query, appPeople('news'), isEditor(viewer)]);
    if (error) throw error;
    const page = (rows ?? []).slice(0, limit);
    const { likes, comments } = await counts(page.map((r) => String(r.id)));

    const byId = new Map(people.map((p) => [p.id, p]));
    const covers = await signImages(page.flatMap((r) => coverOf(r) ?? []));
    const coverByPath = new Map(covers.map((c) => [c.path, c]));

    const posts: NewsPostSummary[] = page.map((row) => {
      const id = String(row.id);
      const cover = coverOf(row);
      const postLikes = likes.filter((l) => l.post_id === id);
      return {
        id,
        title: String(row.title),
        excerpt: String(row.summary ?? '') || excerpt(String(row.body)),
        author: authorOf(byId, row),
        createdAt: shownAt(row),
        cover: cover ? (coverByPath.get(cover.path) ?? null) : null,
        imageCount: toImages(row.images).length,
        likeCount: postLikes.length,
        commentCount: comments.filter((c) => c.post_id === id).length,
        likedByMe: postLikes.some((l) => l.user_id === viewer.id),
      };
    });
    const response: NewsListResponse = {
      posts,
      nextCursor: (rows ?? []).length > limit ? posts[posts.length - 1].createdAt : null,
      canPublish,
      isAdmin: viewer.isAdmin,
    };
    return json(response);
  });
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    if (!(await isEditor(viewer))) throw new HttpError(403, 'Only administrators and news editors can publish.');
    const people = await appPeople('news');
    const post = readPost(await readJson<Partial<NewsPostInput>>(request), new Set(people.map((p) => p.id)), viewer.id);
    const now = new Date().toISOString();
    const { data, error } = await db()
      .from('news_posts')
      .insert({ ...post, created_by: viewer.id, updated_by: viewer.id, published_at: post.status === 'published' ? now : null })
      .select('id')
      .single();
    if (error) throw error;
    const id = String(data.id);

    if (post.status === 'published') {
      const author = people.find((p) => p.id === post.author_id)?.name ?? viewer.email;
      await notifyPublished(request, { id, ...post }, people, author, [viewer.id, ...(post.author_id ? [post.author_id] : [])]);
    }
    return json({ id }, 201);
  });
}
