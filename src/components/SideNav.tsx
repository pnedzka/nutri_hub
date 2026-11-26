import { useEffect, useRef } from 'react';
import { ExternalLink, House, Menu, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { navSectionsFor, tileTarget, type AppTile } from '../apps';
import { useAuth } from '../lib/auth';
import { isSsoApp } from '../lib/sso';

// The hub's side menu (decision of 23.11.2026): the apps moved here from the home page, which became a dashboard.
// Desktop: a column next to the content. Phone and tablet: a bar under the header opens the same menu as a drawer.

const ITEM =
  'flex items-center gap-3 min-h-11 lg:min-h-9 pointer-coarse:min-h-11 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]';
const IDLE = 'text-gray-600 hover:bg-white hover:text-gray-900';
const ACTIVE = 'bg-white text-[#CC1F1F] font-semibold shadow-sm';

/** Which hub path a menu item stands for, so the item stays marked inside its module (/news/123 → News). */
const isActivePath = (path: string, pathname: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));

function Item({ app, onNavigate }: { app: AppTile; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const Icon = app.icon;
  const target = tileTarget(app, isSsoApp);
  const body = (
    <>
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{app.name}</span>
    </>
  );
  if ('href' in target) {
    return (
      <a href={target.href} target={app.newTab ? '_blank' : undefined} rel={app.newTab ? 'noreferrer' : undefined} className={`${ITEM} ${IDLE}`} onClick={onNavigate}>
        {body}
        {app.newTab && (
          <>
            <ExternalLink size={14} className="ml-auto shrink-0 text-gray-400" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </>
        )}
      </a>
    );
  }
  const active = !target.path.startsWith('/sso') && isActivePath(target.path, pathname);
  return (
    <Link to={target.path} className={`${ITEM} ${active ? ACTIVE : IDLE}`} aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      {body}
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return (
    <nav aria-label="Apps" className="space-y-5">
      <NavLink to="/" end className={({ isActive }) => `${ITEM} ${isActive ? ACTIVE : IDLE}`} onClick={onNavigate}>
        <House size={18} className="shrink-0" aria-hidden="true" />
        Home
      </NavLink>
      {navSectionsFor(user).map((section) => (
        <div key={section.title}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{section.title}</p>
          <ul className="space-y-0.5">
            {section.apps.map((app) => (
              <li key={app.id}>
                <Item app={app} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** The menu as a column on large screens. */
export function SideNav() {
  return (
    <aside className="hidden lg:block w-60 shrink-0 pl-6 pr-2 py-12">
      <div className="sticky top-24">
        <NavList />
      </div>
    </aside>
  );
}

/** The bar with the menu button on phones and tablets, and the drawer it opens. */
export function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { pathname } = useLocation();
  const closeRef = useRef<HTMLButtonElement>(null);
  // Close when a link changes the page, and with Escape.
  useEffect(() => {
    onOpenChange(false);
  }, [pathname, onOpenChange]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onOpenChange(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);
  return (
    <>
      <div className="lg:hidden border-b border-gray-100 bg-white safe-x px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="inline-flex min-h-11 items-center gap-2 -ml-2 px-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
          aria-expanded={open}
          aria-controls="mobile-nav"
        >
          <Menu size={18} aria-hidden="true" />
          Menu
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Apps" id="mobile-nav">
          <div className="absolute inset-0 bg-black/30" onClick={() => onOpenChange(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-[#F5F5F5] px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-xl">
            <div className="mb-3 flex justify-end">
              <button
                ref={closeRef}
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <NavList onNavigate={() => onOpenChange(false)} />
          </div>
        </div>
      )}
    </>
  );
}
