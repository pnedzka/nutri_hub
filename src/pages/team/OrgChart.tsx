import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronRight, ChevronsDownUp, ChevronsUpDown, LocateFixed, MapPin, Maximize, Minus, Network, Plus, UserRoundX, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildOrgTree, CARD_H, CARD_W, chainOf, layoutOrg, type OrgTree } from '../../../shared/orgChart.ts';
import type { Office, TeamMember } from '../../../shared/profile.ts';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { ContactLinks } from './contacts';

// Team → Org chart: who reports to whom, from the managers administrators set in User management.
// Wide screens: a chart to drag and zoom, with curved lines from each manager to their team. Phones: the same tree as
// an outline. Choosing a person opens their details: contacts, the line of managers above them and their own team.

const BOARD_COLOR = '#CC1F1F';
const COLORS = ['#2563EB', '#0D9488', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'];
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;

/** Each department has its colour (the Board: Nutri Partners red), on the edge of the cards and in the legend. */
function departmentColor(department: string | null): string {
  const name = (department ?? '').trim().toLowerCase();
  if (!name) return '#9CA3AF';
  if (name === 'board') return BOARD_COLOR;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const label = (p: TeamMember) => p.name || p.email;

interface Props {
  people: TeamMember[];
  offices: Office[];
  me: string | null;
  isAdmin: boolean;
  /** People matching the search and office filter, or null when nothing is filtered. */
  matches: Set<string> | null;
}

export function OrgChart({ people, offices, me, isAdmin, matches }: Props) {
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const officeById = useMemo(() => new Map(offices.map((o) => [o.id, o])), [offices]);
  const tree = useMemo(() => buildOrgTree(people), [people]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);

  // Found people are always on the chart: the teams above them open.
  const shownCollapsed = useMemo(() => {
    if (!matches) return collapsed;
    const open = new Set([...matches].flatMap((id) => chainOf(tree, id)));
    return new Set([...collapsed].filter((id) => !open.has(id)));
  }, [collapsed, matches, tree]);

  const path = useMemo(() => new Set(selected ? [...chainOf(tree, selected), selected] : []), [selected, tree]);

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (id) {
        const above = chainOf(tree, id);
        setCollapsed((c) => (above.some((a) => c.has(a)) ? new Set([...c].filter((a) => !above.includes(a))) : c));
      }
    },
    [tree],
  );
  const toggle = useCallback((id: string) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const managers = useMemo(() => [...tree.reports.keys()], [tree]);
  const allOpen = shownCollapsed.size === 0;
  const toggleAll = () => setCollapsed(allOpen ? new Set(managers.filter((m) => !tree.roots.includes(m))) : new Set());

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  if (!tree.hasManagers) {
    return (
      <Card className="p-8 text-center">
        <Network size={32} className="mx-auto text-[#CC1F1F]" />
        <p className="mt-3 font-semibold text-gray-900">The org chart appears once managers are set</p>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin ? (
            <>
              Set each person&apos;s manager in <Link to="/users" className="text-[#CC1F1F] hover:underline">User management</Link> (Edit → Manager).
            </>
          ) : (
            'Administrators set who reports to whom in User management.'
          )}
        </p>
      </Card>
    );
  }

  const person = selected ? byId.get(selected) : undefined;
  const departments = [...new Set(people.map((p) => p.department?.trim()).filter((d): d is string => Boolean(d)))].sort((a, b) =>
    a.toLowerCase() === 'board' ? -1 : b.toLowerCase() === 'board' ? 1 : a.localeCompare(b, 'pl'),
  );
  const common = { tree, byId, me, matches, path, selected, collapsed: shownCollapsed, onSelect: select, onToggle: toggle };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Canvas {...common} allOpen={allOpen} onToggleAll={toggleAll} />
        <Outline {...common} allOpen={allOpen} onToggleAll={toggleAll} />
        {person && (
          <PersonPanel
            key={person.id}
            person={person}
            office={officeById.get(person.officeId ?? '')}
            tree={tree}
            byId={byId}
            me={me}
            onSelect={select}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
      {departments.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500" aria-label="Departments">
          {departments.map((d) => (
            <li key={d} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: departmentColor(d) }} /> {d}
            </li>
          ))}
        </ul>
      )}
      {tree.unassigned.length > 0 && (
        <Card className="p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <UserRoundX size={16} className="text-gray-400" /> Without a manager ({tree.unassigned.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {isAdmin ? (
              <>
                Not on the chart yet. Set their manager in <Link to="/users" className="text-[#CC1F1F] hover:underline">User management</Link>.
              </>
            ) : (
              'Not on the chart yet: an administrator has not set their manager.'
            )}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {tree.unassigned.map((id) => {
              const p = byId.get(id)!;
              const dim = matches && !matches.has(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => select(id)}
                    className={`inline-flex min-h-11 sm:min-h-0 pointer-coarse:min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-sm text-gray-700 transition hover:border-[#CC1F1F] hover:text-[#CC1F1F] ${dim ? 'opacity-40' : ''} ${selected === id ? 'border-[#CC1F1F] ring-2 ring-[#CC1F1F]/20' : ''}`}
                  >
                    <Avatar name={p.name} email={p.email} url={p.avatarUrl} size="sm" />
                    {label(p)}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

interface ViewProps {
  tree: OrgTree;
  byId: Map<string, TeamMember>;
  me: string | null;
  matches: Set<string> | null;
  path: Set<string>;
  selected: string | null;
  collapsed: Set<string>;
  onSelect: (id: string | null) => void;
  onToggle: (id: string) => void;
  allOpen: boolean;
  onToggleAll: () => void;
}

interface View {
  x: number;
  y: number;
  scale: number;
}

/** The chart on wide screens: drag (or scroll) to move, Ctrl + scroll or the buttons to zoom. */
function Canvas({ tree, byId, me, matches, path, selected, collapsed, onSelect, onToggle, allOpen, onToggleAll }: ViewProps) {
  const layout = useMemo(() => layoutOrg(tree, collapsed), [tree, collapsed]);
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [smooth, setSmooth] = useState(false);
  const fitted = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const move = useCallback((next: View | ((v: View) => View), animate: boolean) => {
    setSmooth(animate);
    setView(next);
  }, []);

  const fit = useCallback(
    (animate: boolean) => {
      const el = viewport.current;
      if (!el || !el.clientWidth || !layout.width) return;
      const pad = 40;
      const scale = clamp(Math.min((el.clientWidth - pad * 2) / layout.width, (el.clientHeight - pad * 2) / layout.height), 0.5, 1);
      const x = (el.clientWidth - layout.width * scale) / 2;
      const y = Math.max(pad, (el.clientHeight - layout.height * scale) / 2);
      move({ x: layout.width * scale > el.clientWidth ? pad : x, y, scale }, animate);
    },
    [layout, move],
  );

  const focus = useCallback(
    (id: string) => {
      const el = viewport.current;
      const card = layout.cards.find((c) => c.id === id);
      if (!el || !el.clientWidth || !card) return;
      // The details panel covers the right side of the chart: centre the card in what is left.
      const visible = el.clientWidth - 336;
      setView((v) => {
        const scale = clamp(Math.max(v.scale, 0.85), MIN_SCALE, 1.1);
        return { scale, x: visible / 2 - (card.x + CARD_W / 2) * scale, y: el.clientHeight * 0.4 - (card.y + CARD_H / 2) * scale };
      });
      setSmooth(true);
    },
    [layout],
  );

  // Fit the whole chart once the canvas has a size (it has none on phones, where the outline is shown).
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!fitted.current && el.clientWidth) {
        fitted.current = true;
        fit(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  // A chosen person is brought to the middle, after their team has opened and the cards have moved.
  useEffect(() => {
    if (selected) pendingFocus.current = selected;
  }, [selected]);
  useEffect(() => {
    if (pendingFocus.current) {
      focus(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [layout, selected, focus]);

  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number, animate = true) => {
      const el = viewport.current;
      if (!el) return;
      const cx = px ?? el.clientWidth / 2;
      const cy = py ?? el.clientHeight / 2;
      move((v) => {
        const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const k = scale / v.scale;
        return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      }, animate);
    },
    [move],
  );

  // Scroll moves the chart, Ctrl/⌘ + scroll (and a trackpad pinch) zooms around the pointer.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - rect.left, e.clientY - rect.top, false);
      } else {
        move((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }), false);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, move]);

  const findMe = me && layout.cards.some((c) => c.id === me) ? () => onSelect(me) : null;
  const background = 20 * view.scale;

  return (
    <div className="relative hidden md:block">
      <div
        ref={viewport}
        role="application"
        aria-label="Org chart"
        aria-roledescription="org chart"
        className="relative h-[70vh] min-h-[480px] cursor-grab touch-none select-none overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm active:cursor-grabbing"
        style={{
          backgroundImage: 'radial-gradient(#E5E7EB 1px, transparent 1px)',
          backgroundSize: `${background}px ${background}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 5) return;
          if (!d.moved) {
            d.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          move((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }), false);
        }}
        onPointerUp={() => {
          if (drag.current?.moved) suppressClick.current = true;
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('[data-card]')) onSelect(null);
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: smooth ? 'transform 600ms cubic-bezier(.2,.8,.2,1)' : 'none',
            width: layout.width,
            height: layout.height,
          }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.links.map((l) => {
              const on = path.has(l.id);
              const dim = matches && !matches.has(l.id) && !matches.has(l.from);
              return (
                // A line that changes shape is drawn again, after the cards have moved.
                <g key={`${l.id} ${l.d}`} opacity={dim ? 0.35 : 1}>
                  <path d={l.d} pathLength={1} className="org-draw" fill="none" stroke={on ? BOARD_COLOR : '#D1D5DB'} strokeWidth={on ? 2.5 : 1.5} strokeLinecap="round" />
                  {on && <path d={l.d} className="org-flow" fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={2.5} strokeDasharray="3 11" strokeLinecap="round" />}
                </g>
              );
            })}
          </svg>
          {layout.cards.map((c) => (
            <ChartCard
              key={c.id}
              person={byId.get(c.id)!}
              x={c.x}
              y={c.y}
              depth={c.depth}
              team={tree.teamSize.get(c.id) ?? 0}
              hasReports={tree.reports.has(c.id)}
              collapsed={collapsed.has(c.id)}
              isMe={c.id === me}
              isSelected={c.id === selected}
              onPath={path.has(c.id)}
              dim={Boolean(matches && !matches.has(c.id))}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-gray-100 bg-white/90 p-1 shadow-sm backdrop-blur">
        <Control label="Zoom out" onClick={() => zoomAt(1 / 1.25)}>
          <ZoomOut size={16} />
        </Control>
        <span className="w-11 text-center text-xs tabular-nums text-gray-500" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <Control label="Zoom in" onClick={() => zoomAt(1.25)}>
          <ZoomIn size={16} />
        </Control>
        <span className="mx-0.5 h-5 w-px bg-gray-200" />
        <Control label="Fit to screen" onClick={() => fit(true)}>
          <Maximize size={16} />
        </Control>
        {findMe && (
          <Control label="Find me" onClick={findMe}>
            <LocateFixed size={16} />
          </Control>
        )}
        <Control label={allOpen ? 'Collapse all teams' : 'Expand all teams'} onClick={onToggleAll}>
          {allOpen ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
        </Control>
      </div>
      <p className="pointer-events-none absolute bottom-4 right-4 text-xs text-gray-400">Drag or scroll to move · Ctrl + scroll to zoom</p>
    </div>
  );
}

function Control({ label: text, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={text}
      title={text}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100 hover:text-[#CC1F1F]"
    >
      {children}
    </button>
  );
}

interface CardProps {
  person: TeamMember;
  x: number;
  y: number;
  depth: number;
  team: number;
  hasReports: boolean;
  collapsed: boolean;
  isMe: boolean;
  isSelected: boolean;
  onPath: boolean;
  dim: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

function ChartCard({ person, x, y, depth, team, hasReports, collapsed, isMe, isSelected, onPath, dim, onSelect, onToggle }: CardProps) {
  const name = label(person);
  return (
    <div
      data-card
      className="absolute left-0 top-0 motion-safe:transition-[transform,opacity] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(.2,.8,.2,1)]"
      style={{ transform: `translate(${x}px, ${y}px)`, width: CARD_W, height: CARD_H, opacity: dim ? 0.35 : 1 }}
    >
      <div className="org-pop relative h-full" style={{ animationDelay: `${depth * 80}ms` }}>
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={() => onSelect(person.id)}
          className={`relative flex h-full w-full items-center gap-3 overflow-hidden rounded-xl border bg-white pl-4 pr-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F] ${
            isSelected ? 'border-[#CC1F1F] shadow-lg ring-4 ring-[#CC1F1F]/15' : onPath ? 'border-[#CC1F1F]/40' : 'border-gray-200'
          }`}
        >
          <span className="absolute inset-y-0 left-0 w-1" style={{ background: departmentColor(person.department) }} />
          <Avatar name={person.name} email={person.email} url={person.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">{name}</span>
            <span className="block truncate text-xs text-gray-500">{person.jobTitle || person.department || person.email}</span>
          </span>
          {isMe && <span className="self-start mt-2.5 rounded-full bg-[#CC1F1F] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">You</span>}
        </button>
        {hasReports && (
          <button
            type="button"
            onClick={() => onToggle(person.id)}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Show' : 'Hide'} the team of ${name}`}
            title={`${team} ${team === 1 ? 'person' : 'people'} in the team`}
            className={`absolute -bottom-3 left-1/2 inline-flex h-6 min-w-6 -translate-x-1/2 items-center justify-center gap-0.5 rounded-full border px-2 text-[11px] font-semibold shadow-sm transition hover:scale-110 ${
              collapsed ? 'border-[#CC1F1F] bg-[#CC1F1F] text-white' : 'border-gray-200 bg-white text-gray-600 hover:text-[#CC1F1F]'
            }`}
          >
            {collapsed ? <Plus size={11} /> : <Minus size={11} />}
            {team}
          </button>
        )}
      </div>
    </div>
  );
}

