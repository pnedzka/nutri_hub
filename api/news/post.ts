//   GET    /api/news/post?id=  → NewsPostDetail (shared/newsApi.ts); a draft only for those who may edit it
//   PUT    /api/news/post?id=  body NewsPostInput → { ok }   (author or the editor who wrote it, or an administrator)
//   DELETE /api/news/post?id=  → { ok }                      (same)
//   POST   /api/news/post      body NewsInteraction → { ok }   (likes and comments on published posts, everyone with
//                                                              access to News; set-status: as PUT)
//   POST   /api/news/post      body ImportRequest → ImportResult (administrators; api/_lib/newsImport.ts)
//
// A comment is edited by its author and deleted by its author or an administrator.
// A post is e-mailed once, when it is first published; editing, unpublishing and publishing again do not e-mail.
// Images taken out of a post, or of a deleted post, are removed.

import { COMMENT_MAX } from '../../shared/news.js';
import type { NewsComment, NewsInteraction, NewsPostDetail, NewsPostInput, PostStatus } from '../../shared/newsApi.js';
import type { ImportRequest } from '../../shared/newsImport.js';
import { requireApp, type AppUser } from '../_lib/auth.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { appPeople, personOf, type PersonRow } from '../_lib/people.js';
import {
  authorOf,
  canDeleteComment,
  canEditComment,
  canEditPost,
  isEditor,
  notifyComment,
  notifyLike,
  notifyPublished,
  pathsOf,
  POST_COLUMNS,
  readPost,
  removeImages,
  shownAt,
  signImages,
  statusOf,
  toImages,
} from '../_lib/news.js';
import { importArticle } from '../_lib/newsImport.js';
import { db } from '../_lib/supabase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function announce(
  request: Request,
  viewer: AppUser,
  people: PersonRow[],
  post: { id: string; title: string; summary: string; body: string; images: { path: string; width: number; height: number }[]; author_id: string | null },
) {
  const author = people.find((p) => p.id === post.author_id)?.name ?? viewer.email;
  await notifyPublished(request, post, people, author, [viewer.id, ...(post.author_id ? [post.author_id] : [])]);
}

/** Publishes or unpublishes a post from News → Manager. */
async function setStatus(request: Request, viewer: AppUser, postId: unknown, status: unknown) {
  if (status !== 'draft' && status !== 'published') throw new HttpError(400, 'Invalid request.');
  const id = typeof postId === 'string' && UUID.test(postId) ? postId : '';
  const { data: row, error } = id ? await db().from('news_posts').select(POST_COLUMNS).eq('id', id).maybeSingle() : { data: null, error: null };
  if (error) throw error;
  if (!row) throw new HttpError(404, 'This post no longer exists.');
  if (!canEditPost(viewer, row, await isEditor(viewer))) throw new HttpError(403, 'Only the author or an administrator can publish this post.');
  if (statusOf(row) === status) return;
  const firstPublish = status === 'published' && !row.published_at;
  const now = new Date().toISOString();
  const { error: updateError } = await db()
    .from('news_posts')
    .update({ status: status as PostStatus, updated_at: now, updated_by: viewer.id, ...(firstPublish ? { published_at: now } : {}) })
    .eq('id', id);
  if (updateError) throw updateError;
  if (firstPublish) {
    await announce(request, viewer, await appPeople('news'), {
      id,
      title: String(row.title),
      summary: String(row.summary ?? ''),
      body: String(row.body),
      images: toImages(row.images),
      author_id: (row.author_id as string | null) ?? null,
    });
  }
}

async function findPost(request: Request) {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) throw new HttpError(404, 'This post does not exist.');
  const { data, error } = await db().from('news_posts').select(POST_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'This post no longer exists.');
  return data;
}

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const row = await findPost(request);
    const id = String(row.id);
    const [people, editor, { data: likes, error: likesError }, { data: comments, error: commentsError }] = await Promise.all([
      appPeople('news'),
      isEditor(viewer),
      db().from('news_likes').select('user_id, created_at').eq('post_id', id).order('created_at'),
      db().from('news_comments').select('id, author_id, legacy_author, body, created_at, updated_at').eq('post_id', id).order('created_at'),
    ]);
    if (likesError) throw likesError;
    if (commentsError) throw commentsError;
    const canEdit = canEditPost(viewer, row, editor);
    if (statusOf(row) === 'draft' && !canEdit) throw new HttpError(404, 'This post does not exist.');
    const byId = new Map(people.map((p) => [p.id, p]));
    const cover = row.cover ? (await signImages([row.cover as never]))[0] ?? null : null;

    const detail: NewsPostDetail = {
      id,
      title: String(row.title),
      summary: String(row.summary ?? ''),
      body: String(row.body),
      author: authorOf(byId, row),
      status: statusOf(row),
      createdAt: shownAt(row),
      publishedAt: row.published_at ? String(row.published_at) : null,
      updatedAt: String(row.updated_at),
      cover,
      images: await signImages(toImages(row.images)),
      likers: (likes ?? []).map((l) => personOf(byId, l.user_id)!),
      likedByMe: (likes ?? []).some((l) => l.user_id === viewer.id),
      comments: (comments ?? []).map(
        (c): NewsComment => ({
          id: String(c.id),
          author: authorOf(byId, c),
          body: String(c.body),
          createdAt: String(c.created_at),
          edited: Boolean(c.updated_at),
          canEdit: canEditComment(viewer, (c.author_id as string | null) ?? null),
          canDelete: canDeleteComment(viewer, (c.author_id as string | null) ?? null),
        }),
      ),
      canEdit,
    };
    return json(detail);
  });
}

