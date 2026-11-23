import { Medal } from 'lucide-react';
import type { ContestResult } from '../../../shared/contest';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { formatEur } from './format';
import { useWidget } from './useWidget';
import { Widget } from './Widget';

const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

/**
 * The running sales contest: for its participants and administrators, nothing for anyone else. The score mixes the
 * number of contracts and their value in EUR, each against the leader (shared/contest.ts).
 */
export function ContestWidget({ className }: { className?: string }) {
  const me = useAuth((s) => s.user?.id);
  const { data } = useWidget<{ result: ContestResult | null }>('contest');
  const result = data?.result;
  if (!result) return null;
  const { contest, entries, leader, daysLeft } = result;
  const mine = entries.find((e) => e.id === me);
  const place = mine ? entries.indexOf(mine) + 1 : null;
  return (
    <Widget
      id="contest"
      title={contest.name}
      icon={Medal}
      className={className}
      action={
        <span className="text-xs font-medium text-gray-500">
          {day(contest.startsOn)} – {day(contest.endsOn)} · {daysLeft === 1 ? 'last day' : `${daysLeft} days left`}
        </span>
      }
    >
      {mine && place && (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#F5F5F5] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your place</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {place}
              <span className="ml-1 text-sm font-medium text-gray-500">of {entries.length}</span>
            </p>
            <p className="text-xs text-gray-500">{mine.score} points</p>
          </div>
          <div className="rounded-lg bg-[#F5F5F5] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contracts</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{mine.contracts}</p>
            <p className="text-xs text-gray-500">
              {leader && leader.contracts > mine.contracts ? `${leader.contracts - mine.contracts} to the leader` : 'You lead'}
            </p>
          </div>
          <div className="rounded-lg bg-[#F5F5F5] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Value</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatEur(mine.eur ?? 0)}</p>
            <p className="text-xs text-gray-500">
              {leader && leader.eur > (mine.eur ?? 0) ? `${formatEur(leader.eur - (mine.eur ?? 0))} to the leader` : 'You lead'}
            </p>
          </div>
        </div>
      )}
      <ol className="space-y-1">
        {entries.map((entry, index) => (
          <li key={entry.id} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${entry.id === me ? 'bg-[#CC1F1F]/5' : ''}`}>
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index < 3 ? 'bg-[#CC1F1F]/10 text-[#CC1F1F]' : 'text-gray-400'}`}
            >
              {index + 1}
            </span>
            <Avatar name={entry.name} email="" url={entry.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm text-gray-900 ${entry.id === me ? 'font-semibold' : 'font-medium'}`}>{entry.name}</p>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100" aria-hidden="true">
                <div className="h-1.5 rounded-full bg-[#CC1F1F]" style={{ width: `${Math.max(entry.score, 0)}%` }} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-gray-900">{entry.score}</p>
              <p className="text-xs text-gray-500">
                {entry.contracts} {entry.contracts === 1 ? 'contract' : 'contracts'}
                {entry.eur !== null && entry.id !== me && ` · ${formatEur(entry.eur)}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-gray-500">
        {contest.prize && <span className="font-medium text-gray-700">Prize: {contest.prize}. </span>}
        Points: {contest.weightCount}% number of contracts, {100 - contest.weightCount}% their value in EUR, each against the leader. Sales and
        purchase contracts, without cancelled ones.
      </p>
    </Widget>
  );
}
