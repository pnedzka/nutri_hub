import { useRef, useState } from 'react';
import { Eye, EyeOff, FileUp, Heart, MessageCircle, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ActionsMenu, type MenuAction } from '../../components/ActionsMenu';
import { Button } from '../../components/Button';
import { Card, CardBody } from '../../components/Card';
import { Select } from '../../components/Field';
import { Input } from '../../components/Input';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { ManagedPost, ManagerResponse, NewsInteraction, PostStatus } from '../../../shared/newsApi';
import { parseExport, type ImportRequest, type ImportResult } from '../../../shared/newsImport';
import { EmptyState as Empty, ErrorNote, Loading } from '../../components/States';
import { useApi } from '../leave/useApi';
import { formatDay } from './format';
import { DraftBadge, PageHeader } from './ui';
import { useDebounced } from './useDebounced';
import { askConfirm } from '../../lib/confirm';

type Filter = 'all' | PostStatus;

const interact = (body: NewsInteraction) => api('/api/news/post', { method: 'POST', body });

/** Import of the old intranet's news (administrators): the export file from n8n, sent article by article. */
function ImportCard({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const run = async (file: File | undefined) => {
    if (!file) return;
    setSummary(null);
    let data;
    try {
      data = parseExport(JSON.parse(await file.text()));
    } catch {
      data = null;
    }
    if (!data) {
      toast.error('This is not a news export', 'Choose the JSON file from the “Intranet - News export” workflow.');
      return;
    }
    const totals = { imported: 0, skipped: 0, failed: 0, missingImages: 0 };
    setProgress({ done: 0, total: data.articles.length });
    for (const [i, article] of data.articles.entries()) {
      const comments = data.comments.filter((c) => c.articleId === article._id);
      const ids = new Set([article.authorId, ...(article.kudos ?? []), ...comments.map((c) => c.userId)]);
      const body: ImportRequest = { action: 'import', article, comments, users: data.users.filter((u) => ids.has(u.id)) };
      try {
        const result = await api<ImportResult>('/api/news/post', { method: 'POST', body });
        totals[result.status] += 1;
        totals.missingImages += result.missingImages;
      } catch {
        totals.failed += 1;
      }
      setProgress({ done: i + 1, total: data.articles.length });
    }
    setProgress(null);
    const parts = [`${totals.imported} imported`, `${totals.skipped} already here`];
    if (totals.failed) parts.push(`${totals.failed} failed (run the import again)`);
    if (totals.missingImages) parts.push(`${totals.missingImages} images could not be downloaded`);
    setSummary(`${parts.join(', ')}.`);
    onDone();
  };

  return (
    <Card>
      <CardBody className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">Import from the old intranet</p>
          <p className="text-xs text-gray-500">
            {summary ?? 'Posts with their photos, comments and likes. Nobody gets an e-mail; posts already imported are skipped.'}
          </p>
        </div>
        <Button variant="secondary" className="min-h-11 sm:min-h-0" isLoading={Boolean(progress)} onClick={() => input.current?.click()}>
          <FileUp size={16} />
          {progress ? `Importing ${progress.done} of ${progress.total}…` : 'Choose export file'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            void run(file);
          }}
        />
      </CardBody>
    </Card>
  );
}

