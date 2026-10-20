import { Fragment, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { paragraphs } from '../../../shared/news';

export function PageHeader({ back, title, actions }: { back: { to: string; label: string }; title: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Link to={back.to} className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} />
          {back.label}
        </Link>
        <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-gray-900 break-words">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Plain text with paragraphs, line breaks and clickable links (never HTML). */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 break-words ${className}`}>
      {paragraphs(text).map((lines, p) => (
        <p key={p}>
          {lines.map((line, l) => (
            <Fragment key={l}>
              {l > 0 && <br />}
              {line.map((segment, s) =>
                'url' in segment ? (
                  <a key={s} href={segment.url} target="_blank" rel="noopener noreferrer" className="text-[#CC1F1F] underline underline-offset-2 hover:text-[#A01818]">
                    {segment.url}
                  </a>
                ) : (
                  <Fragment key={s}>{segment.text}</Fragment>
                ),
              )}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
