import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/Button';
import { Card, CardBody } from '../../components/Card';
import { eachDate, formatRange, LEAVE_TYPE_NAMES, parseDate } from '../../../shared/leave';
import type { CalendarEntry, CalendarResponse } from '../../../shared/leaveApi';
import { Empty, ErrorNote, Loading } from './ui';
import { useApi } from './useApi';

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow', timeZone: 'UTC' });

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date()).slice(0, 7);
}

const describe = (entry: CalendarEntry) =>
  `${entry.type ? LEAVE_TYPE_NAMES[entry.type] : 'Absent'}${entry.status === 'pending' ? ' (waiting for approval)' : ''}`;

function Cell({ entry, off, today }: { entry?: CalendarEntry; off: boolean; today: boolean }) {
  let fill = '';
  if (entry && !off) {
    const color = entry.status === 'approved' ? '#CC1F1F' : '#F59E0B';
    fill = entry.halfDay ? `linear-gradient(135deg, ${color} 50%, transparent 50%)` : color;
  }
  return (
    <td className={`h-9 min-w-8 border border-gray-100 p-0 ${off ? 'bg-gray-100' : ''} ${today ? 'outline outline-2 -outline-offset-2 outline-gray-400' : ''}`}>
      {fill && <div className="h-full w-full opacity-85" style={{ background: fill }} title={entry ? describe(entry) : undefined} />}
    </td>
  );
}

export function CalendarView() {
  const [month, setMonth] = useState(currentMonth);
  const { data, error } = useApi<CalendarResponse>(`/api/leave/calendar?month=${month}`);
  const shown = data?.month === month ? data : null;

  const days = eachDate(`${month}-01`, `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`);
  const holidays = new Set(shown?.holidays ?? []);
  const isOff = (iso: string) => {
    const weekday = parseDate(iso)!.getUTCDay();
    return weekday === 0 || weekday === 6 || holidays.has(iso);
  };
  const entryOn = (personId: string, iso: string) => shown?.entries.find((e) => e.personId === personId && e.start <= iso && iso <= e.end);
  const away = shown ? [...shown.entries].sort((a, b) => a.start.localeCompare(b.start)) : [];
  const nameOf = (id: string) => shown?.people.find((p) => p.id === id)?.name ?? 'Former user';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" className="min-h-11 min-w-11" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft size={16} />
        </Button>
        <h2 className="text-base font-semibold text-gray-900">{MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`))}</h2>
        <Button variant="secondary" size="sm" className="min-h-11 min-w-11" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight size={16} />
        </Button>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!shown && !error && <Loading />}
      {shown && (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-3 text-left font-medium text-gray-500">Person</th>
                    {days.map((iso) => (
                      <th key={iso} className={`px-0.5 py-1 text-center font-normal ${isOff(iso) ? 'text-gray-400' : 'text-gray-600'}`}>
                        <div>{WEEKDAY_FORMAT.format(parseDate(iso)!)}</div>
                        <div className={iso === shown.today ? 'font-semibold text-gray-900' : ''}>{Number(iso.slice(8))}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.people.map((person) => (
                    <tr key={person.id}>
                      <th scope="row" className="sticky left-0 z-10 max-w-40 truncate bg-white px-3 text-left font-medium text-gray-800">
                        {person.name}
                      </th>
                      {days.map((iso) => (
                        <Cell key={iso} entry={entryOn(person.id, iso)} off={isOff(iso)} today={iso === shown.today} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[#CC1F1F]" /> Away
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-amber-500" /> Waiting for approval
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: 'linear-gradient(135deg, #CC1F1F 50%, #e5e7eb 50%)' }} /> Half day
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-gray-100 border border-gray-200" /> Weekend or public holiday
            </span>
          </div>
          <Card>
            <CardBody className="py-0">
              {away.length ? (
                <ul className="divide-y divide-gray-100">
                  {away.map((entry, i) => (
                    <li key={`${entry.personId}-${entry.start}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                      <span className="font-medium text-gray-900">{nameOf(entry.personId)}</span>
                      <span className="text-gray-600">
                        {formatRange(entry.start, entry.end, entry.halfDay)} · {describe(entry)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>Nobody is away this month.</Empty>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
