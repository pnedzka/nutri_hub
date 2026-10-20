import { useEffect, useState } from 'react';
import { Heart, Images, MessageCircle, Plus, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { api } from '../../lib/api';
import type { NewsListResponse, NewsPostSummary } from '../../../shared/newsApi';
import { Empty, ErrorNote, Loading } from '../leave/ui';
import { formatDay } from './format';
import { PageHeader } from './ui';

function PostCard({ post }: { post: NewsPostSummary }) {
  return (
    <Link
      to={`/news/${post.id}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2"
    >
      <Card className="h-full overflow-hidden transition-colors hover:border-[#CC1F1F]/40">
        {post.cover && <img src={post.cover.url} alt="" loading="lazy" className="aspect-[16/9] w-full bg-gray-100 object-cover" />}
        <div className="px-5 py-4">
          <p className="text-xs text-gray-500">
            {formatDay(post.createdAt)}
            {post.author && ` · ${post.author.name}`}
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-900 break-words">{post.title}</h2>
          {post.excerpt && <p className="mt-1 text-sm text-gray-600 break-words">{post.excerpt}</p>}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
            <span className={`inline-flex items-center gap-1 ${post.likedByMe ? 'text-[#CC1F1F]' : ''}`}>
              <Heart size={14} fill={post.likedByMe ? 'currentColor' : 'none'} aria-hidden="true" />
              {post.likeCount}
              <span className="sr-only">likes</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={14} aria-hidden="true" />
              {post.commentCount}
              <span className="sr-only">comments</span>
            </span>
            {post.imageCount > 1 && (
              <span className="inline-flex items-center gap-1">
                <Images size={14} aria-hidden="true" />
                {post.imageCount}
                <span className="sr-only">photos</span>
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function NewsList() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<NewsListResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<NewsListResponse>('/api/news', { signal: controller.signal })
      .then((first) => setPages([first]))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, []);

  const first = pages[0];
  const last = pages[pages.length - 1];
  const posts = pages.flatMap((p) => p.posts);

  const loadMore = async () => {
    if (!last?.nextCursor) return;
    setLoadingMore(true);
    try {
      const next = await api<NewsListResponse>(`/api/news?before=${encodeURIComponent(last.nextCursor)}`);
      setPages((p) => [...p, next]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/', label: 'All apps' }}
        title="News"
        actions={
          <>
            {first?.isAdmin && (
              <Button variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => navigate('/news/editors')}>
                <Users size={16} />
                Editors
              </Button>
            )}
            {first?.canPublish && (
              <Button className="min-h-11 sm:min-h-0" onClick={() => navigate('/news/new')}>
                <Plus size={16} />
                New post
              </Button>
            )}
          </>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {!first && !error && <Loading />}
      {first && !posts.length && (
        <Card>
          <Empty>No news yet.{first.canPublish && ' Publish the first post with “New post”.'}</Empty>
        </Card>
      )}
      {posts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
      {last?.nextCursor && (
        <div className="flex justify-center">
          <Button variant="secondary" className="min-h-11 sm:min-h-0" isLoading={loadingMore} onClick={loadMore}>
            Load older posts
          </Button>
        </div>
      )}
    </div>
  );
}
