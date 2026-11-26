// The browser tab says which page is open ("Leave – Nutri Partners"), not "Apps" everywhere, so several tabs, the
// history and screen readers tell the pages apart. The first path segment decides; unknown paths keep "Apps".

const TITLES: Record<string, string> = {
  '': 'Home',
  news: 'News',
  leave: 'Leave',
  contracts: 'Contracts',
  complaints: 'Complaints',
  purchase: 'Purchase Manager',
  team: 'Team',
  profile: 'My profile',
  notifications: 'Notifications',
  users: 'User management',
  contests: 'Sales contests',
  calls: 'Phone calls analyser',
};

export function pageTitle(pathname: string): string {
  const name = TITLES[pathname.split('/')[1] ?? ''] ?? 'Apps';
  return `${name} – Nutri Partners`;
}
