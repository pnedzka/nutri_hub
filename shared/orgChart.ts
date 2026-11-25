// Team → Org chart: who reports to whom (profiles.manager_id, set by administrators in User management).
// Pure functions, shared by the page and the tests: the tree and the positions of the cards on the chart.

export interface OrgPerson {
  id: string;
  name: string | null;
  email: string;
  department: string | null;
  managerId: string | null;
}

export interface OrgTree {
  /** Top of the chart: people without a manager who have reports, or who are on the Board. */
  roots: string[];
  /** People without a manager and without reports: shown apart, so they do not crowd the top row. */
  unassigned: string[];
  /**
   * Direct reports by manager: people without a team of their own first (the Board before other departments, then by
   * name), then those leading a team, the largest team first. Single people stay at the top and teams below them.
   */
  reports: Map<string, string[]>;
  /** The manager each person is drawn under (a manager outside the list, e.g. deactivated, counts as none). */
  parent: Map<string, string>;
  /** Everyone below each person (direct and indirect). */
  teamSize: Map<string, number>;
  /** True when at least one person has a manager. */
  hasManagers: boolean;
}

const label = (p: OrgPerson) => p.name || p.email;
const byName = (people: Map<string, OrgPerson>) => (a: string, b: string) => label(people.get(a)!).localeCompare(label(people.get(b)!), 'pl');

/** Builds the reporting tree. A loop (A reports to B, B to A) is cut, so everyone is drawn once. */
export function buildOrgTree(list: OrgPerson[]): OrgTree {
  const people = new Map(list.map((p) => [p.id, p]));
  const sort = byName(people);
  const parent = new Map<string, string>();
  for (const p of list) if (p.managerId && p.managerId !== p.id && people.has(p.managerId)) parent.set(p.id, p.managerId);

  // Cut loops: walking up from anyone must reach a person without a manager.
  for (const p of [...list].sort((a, b) => sort(a.id, b.id))) {
    const seen = new Set<string>();
    let at: string | undefined = p.id;
    while (at && parent.has(at)) {
      if (seen.has(at)) {
        parent.delete(at);
        break;
      }
      seen.add(at);
      at = parent.get(at);
    }
  }

  const reports = new Map<string, string[]>();
  for (const [child, manager] of parent) reports.set(manager, [...(reports.get(manager) ?? []), child]);

  const teamSize = new Map<string, number>();
  const size = (id: string): number => {
    const known = teamSize.get(id);
    if (known !== undefined) return known;
    const total = (reports.get(id) ?? []).reduce((sum, r) => sum + 1 + size(r), 0);
    teamSize.set(id, total);
    return total;
  };

  const leads = (id: string) => reports.has(id);
  const isBoard = (id: string) => (people.get(id)!.department ?? '').trim().toLowerCase() === 'board';
  for (const ids of reports.values()) {
    ids.sort((a, b) => Number(leads(a)) - Number(leads(b)) || size(b) - size(a) || Number(isBoard(b)) - Number(isBoard(a)) || sort(a, b));
  }

  const tops = list.filter((p) => !parent.has(p.id)).map((p) => p.id);
  const roots = tops
    .filter((id) => reports.has(id) || isBoard(id))
    .sort((a, b) => Number(isBoard(b)) - Number(isBoard(a)) || size(b) - size(a) || sort(a, b));
  const unassigned = tops.filter((id) => !reports.has(id) && !isBoard(id)).sort(sort);
  for (const p of list) size(p.id);

  return { roots, unassigned, reports, parent, teamSize, hasManagers: parent.size > 0 };
}

/** The managers above a person, from the top of the chart down to their own manager. */
export function chainOf(tree: OrgTree, id: string): string[] {
  const chain: string[] = [];
  for (let at = tree.parent.get(id); at; at = tree.parent.get(at)) chain.unshift(at);
  return chain;
}

// ── Layout ────────────────────────────────────────────────────────────────────────────────────────────────────

