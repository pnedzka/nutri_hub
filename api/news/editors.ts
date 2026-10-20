//   GET /api/news/editors → EditorsResponse                     (administrators)
//   PUT /api/news/editors  body { userId, editor: boolean } → { ok }
//
// Administrators choose who may publish news, among the people with access to News (News → Editors; decision of
// 19.10.2026: in the module itself, not in User management).

import type { EditorsResponse } from '../../shared/newsApi.js';
import { requireApp } from '../_lib/auth.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { appPeople, toPerson } from '../_lib/people.js';
import { db } from '../_lib/supabase.js';

async function requireAdmin(request: Request) {
  const viewer = await requireApp(request, 'news');
  if (!viewer.isAdmin) throw new HttpError(403, 'Only administrators can choose news editors.');
  return viewer;
}

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const [people, { data, error }] = await Promise.all([appPeople('news'), db().from('news_editors').select('user_id')]);
    if (error) throw error;
    const editors = new Set((data ?? []).map((r) => String(r.user_id)));
    const response: EditorsResponse = { people: people.map((p) => ({ ...toPerson(p), isAdmin: p.isAdmin, isEditor: editors.has(p.id) })) };
    return json(response);
  });
}

export function PUT(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireAdmin(request);
    const body = await readJson<{ userId?: unknown; editor?: unknown }>(request);
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!(await appPeople('news')).some((p) => p.id === userId)) throw new HttpError(404, 'This person has no access to News.');
    const { error } =
      body.editor === true
        ? await db().from('news_editors').upsert({ user_id: userId, added_by: viewer.id }, { onConflict: 'user_id', ignoreDuplicates: true })
        : await db().from('news_editors').delete().eq('user_id', userId);
    if (error) throw error;
    return json({ ok: true });
  });
}
