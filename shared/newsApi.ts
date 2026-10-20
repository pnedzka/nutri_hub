// The news API's requests and responses (api/news/*), shared by the server and the browser.
import type { Person } from './leaveApi';
import type { ImageType, NewsImage } from './news';

/** An image with a signed link valid for an hour. */
export interface ShownImage extends NewsImage {
  url: string;
}

export interface NewsPostSummary {
  id: string;
  title: string;
  excerpt: string;
  author: Person | null;
  createdAt: string;
  cover: ShownImage | null;
  imageCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

/** GET /api/news?before=ISO */
export interface NewsListResponse {
  posts: NewsPostSummary[];
  /** Pass as `before` to load older posts; null at the end. */
  nextCursor: string | null;
  canPublish: boolean;
  isAdmin: boolean;
}

export interface NewsComment {
  id: string;
  author: Person | null;
  body: string;
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** GET /api/news/post?id= */
export interface NewsPostDetail {
  id: string;
  title: string;
  body: string;
  author: Person | null;
  createdAt: string;
  updatedAt: string;
  images: ShownImage[];
  likers: Person[];
  likedByMe: boolean;
  comments: NewsComment[];
  canEdit: boolean;
}

/** POST /api/news, PUT /api/news/post?id= */
export interface NewsPostInput {
  title: string;
  body: string;
  images: NewsImage[];
}

/** POST /api/news/upload → signed upload links for the images (editors) */
export interface UploadRequest {
  types: ImageType[];
}

export interface UploadResponse {
  uploads: { path: string; token: string }[];
}

/** POST /api/news/interact */
export type NewsInteraction =
  | { action: 'like' | 'unlike'; postId: string }
  | { action: 'comment'; postId: string; body: string }
  | { action: 'edit-comment'; id: string; body: string }
  | { action: 'delete-comment'; id: string };

/** GET /api/news/editors (administrators) */
export interface EditorsResponse {
  people: (Person & { isAdmin: boolean; isEditor: boolean })[];
}
