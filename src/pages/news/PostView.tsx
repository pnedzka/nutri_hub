import { useState, type FormEvent } from 'react';
import { Heart, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card, CardBody, CardHeader } from '../../components/Card';
import { Textarea } from '../../components/Field';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { COMMENT_MAX } from '../../../shared/news';
import type { NewsComment, NewsInteraction, NewsPostDetail } from '../../../shared/newsApi';
import type { Person } from '../../../shared/leaveApi';
import { Empty, ErrorNote, Loading } from '../leave/ui';
import { useApi } from '../leave/useApi';
import { Gallery } from './Gallery';
import { formatWhen } from './format';
import { PageHeader, RichText } from './ui';

const interact = (body: NewsInteraction) => api('/api/news/post', { method: 'POST', body });

/** "Anna, Piotr and 3 others" */
function likersText(likers: Person[], likedByMe: boolean, myId: string | undefined) {
  const names = [...(likedByMe ? ['You'] : []), ...likers.filter((p) => p.id !== myId).map((p) => p.name)];
  if (names.length <= 3) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

function Likes({ post, myId, reload }: { post: NewsPostDetail; myId?: string; reload: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await interact({ action: post.likedByMe ? 'unlike' : 'like', postId: post.id });
      reload();
    } catch (e) {
      toast.error('Could not save', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant={post.likedByMe ? 'danger' : 'secondary'} className="min-h-11 sm:min-h-0" onClick={toggle} disabled={busy} aria-pressed={post.likedByMe}>
        <Heart size={16} fill={post.likedByMe ? 'currentColor' : 'none'} />
        {post.likedByMe ? 'Liked' : 'Like'}
      </Button>
      {post.likers.length > 0 && (
        <button type="button" className="min-h-11 sm:min-h-0 text-left text-sm text-gray-600 hover:text-gray-900" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
          {likersText(post.likers, post.likedByMe, myId)} {post.likers.length === 1 && !post.likedByMe ? 'likes' : 'like'} this
        </button>
      )}
      {showAll && post.likers.length > 3 && (
        <ul className="w-full text-sm text-gray-600 sm:columns-2">
          {post.likers.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentForm({ initial = '', submitLabel, onSubmit, onCancel }: { initial?: string; submitLabel: string; onSubmit: (body: string) => Promise<void>; onCancel?: () => void }) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea aria-label="Comment" rows={3} maxLength={COMMENT_MAX} required value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" className="min-h-11 sm:min-h-0" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="min-h-11 sm:min-h-0" isLoading={busy} disabled={!body.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Comment({ comment, reload }: { comment: NewsComment; reload: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const remove = async () => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await interact({ action: 'delete-comment', id: comment.id });
      reload();
    } catch (e) {
      toast.error('Could not delete', (e as Error).message);
    }
  };
  const icon = 'inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700';
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium text-gray-900">{comment.author?.name ?? 'Former user'}</span>
          <span className="text-gray-500">
            {' · '}
            {formatWhen(comment.createdAt)}
            {comment.edited && ' · edited'}
          </span>
        </p>
        {!editing && (comment.canEdit || comment.canDelete) && (
          <div className="-my-1 flex shrink-0">
            {comment.canEdit && (
              <button type="button" className={icon} aria-label="Edit comment" onClick={() => setEditing(true)}>
                <Pencil size={15} />
              </button>
            )}
            {comment.canDelete && (
              <button type="button" className={icon} aria-label="Delete comment" onClick={remove}>
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-2">
          <CommentForm
            initial={comment.body}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              await interact({ action: 'edit-comment', id: comment.id, body });
              setEditing(false);
              reload();
            }}
          />
        </div>
      ) : (
        <RichText text={comment.body} className="mt-1 text-sm text-gray-700" />
      )}
    </li>
  );
}

export function PostView({ id }: { id: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: post, error, reload } = useApi<NewsPostDetail>(`/api/news/post?id=${encodeURIComponent(id)}`);
  const myId = useAuth((s) => s.user?.id);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!post || !window.confirm('Delete this post with its photos, comments and likes?')) return;
    setDeleting(true);
    try {
      await api(`/api/news/post?id=${encodeURIComponent(post.id)}`, { method: 'DELETE' });
      toast.success('Post deleted');
      navigate('/news', { replace: true });
    } catch (e) {
      toast.error('Could not delete', (e as Error).message);
      setDeleting(false);
    }
  };

  const back = { to: '/news', label: 'News' };
  if (!post) {
    return (
      <div className="space-y-6">
        <PageHeader back={back} title="News" />
        {error ? <ErrorNote>{error}</ErrorNote> : <Loading />}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        title={post.title}
        actions={
          post.canEdit && (
            <>
              <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => navigate(`/news/${post.id}/edit`)}>
                <Pencil size={16} />
                Edit
              </Button>
              <Button variant="danger" className="min-h-11 sm:min-h-0" isLoading={deleting} onClick={remove}>
                <Trash2 size={16} />
                Delete
              </Button>
            </>
          )
        }
      />
      <Card>
        <CardBody className="space-y-5 py-5">
          <p className="text-sm text-gray-500">
            {post.author?.name ?? 'Former user'} · {formatWhen(post.createdAt)}
            {post.updatedAt !== post.createdAt && ` · edited ${formatWhen(post.updatedAt)}`}
          </p>
          {post.body && <RichText text={post.body} className="text-[15px] leading-relaxed text-gray-800" />}
          <Gallery images={post.images} />
          <div className="border-t border-gray-100 pt-4">
            <Likes post={post} myId={myId} reload={reload} />
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Comments{post.comments.length > 0 && ` (${post.comments.length})`}</h2>
        </CardHeader>
        <CardBody className="space-y-5">
          {post.comments.length ? (
            <ul className="divide-y divide-gray-100">
              {post.comments.map((c) => (
                <Comment key={c.id} comment={c} reload={reload} />
              ))}
            </ul>
          ) : (
            <Empty>No comments yet.</Empty>
          )}
          <CommentForm
            submitLabel="Comment"
            onSubmit={async (body) => {
              await interact({ action: 'comment', postId: post.id, body });
              reload();
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
