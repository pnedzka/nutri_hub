import { Fragment, type ReactNode } from 'react';
import { blocks, paragraphs, type Inline } from '../../../shared/news';

export { PageHeader } from '../../components/PageHeader';

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

const linkClass = 'text-[#CC1F1F] underline underline-offset-2 hover:text-[#A01818]';

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        if ('url' in part) {
          return (
            <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {part.label}
            </a>
          );
        }
        let node: ReactNode = part.text;
        if (part.italic) node = <em>{node}</em>;
        if (part.bold) node = <strong className="font-semibold">{node}</strong>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

/** A post's body: headings, lists, dividing lines and paragraphs (shared/news.ts `blocks`; never HTML). */
export function FormattedText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-3 break-words ${className}`}>
      {blocks(text).map((block, b) => {
        if (block.type === 'heading') {
          const Tag = block.level === 2 ? 'h2' : 'h3';
          return (
            <Tag key={b} className={`${block.level === 2 ? 'text-lg' : 'text-base'} pt-2 font-semibold text-gray-900`}>
              <InlineText parts={block.content} />
            </Tag>
          );
        }
        if (block.type === 'rule') return <hr key={b} className="border-gray-200" />;
        if (block.type === 'list') {
          return (
            <ul key={b} className="list-disc space-y-1 pl-5">
              {block.items.map((item, i) => (
                <li key={i}>
                  <InlineText parts={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b}>
            {block.lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && <br />}
                <InlineText parts={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** "Draft" next to a post that is not published. */
export function DraftBadge() {
  return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Draft</span>;
}
