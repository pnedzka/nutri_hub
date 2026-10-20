//   GET    /api/news/post?id=  → NewsPostDetail (shared/newsApi.ts)
//   PUT    /api/news/post?id=  body NewsPostInput → { ok }   (author while an editor, or an administrator)
//   DELETE /api/news/post?id=  → { ok }                      (same)
//   POST   /api/news/post      body NewsInteraction → { ok }   (likes and comments, everyone with access to News)
//
// A comment is edited by its author and deleted by its author or an administrator.
// Editing a post does not e-mail anyone again. Images taken out of a post, or of a deleted post, are removed.

import { COMMENT_MAX } from '../../shared/news.js';
import type { NewsComment, NewsInteraction, NewsPostDetail, NewsPostInput } from '../../shared/newsApi.js';
import { requireApp } from '../_lib/auth.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { canDeleteComment, canEditComment, canEditPost, isEditor, POST_COLUMNS, readPost, removeImages, signImages, toImages } from '../_lib/news.js';
import { db } from '../_lib/supabase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
      db().from('news_comments').select('id, author_id, body, created_at, updated_at').eq('post_id', id).order('created_at'),
    ]);
    if (likesError) throw likesError;
    if (commentsError) throw commentsError;
    const byId = new Map(people.map((p) => [p.id, toPerson(p)]));
    const person = (userId: unknown) => (userId ? (byId.get(String(userId)) ?? { id: String(userId), name: 'Former user', email: '' }) : null);

    const detail: NewsPostDetail = {
      id,
      title: String(row.title),
      body: String(row.body),
      author: person(row.author_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      images: await signImages(toImages(row.images)),
      likers: (likes ?? []).map((l) => person(l.user_id)!),
      likedByMe: (likes ?? []).some((l) => l.user_id === viewer.id),
      comments: (comments ?? []).map(
        (c): NewsComment => ({
          id: String(c.id),
          author: person(c.author_id),
          body: String(c.body),
          createdAt: String(c.created_at),
          edited: Boolean(c.updated_at),
          canEdit: canEditComment(viewer, (c.author_id as string | null) ?? null),
          canDelete: canDeleteComment(viewer, (c.author_id as string | null) ?? null),
        }),
      ),
      canEdit: canEditPost(viewer, (row.author_id as string | null) ?? null, editor),
    };
    return json(detail);
  });
}

export function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const row = await findPost(request);
    if (!canEditPost(viewer, (row.author_id as string | null) ?? null, await isEditor(viewer))) {
      throw new HttpError(403, 'Only the author or an administrator can edit this post.');
    }
    const post = readPost(await readJson<Partial<NewsPostInput>>(request));
    const { error } = await db()
      .from('news_posts')
      .update({ ...post, updated_at: new Date().toISOString(), updated_by: viewer.id })
      .eq('id', String(row.id));
    if (error) throw error;
    const kept = new Set(post.images.map((i) => i.path));
    await removeImages(toImages(row.images).map((i) => i.path).filter((p) => !kept.has(p)));
    return json({ ok: true });
  });
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const row = await findPost(request);
    if (!canEditPost(viewer, (row.author_id as string | null) ?? null, await isEditor(viewer))) {
      throw new HttpError(403, 'Only the author or an administrator can delete this post.');
    }
    const { error } = await db().from('news_posts').delete().eq('id', String(row.id));
    if (error) throw error;
    await removeImages(toImages(row.images).map((i) => i.path));
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
  const { data, error } = id ? await db().from('news_posts').select('id').eq('id', id).maybeSingle() : { data: null, error: null };
  if (error) throw error;
  if (!data) throw new HttpError(404, 'This post no longer exists.');
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
    switch (body.action) {
      case 'like': {
        const postId = await requirePost(body.postId);
        const { error } = await db().from('news_likes').upsert({ post_id: postId, user_id: viewer.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
        if (error) throw error;
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
        const { error } = await db().from('news_comments').insert({ post_id: postId, author_id: viewer.id, body: commentText(body.body) });
        if (error) throw error;
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
