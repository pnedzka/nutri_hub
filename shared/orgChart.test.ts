import { describe, expect, it } from 'vitest';
import { buildOrgTree, CARD_H, CARD_W, chainOf, layoutOrg, STACK_INDENT, type OrgPerson } from './orgChart';

const person = (id: string, managerId: string | null = null, department: string | null = null): OrgPerson => ({
  id, name: id, email: `${id.toLowerCase()}@example.com`, department, managerId,
});

const team = [
  person('Paweł', null, 'Board'),
  person('Kacper', null, 'Board'),
  person('Marcin', 'Paweł', 'Trade'),
  person('Anna', 'Marcin', 'Trade'),
  person('Bartek', 'Marcin', 'Trade'),
  person('Jadwiga', 'Kacper', 'Administration'),
  person('Zofia'),
];

describe('buildOrgTree', () => {
  it('puts the Board and other managers on top, people without anyone apart', () => {
    const tree = buildOrgTree(team);
    expect(tree.roots).toEqual(['Paweł', 'Kacper']);
    expect(tree.unassigned).toEqual(['Zofia']);
    expect(tree.reports.get('Marcin')).toEqual(['Anna', 'Bartek']);
    expect(tree.teamSize.get('Paweł')).toBe(3);
    expect(tree.teamSize.get('Anna')).toBe(0);
    expect(tree.hasManagers).toBe(true);
  });

  it('lists single people first (Board before others), then teams from the largest', () => {
    const tree = buildOrgTree([
      person('Kacper', null, 'Board'),
      person('Jadwiga', 'Kacper', 'Administration'),
      person('Klaudia', 'Jadwiga', 'Administration'),
      person('Jakub', 'Kacper', 'Finances'),
      person('Marcin', 'Kacper', 'Board'),
      person('Anna', 'Marcin', 'Trade'),
      person('Dorota', 'Marcin', 'Trade'),
      person('Paweł', 'Kacper', 'Board'),
    ]);
    expect(tree.reports.get('Kacper')).toEqual(['Paweł', 'Jakub', 'Marcin', 'Jadwiga']);
    expect(tree.reports.get('Marcin')).toEqual(['Anna', 'Dorota']);
  });

  it('treats a manager who is not in Team (deactivated) as none', () => {
    const tree = buildOrgTree([person('Anna', 'gone'), person('Bartek', 'Anna')]);
    expect(tree.roots).toEqual(['Anna']);
    expect(tree.parent.has('Anna')).toBe(false);
  });

  it('cuts a loop so everyone is still on the chart', () => {
    const tree = buildOrgTree([person('A', 'B'), person('B', 'A'), person('C', 'A')]);
    expect(tree.roots).toHaveLength(1);
    const drawn = new Set([...tree.roots, ...tree.parent.keys()]);
    expect([...drawn].sort()).toEqual(['A', 'B', 'C']);
  });

  it('says when nobody has a manager yet', () => {
    expect(buildOrgTree([person('A'), person('B')]).hasManagers).toBe(false);
  });
});

describe('chainOf', () => {
  it('lists the managers from the top down', () => {
    const tree = buildOrgTree(team);
    expect(chainOf(tree, 'Anna')).toEqual(['Paweł', 'Marcin']);
    expect(chainOf(tree, 'Paweł')).toEqual([]);
  });
});

describe('layoutOrg', () => {
  it('draws every visible card once, with a link to each report', () => {
    const tree = buildOrgTree(team);
    const layout = layoutOrg(tree, new Set());
    expect(layout.cards.map((c) => c.id).sort()).toEqual(['Anna', 'Bartek', 'Jadwiga', 'Kacper', 'Marcin', 'Paweł']);
    expect(layout.links.map((l) => l.id).sort()).toEqual(['Anna', 'Bartek', 'Jadwiga', 'Marcin']);
    // No two cards overlap.
    for (const a of layout.cards) {
      for (const b of layout.cards) {
        if (a === b) continue;
        const apart = a.x + CARD_W <= b.x || b.x + CARD_W <= a.x || a.y + CARD_H <= b.y || b.y + CARD_H <= a.y;
        expect(apart, `${a.id} and ${b.id}`).toBe(true);
      }
    }
  });

  it('stacks a team without reports of their own in a column under the manager', () => {
    const tree = buildOrgTree(team);
    const at = new Map(layoutOrg(tree, new Set()).cards.map((c) => [c.id, c]));
    expect(at.get('Anna')!.x).toBe(at.get('Marcin')!.x + STACK_INDENT);
    expect(at.get('Bartek')!.x).toBe(at.get('Anna')!.x);
    expect(at.get('Bartek')!.y).toBeGreaterThan(at.get('Anna')!.y);
  });

  it('hides the reports of a collapsed person', () => {
    const tree = buildOrgTree(team);
    const ids = layoutOrg(tree, new Set(['Marcin'])).cards.map((c) => c.id);
    expect(ids).toContain('Marcin');
    expect(ids).not.toContain('Anna');
  });

  it('places a wide team side by side, the manager centred above', () => {
    const people = [person('Boss', null, 'Board'), person('A', 'Boss'), person('B', 'Boss'), person('A1', 'A'), person('B1', 'B')];
    const at = new Map(layoutOrg(buildOrgTree(people), new Set()).cards.map((c) => [c.id, c]));
    expect(at.get('A')!.y).toBe(at.get('B')!.y);
    expect(at.get('A')!.x).toBeLessThan(at.get('B')!.x);
    const middle = (at.get('A')!.x + at.get('B')!.x + STACK_INDENT) / 2;
    expect(Math.abs(at.get('Boss')!.x - middle)).toBeLessThan(CARD_W);
  });
});
