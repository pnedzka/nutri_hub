import { Component, type ReactNode } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { reportRenderError } from '../lib/monitoring';

// A crash while drawing a page (e.g. an answer from the server the page did not expect) used to blank the whole app,
// header and menu included. The boundary keeps what is around it and shows a message with the way out; the error
// goes to Sentry. In the Layout it wraps the page only and starts again when the address changes (`resetKey`), so the
// side menu leads out of a broken page; around the whole app (main.tsx) it is the last resort.

interface Props {
  children: ReactNode;
  /** Where the boundary sits, for Sentry (tag `where`). */
  where: string;
  /** A new value clears the error (the Layout passes the path). */
  resetKey?: string;
  /** Around the whole app: a full page, without a link to Home (there may be no router). */
  fullPage?: boolean;
}

export class ErrorBoundary extends Component<Props, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    reportRenderError(error, this.props.where);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const box = (
      <div role="alert" className="mx-auto max-w-lg rounded-xl border border-gray-100 bg-white px-6 py-8 text-center shadow-sm">
        <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#CC1F1F]/10 text-[#CC1F1F]">
          <TriangleAlert size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-gray-900">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-gray-600">
          The error was reported automatically. Reload the page; if it happens again, open another page from the menu
          and try later.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 sm:min-h-10 items-center gap-2 rounded-lg bg-[#CC1F1F] px-4 text-sm font-medium text-white hover:bg-[#A01818] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2"
          >
            <RotateCw size={16} aria-hidden="true" /> Reload
          </button>
          {!this.props.fullPage && (
            <a
              href="/"
              className="inline-flex min-h-11 sm:min-h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] focus-visible:ring-offset-2"
            >
              Go to Home
            </a>
          )}
        </div>
      </div>
    );
    return this.props.fullPage ? <div className="min-h-screen flex items-center justify-center safe-x py-12">{box}</div> : box;
  }
}
