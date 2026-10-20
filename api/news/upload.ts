//   POST /api/news/upload  body UploadRequest → UploadResponse   (administrators and editors)
//
// One-time upload links to the private "intranet" bucket, so photos go from the browser straight to storage (no
// size limit of the functions). The paths are random; a post accepts only paths of this shape (shared/news.ts).

import { randomUUID } from 'node:crypto';
import { IMAGE_EXTENSIONS, IMAGE_TYPES, IMAGES_MAX, type ImageType } from '../../shared/news.js';
import type { UploadRequest, UploadResponse } from '../../shared/newsApi.js';
import { requireApp } from '../_lib/auth.js';
import { handle, HttpError, json, readJson } from '../_lib/http.js';
import { BUCKET, isEditor } from '../_lib/news.js';
import { db } from '../_lib/supabase.js';

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const viewer = await requireApp(request, 'news');
    if (!(await isEditor(viewer))) throw new HttpError(403, 'Only administrators and news editors can add photos.');
    const body = await readJson<Partial<UploadRequest>>(request);
    const types = Array.isArray(body.types) ? body.types : [];
    if (!types.length || types.length > IMAGES_MAX || !types.every((t): t is ImageType => (IMAGE_TYPES as readonly string[]).includes(t))) {
      throw new HttpError(400, `Add from 1 to ${IMAGES_MAX} photos (JPEG, PNG or WebP).`);
    }
    const folder = randomUUID();
    const uploads: UploadResponse['uploads'] = [];
    for (const type of types) {
      const path = `news/${folder}/${randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
      const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      uploads.push({ path, token: data.token });
    }
    return json({ uploads } satisfies UploadResponse);
  });
}
