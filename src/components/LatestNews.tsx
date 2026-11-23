import { useEffect, useState } from 'react';
import { ArrowRight, Heart, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { NewsListResponse } from '../../shared/newsApi';
import { formatDay } from '../pages/news/format';

/** The three newest posts on the hub's home page (people with access to News). Errors only hide the section. */
export function LatestNews() {
  const [news, setNews] = useState<NewsListResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<NewsListResponse>('/api/news?limit=3', { signal: controller.signal })
      .then(setNews)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!news?.posts.length) return null;
  return (
    <section aria-labelledby="section-latest-news">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="section-latest-news" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Latest news
        </h2>
        <Link to="/news" className="inline-flex min-h-11 sm:min-h-0 items-center gap-1 text-sm font-medium text-[#CC1F1F] hover:text-[#A01818]">
          All news
          <ArrowRight size={14} />
        </Link>
      </div>
      <ul className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {news.posts.map((post) => (
          <li key={post.id}>
            <Link
              to={`/news/${post.id}`}
              className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-colors hover:border-[#CC1F1F]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2"
            >
              {post.cover ? (
                <img src={post.cover.url} alt="" loading="lazy" className="aspect-[16/9] w-full bg-gray-100 object-cover" />
              ) : (
                <div className="aspect-[16/9] w-full bg-gray-100" />
              )}
              <div className="flex flex-1 flex-col px-4 py-3">
                <p className="text-xs text-gray-500">{formatDay(post.createdAt)}</p>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{post.title}</h3>
                <div className="mt-auto flex items-center gap-4 pt-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Heart size={13} aria-hidden="true" /> {post.likeCount}
                    <span className="sr-only">likes</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle size={13} aria-hidden="true" /> {post.commentCount}
                    <span className="sr-only">comments</span>
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