/** The tree on phones: people under their manager, each team opens and closes. */
function Outline(props: ViewProps) {
  const { tree, allOpen, onToggleAll } = props;
  return (
    <Card className="p-2 sm:p-3 md:hidden">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggleAll}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-500 hover:text-[#CC1F1F]"
        >
          {allOpen ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />} {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <ul aria-label="Org chart" role="tree">
        {tree.roots.map((id) => (
          <OutlineItem key={id} id={id} depth={0} {...props} />
        ))}
      </ul>
    </Card>
  );
}

function OutlineItem({ id, depth, ...props }: ViewProps & { id: string; depth: number }) {
  const { tree, byId, me, matches, path, selected, collapsed, onSelect, onToggle } = props;
  const person = byId.get(id)!;
  const reports = tree.reports.get(id) ?? [];
  const open = reports.length > 0 && !collapsed.has(id);
  const name = label(person);
  const dim = matches && !matches.has(id);
  return (
    <li role="treeitem" aria-expanded={reports.length ? open : undefined} aria-selected={selected === id} className="org-pop" style={{ animationDelay: `${depth * 60}ms` }}>
      <div className={`flex items-center gap-1 rounded-lg transition ${selected === id ? 'bg-[#CC1F1F]/5' : ''} ${dim ? 'opacity-40' : ''}`}>
        {reports.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(id)}
            aria-label={`${open ? 'Hide' : 'Show'} the team of ${name}`}
            className="inline-flex h-11 w-9 shrink-0 items-center justify-center text-gray-400"
          >
            <ChevronRight size={16} className={`transition-transform duration-300 ${open ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-9 shrink-0" />
        )}
        <button type="button" onClick={() => onSelect(id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 py-1.5 pr-2 text-left">
          <span className="relative">
            <Avatar name={person.name} email={person.email} url={person.avatarUrl} size="sm" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white" style={{ background: departmentColor(person.department) }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm font-semibold ${path.has(id) ? 'text-[#CC1F1F]' : 'text-gray-900'}`}>
              {name}
              {id === me && <span className="ml-1.5 rounded-full bg-[#CC1F1F] px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">You</span>}
            </span>
            <span className="block truncate text-xs text-gray-500">{person.jobTitle || person.department || person.email}</span>
          </span>
          {reports.length > 0 && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{tree.teamSize.get(id)}</span>}
        </button>
      </div>
      {reports.length > 0 && (
        // Closing slides the team up, then hides it (visibility changes at the end of the transition).
        <div
          className="grid transition-[grid-template-rows,visibility] duration-300 ease-out"
          style={{ gridTemplateRows: open ? '1fr' : '0fr', visibility: open ? 'visible' : 'hidden' }}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <ul role="group" className="ml-[18px] border-l border-gray-200 pl-2">
              {reports.map((r) => (
                <OutlineItem key={r} id={r} depth={depth + 1} {...props} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

interface PanelProps {
  person: TeamMember;
  office: Office | undefined;
  tree: OrgTree;
  byId: Map<string, TeamMember>;
  me: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** A person's details: beside the chart on wide screens, a sheet from the bottom on phones. */
function PersonPanel({ person, office, tree, byId, me, onSelect, onClose }: PanelProps) {
  const chain = chainOf(tree, person.id).map((id) => byId.get(id)!);
  const reports = (tree.reports.get(person.id) ?? []).map((id) => byId.get(id)!);
  const team = tree.teamSize.get(person.id) ?? 0;
  return (
    <>
      <div className="org-fade fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        aria-label={`About ${label(person)}`}
        className="org-panel fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl safe-bottom md:absolute md:inset-x-auto md:bottom-auto md:right-3 md:top-3 md:z-10 md:max-h-[calc(100%-1.5rem)] md:w-80 md:rounded-xl md:border md:border-gray-100 md:shadow-xl"
      >
        <div className="mx-auto -mt-2 mb-3 h-1 w-10 rounded-full bg-gray-200 md:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 md:h-8 md:w-8"
        >
          <X size={16} />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="rounded-full p-1" style={{ background: `conic-gradient(${departmentColor(person.department)}, #F3F4F6)` }}>
            <div className="rounded-full bg-white p-0.5">
              <Avatar name={person.name} email={person.email} url={person.avatarUrl} size="lg" />
            </div>
          </div>
          <h2 className="mt-3 font-semibold text-gray-900 [overflow-wrap:anywhere]">
            {label(person)}
            {person.id === me && <span className="ml-1.5 rounded-full bg-[#CC1F1F] px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">You</span>}
          </h2>
          {(person.jobTitle || person.department) && <p className="text-sm text-gray-500">{[person.jobTitle, person.department].filter(Boolean).join(' · ')}</p>}
          {office && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
              <MapPin size={12} /> {office.name}
            </p>
          )}
        </div>
        <div className="mt-4 border-t border-gray-100 pt-3">
          <ContactLinks person={person} />
        </div>
        <Section title="Reports to">
          {chain.length ? (
            <ol className="relative">
              {chain.map((p, i) => (
                <li key={p.id} className="relative pl-5">
                  <span className="absolute left-[7px] top-0 h-full w-px bg-[#CC1F1F]/25" />
                  <span className="absolute left-[3px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-[#CC1F1F]" style={{ opacity: 0.4 + (0.6 * (i + 1)) / chain.length }} />
                  <PersonLink person={p} onSelect={onSelect} />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">{tree.unassigned.includes(person.id) ? 'No manager set yet.' : 'Top of the chart.'}</p>
          )}
        </Section>
        {reports.length > 0 && (
          <Section title={`Team · ${reports.length} direct${team > reports.length ? `, ${team} in total` : ''}`}>
            <ul>
              {reports.map((p) => (
                <li key={p.id}>
                  <PersonLink person={p} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </Section>
        )}
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 border-t border-gray-100 pt-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </section>
  );
}

function PersonLink({ person, onSelect }: { person: TeamMember; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      className="group flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-gray-50 sm:min-h-0 sm:py-1.5 pointer-coarse:min-h-11"
    >
      <Avatar name={person.name} email={person.email} url={person.avatarUrl} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-gray-800 group-hover:text-[#CC1F1F]">{label(person)}</span>
        {person.jobTitle && <span className="block truncate text-xs text-gray-500">{person.jobTitle}</span>}
      </span>
      <ChevronRight size={14} className="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-[#CC1F1F]" />
    </button>
  );
}