function Row({ post, reload }: { post: ManagedPost; reload: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: PostStatus) => {
    if (status === 'published' && !post.publishedAt && !(await askConfirm('Publish this post?\n\nEveryone with access to News gets an e-mail.'))) return;
    setBusy(true);
    try {
      await interact({ action: 'set-status', postId: post.id, status });
      toast.success(status === 'published' ? 'Post published' : 'Moved to drafts', post.title);
      reload();
    } catch (e) {
      toast.error('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await askConfirm(`Delete “${post.title}” with its photos, comments and likes?`))) return;
    setBusy(true);
    try {
      await api(`/api/news/post?id=${encodeURIComponent(post.id)}`, { method: 'DELETE' });
      toast.success('Post deleted', post.title);
      reload();
    } catch (e) {
      toast.error('Could not delete', (e as Error).message);
      setBusy(false);
    }
  };

  const actions: MenuAction[] = post.canEdit
    ? [
        { label: 'Edit', icon: <Pencil size={16} />, to: `/news/${post.id}/edit` },
        post.status === 'draft'
          ? { label: 'Publish', icon: <Eye size={16} />, onSelect: () => void setStatus('published') }
          : { label: 'Move to drafts', icon: <EyeOff size={16} />, onSelect: () => void setStatus('draft') },
        { label: 'Delete', icon: <Trash2 size={16} />, danger: true, onSelect: () => void remove() },
      ]
    : [{ label: 'Edit', icon: <Pencil size={16} />, disabledReason: 'Only its author or an administrator can change this post.' }];

  return (
    <li className={`flex items-center gap-3 px-4 py-3 sm:px-6 ${busy ? 'opacity-60' : ''}`}>
      <button type="button" className="hidden shrink-0 sm:block" onClick={() => navigate(`/news/${post.id}`)} aria-label={`Open ${post.title}`} tabIndex={-1}>
        {post.cover ? (
          <img src={post.cover.url} alt="" loading="lazy" className="h-12 w-20 rounded-md bg-gray-100 object-cover" />
        ) : (
          <span className="block h-12 w-20 rounded-md bg-gray-100" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <Link to={`/news/${post.id}`} className="block truncate text-sm font-medium text-gray-900 hover:text-[#CC1F1F]">
          {post.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          {post.status === 'draft' ? <DraftBadge /> : <span className="text-green-700">Published</span>}
          <span>{formatDay(post.publishedAt ?? post.createdAt)}</span>
          <span>· {post.author?.name ?? 'Former user'}</span>
          {post.imported && <span>· from the old intranet</span>}
          <span className="inline-flex items-center gap-1">
            · <Heart size={12} aria-hidden="true" /> {post.likeCount}
            <span className="sr-only">likes</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={12} aria-hidden="true" /> {post.commentCount}
            <span className="sr-only">comments</span>
          </span>
        </p>
      </div>
      <ActionsMenu label={`Actions for ${post.title}`} actions={actions} />
    </li>
  );
}

export function Manager() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useDebounced(search.trim());
  const params = new URLSearchParams({ view: 'manager' });
  if (q) params.set('q', q);
  if (filter !== 'all') params.set('status', filter);
  const { data, error, reload } = useApi<ManagerResponse>(`/api/news?${params.toString()}`);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/news', label: 'News' }}
        title="News manager"
        actions={
          <>
            {data?.isAdmin && (
              <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => navigate('/news/editors')}>
                <Users size={16} />
                Editors
              </Button>
            )}
            <Button className="min-h-11 sm:min-h-0" onClick={() => navigate('/news/new')}>
              <Plus size={16} />
              New post
            </Button>
          </>
        }
      />
      <p className="text-sm text-gray-600">All posts, drafts too. Drafts are seen only by editors; a post is e-mailed to everyone with access to News when it is first published.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-80">
          <Input id="manager-search" type="search" aria-label="Search posts" placeholder="Search posts…" leftIcon={<Search size={16} />} value={search} onChange={(e) => setSearch(e.target.value)} className="text-base sm:text-sm" />
        </div>
        <div className="sm:w-48">
          <Select aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="text-base sm:text-sm">
            <option value="all">All posts</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </Select>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!data && !error && <Loading />}
      {data && (
        <Card>
          {data.posts.length ? (
            <ul className="divide-y divide-gray-100">
              {data.posts.map((post) => (
                <Row key={post.id} post={post} reload={reload} />
              ))}
            </ul>
          ) : (
            <CardBody>
              <Empty>{q || filter !== 'all' ? 'No posts match.' : 'No posts yet.'}</Empty>
            </CardBody>
          )}
        </Card>
      )}
      {data?.isAdmin && <ImportCard onDone={reload} />}
    </div>
  );
}
