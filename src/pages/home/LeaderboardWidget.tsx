import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { monthOf, type Leaderboard } from '../../../shared/dashboard';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { useWidget } from './useWidget';
import { MonthSwitch, Widget, WidgetState } from './Widget';

const TOP = 10;

/** Places 1–3 get the brand colour, the rest a plain number. */
function Place({ index }: { index: number }) {
  const top = index < 3;
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${top ? 'bg-[#CC1F1F]/10 text-[#CC1F1F]' : 'text-gray-500'}`}
    >
      {index + 1}
    </span>
  );
}

/** Contracts per person in the month, as the old intranet's Sales leaderboard. */
export function LeaderboardWidget({ className }: { className?: string }) {
  const me = useAuth((s) => s.user?.id);
  const current = monthOf(new Date());
  const [month, setMonth] = useState(current);
  const [showAll, setShowAll] = useState(false);
  const { data, error, loading } = useWidget<Leaderboard>('leaderboard', month);
  // Many people: the top ten, plus the viewer's own place when it is lower; "Show all" opens the rest.
  const entries = data?.entries ?? [];
  const mine = entries.findIndex((e) => e.id === me);
  const shown = showAll ? entries.map((e, i) => ({ e, i })) : entries.map((e, i) => ({ e, i })).filter(({ i }) => i < TOP || i === mine);
  return (
    <Widget
      id="leaderboard"
      title="Sales leaderboard"
      icon={Trophy}
      className={className}
      action={<MonthSwitch month={month} current={current} onChange={setMonth} />}
    >
      {loading ? (
        <WidgetState kind="loading" />
      ) : error || !data ? (
        <WidgetState kind="error">{error ?? 'No data.'}</WidgetState>
      ) : !data.entries.some((e) => e.contracts > 0) ? (
        <WidgetState kind="empty">No contracts this month yet.</WidgetState>
      ) : (
        <>
          <ol className="space-y-1">
            {shown.map(({ e: entry, i: index }) => (
              <li key={entry.id} className={`${index === mine && mine >= TOP && !showAll ? 'mt-2 border-t border-dashed border-gray-200 pt-2' : ''}`}>
                <div className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${entry.id === me ? 'bg-[#CC1F1F]/5' : ''}`}>
                  <Place index={index} />
                  <Avatar name={entry.name} email="" url={entry.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${entry.id === me ? 'font-semibold' : 'font-medium'} text-gray-900`}>
                      {entry.name}
                      {entry.id === me && <span className="sr-only"> (you)</span>}
                    </p>
                    {(entry.jobTitle || entry.department) && <p className="truncate text-xs text-gray-500">{entry.jobTitle || entry.department}</p>}
                  </div>
                  <span className="text-lg font-bold text-gray-900" aria-label={`${entry.contracts} contracts`}>
                    {entry.contracts}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {entries.length > TOP + (mine >= TOP ? 1 : 0) && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 min-h-11 w-full rounded-lg text-sm font-medium text-[#CC1F1F] hover:bg-gray-50 sm:min-h-9"
            >
              {showAll ? 'Show top 10' : `Show all (${entries.length})`}
            </button>
          )}
        </>
      )}
    </Widget>
  );
}
