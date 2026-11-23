// Import of one post from the old intranet (News → Manager → Import, administrators). The browser sends the
// articles of the export file one by one; the server downloads their images into the private bucket, turns the
// HTML into the post format and keeps comments and likes of people it can match by e-mail. Nobody is e-mailed.
// A post is imported once (legacy_id); running the import again skips it.

import { randomUUID } from 'node:crypto';
import { COMMENT_MAX, IMAGE_EXTENSIONS, IMAGES_MAX, type NewsImage } from '../../shared/news.js';
import { htmlToBody, imageInfo, legacySummary, legacyTitle, type ImportRequest, type ImportResult } from '../../shared/newsImport.js';
import type { AppUser } from './auth.js';
import { HttpError } from './http.js';
import { logError } from './monitoring.js';
import { BUCKET, removeImages } from './news.js';
import { db } from './supabase.js';

const IMAGE_BYTES_MAX = 10 * 1024 * 1024;
const PLACEHOLDER = /^https?:\/\/(placehold\.co|picsum\.photos)\//i;

/** Downloads an image and stores it in the bucket; null when it cannot be used. */
async function copyImage(url: string): Promise<NewsImage | null> {
  if (!/^https:\/\//i.test(url) || PLACEHOLDER.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > IMAGE_BYTES_MAX) return null;
    const info = imageInfo(bytes);
    if (!info || info.width < 1 || info.height < 1 || info.width > 10000 || info.height > 10000) return null;
    const path = `news/${randomUUID()}/${randomUUID()}.${IMAGE_EXTENSIONS[info.type]}`;
    const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: info.type, upsert: false });
    if (error) throw error;
    return { path, width: info.width, height: info.height };
  } catch (error) {
    logError('news.import.image', error);
    return null;
  }
}

const isoOr = (value: unknown, fallback: string) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback);

export async function importArticle(viewer: AppUser, request: Partial<ImportRequest>): Promise<ImportResult> {
  if (!viewer.isAdmin) throw new HttpError(403, 'Only administrators can import news.');
  const article = request.article;
  if (!article || typeof article._id !== 'string' || !article._id) throw new HttpError(400, 'Invalid request.');
  const legacyId = `intranet:${article._id}`;

  const { data: existing, error: existingError } = await db().from('news_posts').select('id').eq('legacy_id', legacyId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { status: 'skipped', id: String(existing.id), missingImages: 0 };

  // People are matched by e-mail: intranet user → e-mail → account here (deactivated accounts too).
  const { data: profiles, error: profilesError } = await db().from('profiles').select('id, email');
  if (profilesError) throw profilesError;
  const accountByEmail = new Map((profiles ?? []).map((p) => [String(p.email ?? '').toLowerCase(), String(p.id)]));
  const users = new Map((Array.isArray(request.users) ? request.users : []).map((u) => [u.id, u]));
  const account = (legacyUserId: unknown) => {
    const email = typeof legacyUserId === 'string' ? users.get(legacyUserId)?.email : null;
    return email ? (accountByEmail.get(email.toLowerCase()) ?? null) : null;
  };

  const now = new Date().toISOString();
  const createdAt = isoOr(article.createdAt, now);
  const coverUrl = typeof article.imageUrl === 'string' ? article.imageUrl : '';
  const galleryUrls = (Array.isArray(article.galleryUrls) ? article.galleryUrls : []).filter((u): u is string => typeof u === 'string').slice(0, IMAGES_MAX);
  const wanted = [coverUrl, ...galleryUrls].filter((u) => u && !PLACEHOLDER.test(u));
  const [cover, ...gallery] = await Promise.all([coverUrl ? copyImage(coverUrl) : Promise.resolve(null), ...galleryUrls.map(copyImage)]);
  const images = gallery.filter((i): i is NewsImage => Boolean(i));
  const stored = [...(cover ? [cover] : []), ...images];

  const authorId = account(article.authorId);
  const published = article.published !== false;
  const { data: inserted, error } = await db()
    .from('news_posts')
    .insert({
      legacy_id: legacyId,
      title: legacyTitle(article),
      summary: legacySummary(article),
      body: htmlToBody(String(article.contentHtml ?? '')),
      cover,
      images,
      status: published ? 'published' : 'draft',
      author_id: authorId,
      legacy_author: authorId ? null : (article.authorName ?? '').trim().slice(0, 120) || null,
      created_by: viewer.id,
      updated_by: viewer.id,
      created_at: createdAt,
      published_at: published ? createdAt : null,
      updated_at: isoOr(article.updatedAt, createdAt),
    })
    .select('id')
    .single();
  if (error) {
    await removeImages(stored.map((i) => i.path));
    throw error;
  }
  const id = String(inserted.id);

  const comments = (Array.isArray(request.comments) ? request.comments : [])
    .filter((c) => c && c.articleId === article._id && typeof c.content === 'string' && c.content.trim())
    .map((c) => {
      const commentAuthor = account(c.userId);
      const at = isoOr(c.createdAt, createdAt);
      const edited = isoOr(c.updatedAt, at);
      return {
        post_id: id,
        author_id: commentAuthor,
        legacy_author: commentAuthor ? null : (c.userName ?? '').trim().slice(0, 120) || null,
        body: String(c.content).replace(/\r\n?/g, '\n').trim().slice(0, COMMENT_MAX),
        created_at: at,
        updated_at: edited !== at ? edited : null,
      };
    });
  if (comments.length) {
    const { error: commentsError } = await db().from('news_comments').insert(comments);
    if (commentsError) throw commentsError;
  }
  const likers = [...new Set((Array.isArray(article.kudos) ? article.kudos : []).map(account).filter((a): a is string => Boolean(a)))];
  if (likers.length) {
    const { error: likesError } = await db()
      .from('news_likes')
      .insert(likers.map((user_id) => ({ post_id: id, user_id, created_at: createdAt })));
    if (likesError) throw likesError;
  }
  return { status: 'imported', id, missingImages: wanted.length - stored.length };
}
