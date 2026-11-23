// The news API's requests and responses (api/news/*), shared by the server and the browser.
import type { Person } from './leaveApi';
import type { ImageType, NewsImage } from './news';

/** An image with a signed link valid for an hour. */
export interface ShownImage extends NewsImage {
  url: string;
}

export type PostStatus = 'draft' | 'published';

export interface NewsPostSummary {
  id: string;
  title: string;
  /** The summary written by the editor, or the start of the text. */
  excerpt: string;
  author: Person | null;
  /** When the post was published (a draft: when it was created). */
  createdAt: string;
  cover: ShownImage | null;
  imageCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

/** GET /api/news?before=ISO&q=text&limit=n: published posts, newest first */
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

/** GET /api/news/post?id= (a draft only for those who may edit it) */
export interface NewsPostDetail {
  id: string;
  title: string;
  summary: string;
  body: string;
  author: Person | null;
  status: PostStatus;
  /** When it was published, else when it was created. */
  createdAt: string;
  /** Null until it is first published (then it is e-mailed). */
  publishedAt: string | null;
  updatedAt: string;
  /** The cover chosen in the editor; without one the list shows the first photo. */
  cover: ShownImage | null;
  images: ShownImage[];
  likers: Person[];
  likedByMe: boolean;
  comments: NewsComment[];
  canEdit: boolean;
}

/** POST /api/news, PUT /api/news/post?id= */
export interface NewsPostInput {
  title: string;
  summary: string;
  body: string;
  cover: NewsImage | null;
  images: NewsImage[];
  status: PostStatus;
  /** The person shown as the author (someone with access to News); the editor by default. */
  authorId: string;
}

/** One row of News → Manager. */
export interface ManagedPost {
  id: string;
  title: string;
  author: Person | null;
  status: PostStatus;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string;
  cover: ShownImage | null;
  likeCount: number;
  commentCount: number;
  imported: boolean;
  canEdit: boolean;
}

/** GET /api/news?view=manager&q=&status=draft|published (administrators and editors) */
export interface ManagerResponse {
  posts: ManagedPost[];
  isAdmin: boolean;
  /** People who can be chosen as the author. */
  authors: Person[];
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
  | { action: 'set-status'; postId: string; status: PostStatus }
  | { action: 'comment'; postId: string; body: string }
  | { action: 'edit-comment'; id: string; body: string }
  | { action: 'delete-comment'; id: string };

/** GET /api/news/editors (administrators) */
export interface EditorsResponse {
  people: (Person & { isAdmin: boolean; isEditor: boolean })[];
}

/** GET /api/news?view=authors (administrators and editors) */
export interface AuthorsResponse {
  authors: Person[];
}
