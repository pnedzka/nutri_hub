import { useEffect, useState } from 'react';
import { pickQuote, type Quote } from '../../../shared/quotes';
import { Avatar } from '../../components/Avatar';

/** The quotes come from the hub's server (api/_lib/quotes.ts), the same for everyone and cached, so no sign-in. */
async function loadQuote(): Promise<{ quote: Quote; fetched: boolean }> {
  try {
    const response = await fetch('/api/people?resource=quotes');
    if (!response.ok) throw new Error(String(response.status));
    const { quotes } = (await response.json()) as { quotes?: Quote[] };
    const list = Array.isArray(quotes) ? quotes : [];
    return { quote: pickQuote(list), fetched: list.length > 0 };
  } catch {
    return { quote: pickQuote([]), fetched: false };
  }
}

/**
 * The top of the home page: the person's photo, "Welcome, Paweł!" and a quote, a new one at every visit (as in the
 * old intranet, in the hub's look). The quotes come by themselves from ZenQuotes, which asks to be credited.
 */
export function WelcomeCard({ name, email, avatarUrl }: { name: string | null; email: string; avatarUrl: string | null }) {
  const [state, setState] = useState<{ quote: Quote; fetched: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    void loadQuote().then((result) => active && setState(result));
    return () => {
      active = false;
    };
  }, []);
  return (
    <section
      aria-label="Welcome"
      className="overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-[#CC1F1F]/[0.06] via-white to-white shadow-sm"
    >
      <div className="flex flex-col items-center gap-4 px-5 py-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:text-left">
        <div className="shrink-0 rounded-full bg-white p-1 shadow-sm">
          <Avatar name={name} email={email} url={avatarUrl} size="lg" />
        </div>
        <div className="min-w-0 w-full">
          <h1 className="text-2xl font-bold text-gray-900">
            {name ? `Welcome, ${name}!` : 'Welcome!'} <span aria-hidden="true">👋</span>
          </h1>
          {state ? (
            <figure className="mt-2 border-gray-200 sm:border-l-2 sm:pl-3">
              <blockquote className="text-sm italic text-gray-600 sm:text-base">“{state.quote.text}”</blockquote>
              {(state.quote.author || state.fetched) && (
                <figcaption className="mt-1 text-xs text-gray-400">
                  {state.quote.author && <>— {state.quote.author}</>}
                  {state.fetched && (
                    <>
                      {state.quote.author && ' · '}
                      <a href="https://zenquotes.io/" target="_blank" rel="noreferrer" className="hover:text-gray-600 hover:underline">
                        ZenQuotes
                      </a>
                    </>
                  )}
                </figcaption>
              )}
            </figure>
          ) : (
            <div className="mx-auto mt-3 h-4 w-3/4 animate-pulse rounded bg-gray-100 sm:mx-0" aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
}