export function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const row = await findPost(request);
    if (!canEditPost(viewer, row, await isEditor(viewer))) {
      throw new HttpError(403, 'Only the author or an administrator can edit this post.');
    }
    const people = await appPeople('news');
    const authors = new Set(people.map((p) => p.id));
    // A former author without access to News may stay on the post, and so may an imported author without an account.
    if (row.author_id) authors.add(String(row.author_id));
    else if (row.legacy_author) authors.add('');
    const post = readPost(await readJson<Partial<NewsPostInput>>(request), authors, row.author_id ? String(row.author_id) : row.legacy_author ? '' : viewer.id);
    const firstPublish = post.status === 'published' && !row.published_at;
    const now = new Date().toISOString();
    const { error } = await db()
      .from('news_posts')
      .update({
        ...post,
        ...(post.author_id ? { legacy_author: null } : {}),
        updated_at: now,
        updated_by: viewer.id,
        ...(firstPublish ? { published_at: now } : {}),
      })
      .eq('id', String(row.id));
    if (error) throw error;
    const kept = new Set([...(post.cover ? [post.cover.path] : []), ...post.images.map((i) => i.path)]);
    await removeImages(pathsOf(row).filter((p) => !kept.has(p)));
    if (firstPublish) await announce(request, viewer, people, { id: String(row.id), ...post });
    return json({ ok: true });
  });
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const row = await findPost(request);
    if (!canEditPost(viewer, row, await isEditor(viewer))) {
      throw new HttpError(403, 'Only the author or an administrator can delete this post.');
    }
    const { error } = await db().from('news_posts').delete().eq('id', String(row.id));
    if (error) throw error;
    await removeImages(pathsOf(row));
    return json({ ok: true });
  });
}

function commentText(value: unknown): string {
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
  if (!text) throw new HttpError(400, 'Write a comment first.');
  if (text.length > COMMENT_MAX) throw new HttpError(400, `A comment can have at most ${COMMENT_MAX} characters.`);
  return text;
}

async function requirePost(postId: unknown): Promise<string> {
  const id = typeof postId === 'string' ? postId : '';
  const { data, error } = id ? await db().from('news_posts').select('id').eq('id', id).eq('status', 'published').maybeSingle() : { data: null, error: null };
  if (error) throw error;
  if (!data) throw new HttpError(404, 'This post is not published.');
  return id;
}

async function requireComment(commentId: unknown) {
  const id = typeof commentId === 'string' ? commentId : '';
  const { data, error } = id ? await db().from('news_comments').select('id, author_id').eq('id', id).maybeSingle() : { data: null, error: null };
  if (error) throw error;
  if (!data) throw new HttpError(404, 'This comment no longer exists.');
  return { id, authorId: (data.author_id as string | null) ?? null };
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const body = await readJson<Partial<NewsInteraction> & Record<string, unknown>>(request);
    if ((body.action as string) === 'import') return json(await importArticle(viewer, body as Partial<ImportRequest>));
    switch (body.action) {
      case 'set-status':
        await setStatus(request, viewer, body.postId, body.status);
        break;
      case 'like': {
        const postId = await requirePost(body.postId);
        const { data: added, error } = await db()
          .from('news_likes')
          .upsert({ post_id: postId, user_id: viewer.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true })
          .select('post_id');
        if (error) throw error;
        if (added?.length) await notifyLike(request, viewer, postId);
        break;
      }
      case 'unlike': {
        const postId = await requirePost(body.postId);
        const { error } = await db().from('news_likes').delete().eq('post_id', postId).eq('user_id', viewer.id);
        if (error) throw error;
        break;
      }
      case 'comment': {
        const postId = await requirePost(body.postId);
        const text = commentText(body.body);
        const { error } = await db().from('news_comments').insert({ post_id: postId, author_id: viewer.id, body: text });
        if (error) throw error;
        await notifyComment(request, viewer, postId, text);
        break;
      }
      case 'edit-comment': {
        const comment = await requireComment(body.id);
        if (!canEditComment(viewer, comment.authorId)) throw new HttpError(403, 'Only the author can edit this comment.');
        const { error } = await db().from('news_comments').update({ body: commentText(body.body), updated_at: new Date().toISOString() }).eq('id', comment.id);
        if (error) throw error;
        break;
      }
      case 'delete-comment': {
        const comment = await requireComment(body.id);
        if (!canDeleteComment(viewer, comment.authorId)) throw new HttpError(403, 'Only the author or an administrator can delete this comment.');
        const { error } = await db().from('news_comments').delete().eq('id', comment.id);
        if (error) throw error;
        break;
      }
      default:
        throw new HttpError(400, 'Invalid request.');
    }
    return json({ ok: true });
  });
}
