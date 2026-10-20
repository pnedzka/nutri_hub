//   GET  /api/news?before=ISO  → NewsListResponse (shared/newsApi.ts), newest first, 12 at a time
//   POST /api/news             body NewsPostInput → { id }   (administrators and editors)
//
// A new post is e-mailed to everyone with access to News except its author.

import { excerpt } from '../../shared/news.js';
import type { NewsListResponse, NewsPostInput, NewsPostSummary } from '../../shared/newsApi.js';
import { requireApp } from '../_lib/auth.js';
import { appUrl, handle, HttpError, json, readJson } from '../_lib/http.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { sendToEach } from '../_lib/notify.js';
import { isEditor, POST_COLUMNS, readPost, signImages, toImages } from '../_lib/news.js';
import { db } from '../_lib/supabase.js';

const PAGE = 12;

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    const before = new URL(request.url).searchParams.get('before');
    let query = db().from('news_posts').select(POST_COLUMNS).order('created_at', { ascending: false }).limit(PAGE + 1);
    if (before) {
      if (Number.isNaN(Date.parse(before))) throw new HttpError(400, 'Invalid request.');
      query = query.lt('created_at', before);
    }
    const [{ data: rows, error }, people, canPublish] = await Promise.all([query, appPeople('news'), isEditor(viewer)]);
    if (error) throw error;
    const page = (rows ?? []).slice(0, PAGE);
    const ids = page.map((r) => String(r.id));

    const [{ data: likes, error: likesError }, { data: comments, error: commentsError }] = ids.length
      ? await Promise.all([
          db().from('news_likes').select('post_id, user_id').in('post_id', ids),
          db().from('news_comments').select('post_id').in('post_id', ids),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (likesError) throw likesError;
    if (commentsError) throw commentsError;

    const byId = new Map(people.map((p) => [p.id, toPerson(p)]));
    const covers = await signImages(page.flatMap((r) => toImages(r.images).slice(0, 1)));
    const coverByPath = new Map(covers.map((c) => [c.path, c]));

    const posts: NewsPostSummary[] = page.map((row) => {
      const id = String(row.id);
      const images = toImages(row.images);
      const postLikes = (likes ?? []).filter((l) => l.post_id === id);
      return {
        id,
        title: String(row.title),
        excerpt: excerpt(String(row.body)),
        author: row.author_id ? (byId.get(String(row.author_id)) ?? { id: String(row.author_id), name: 'Former user', email: '' }) : null,
        createdAt: String(row.created_at),
        cover: images[0] ? (coverByPath.get(images[0].path) ?? null) : null,
        imageCount: images.length,
        likeCount: postLikes.length,
        commentCount: (comments ?? []).filter((c) => c.post_id === id).length,
        likedByMe: postLikes.some((l) => l.user_id === viewer.id),
      };
    });
    const response: NewsListResponse = {
      posts,
      nextCursor: (rows ?? []).length > PAGE ? posts[posts.length - 1].createdAt : null,
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
    const post = readPost(await readJson<Partial<NewsPostInput>>(request));
    const { data, error } = await db()
      .from('news_posts')
      .insert({ author_id: viewer.id, updated_by: viewer.id, ...post })
      .select('id')
      .single();
    if (error) throw error;
    const id = String(data.id);

    const people = await appPeople('news');
    const author = people.find((p) => p.id === viewer.id)?.name ?? viewer.email;
    await sendToEach(
      people.filter((p) => p.id !== viewer.id).map((p) => p.email),
      {
        label: 'News',
        subject: `Nutri Partners news: ${post.title}`,
        paragraphs: ['Hello,', `${author} has published a new post in Nutri Partners News.`, ...(post.body ? [excerpt(post.body, 300)] : [])],
        details: [
          ['Title', post.title],
          ...(post.images.length ? ([['Photos', String(post.images.length)]] as [string, string][]) : []),
        ],
        button: { label: 'Read the post', url: `${appUrl(request)}/news/${id}` },
      },
    );
    return json({ id }, 201);
  });
}