export const CARD_W = 236;
export const CARD_H = 72;
/** Between cards side by side, and between neighbouring top-level trees. */
export const GAP_X = 28;
/** Between a manager and the row of their reports. */
export const GAP_Y = 64;
/** A team of people without reports of their own is a column under the manager, moved right by this much. */
export const STACK_INDENT = 28;
export const STACK_GAP = 12;

export interface PlacedCard {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export interface Link {
  /** The report's id: one link leads to each card that has a manager. */
  id: string;
  from: string;
  d: string;
}

export interface OrgLayout {
  cards: PlacedCard[];
  links: Link[];
  width: number;
  height: number;
}

interface Box {
  width: number;
  /** Where the person's own card is centred, from the box's left edge. */
  anchor: number;
  height: number;
  place: (x: number, y: number) => void;
}

/**
 * Positions of the cards, a tidy tree from the top down. Reports of a collapsed person are not drawn. When nobody in
 * a team has visible reports of their own, the team is a column under the manager (an elbow line on the left), so a
 * manager with ten people does not make the chart ten cards wide.
 */
export function layoutOrg(tree: OrgTree, collapsed: ReadonlySet<string>): OrgLayout {
  const cards: PlacedCard[] = [];
  const links: Link[] = [];
  const shown = (id: string) => (collapsed.has(id) ? [] : (tree.reports.get(id) ?? []));

  const box = (id: string, depth: number): Box => {
    const kids = shown(id);
    const card = (x: number, y: number) => cards.push({ id, x, y, depth });
    if (!kids.length) return { width: CARD_W, anchor: CARD_W / 2, height: CARD_H, place: card };

    if (kids.every((k) => !shown(k).length)) {
      const top = CARD_H + GAP_Y / 2;
      return {
        width: STACK_INDENT + CARD_W,
        anchor: CARD_W / 2,
        height: top + kids.length * CARD_H + (kids.length - 1) * STACK_GAP,
        place: (x, y) => {
          card(x, y);
          const lineX = x + STACK_INDENT / 2;
          kids.forEach((k, i) => {
            const ky = y + top + i * (CARD_H + STACK_GAP);
            cards.push({ id: k, x: x + STACK_INDENT, y: ky, depth: depth + 1 });
            links.push({ id: k, from: id, d: elbow(lineX, y + CARD_H, x + STACK_INDENT, ky + CARD_H / 2) });
          });
        },
      };
    }

    const boxes = kids.map((k) => box(k, depth + 1));
    const row = boxes.reduce((sum, b) => sum + b.width, 0) + GAP_X * (boxes.length - 1);
    const width = Math.max(CARD_W, row);
    return {
      width,
      anchor: width / 2,
      height: CARD_H + GAP_Y + Math.max(...boxes.map((b) => b.height)),
      place: (x, y) => {
        const cx = x + width / 2;
        card(cx - CARD_W / 2, y);
        let kx = x + (width - row) / 2;
        boxes.forEach((b, i) => {
          b.place(kx, y + CARD_H + GAP_Y);
          links.push({ id: kids[i], from: id, d: curve(cx, y + CARD_H, kx + b.anchor, y + CARD_H + GAP_Y) });
          kx += b.width + GAP_X;
        });
      },
    };
  };

  let x = 0;
  let height = 0;
  for (const root of tree.roots) {
    const b = box(root, 0);
    b.place(x, 0);
    x += b.width + GAP_X * 2;
    height = Math.max(height, b.height);
  }
  return { cards, links, width: Math.max(0, x - GAP_X * 2), height };
}

const r = (n: number) => Math.round(n * 10) / 10;

/** A soft S-curve from a manager's bottom edge to the top of a report's card. */
function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (y1 + y2) / 2;
  return `M${r(x1)} ${r(y1)} C${r(x1)} ${r(mid)} ${r(x2)} ${r(mid)} ${r(x2)} ${r(y2)}`;
}

/** Down the left side of a column, then right into the card, with a rounded corner. */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const radius = Math.min(10, (x2 - x1) / 2);
  return `M${r(x1)} ${r(y1)} V${r(y2 - radius)} Q${r(x1)} ${r(y2)} ${r(x1 + radius)} ${r(y2)} H${r(x2)}`;
}
