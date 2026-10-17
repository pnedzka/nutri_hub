import type { Role } from '../lib/user';

export function RoleBadge({ role }: { role: Role }) {
  return role === 'admin' ? (
    <span className="shrink-0 rounded-full bg-[#CC1F1F]/10 px-2 py-0.5 text-xs font-semibold text-[#CC1F1F]">Admin</span>
  ) : (
    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">User</span>
  );
}
