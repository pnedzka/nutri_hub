import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { CALENDAR_DAYS, calendarDays, dayOf, shiftDay, type CalendarItem, type CalendarWeek } from '../../../shared/dashboard';
import { useWidget } from './useWidget';
import { Widget, WidgetState } from './Widget';

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });
const utc = (day: string) => new Date(`${day}T00:00:00Z`);

const ARROW =
  'inline-flex h-11 w-11 sm:h-8 sm:w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]';

/** ‹ 24 Nov – 30 Nov › and "Today" when another week is shown. */
function WeekSwitch({ from, today, onChange }: { from: string; today: string; onChange: (from: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {from !== today && (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="mr-1 inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-[#CC1F1F] hover:bg-[#CC1F1F]/5 sm:h-8 pointer-coarse:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CC1F1F]"
        >
          Today
        </button>
      )}
      <button type="button" className={ARROW} onClick={() => onChange(shiftDay(from, -CALENDAR_DAYS))} aria-label="Previous week">
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-gray-700" aria-live="polite">
        {DAY.format(utc(from))} – {DAY.format(utc(shiftDay(from, CALENDAR_DAYS - 1)))}
      </span>
      <button type="button" className={ARROW} onClick={() => onChange(shiftDay(from, CALENDAR_DAYS))} aria-label="Next week">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function when(item: CalendarItem, day: string): string {
  if (item.allDay) return 'All day';
  const start = new Date(item.start);
  const end = new Date(item.end);
  // An event that started on an earlier day or ends on a later one shows its time on that day only.
  const from = dayOf(start) === day ? TIME.format(start) : '00:00';
  const to = dayOf(end) === day ? TIME.format(end) : '24:00';
  return `${from}–${to}`;
}

const STYLE: Record<CalendarItem['kind'], string> = {
  holiday: 'bg-[#CC1F1F]/10 text-[#CC1F1F]',
  absence: 'bg-amber-50 text-amber-900',
  event: 'bg-[#F5F5F5] text-gray-800',
};

function Entry({ item, day }: { item: CalendarItem; day: string }) {
  return (
    <li className={`rounded-lg px-2.5 py-1.5 text-sm ${STYLE[item.kind]}`} data-kind={item.kind}>
      {item.kind === 'event' && <p className="text-xs font-medium text-gray-500">{when(item, day)}</p>}
      <p className="font-medium break-words">{item.title}</p>
      {item.detail && <p className="text-xs opacity-80">{item.detail}</p>}
      {item.location && <p className="truncate text-xs text-gray-500" title={item.location}>{item.location}</p>}
    </li>
  );
}

const NOTE: Record<'off' | 'error', string> = {
  off: 'The company Google Calendar is not connected here.',
  error: 'The company Google Calendar did not answer. Try again later.',
};

/**
 * Seven days from today: public holidays, who is away (people with Leave; the type only for those who see it in
 * Leave) and, for administrators, Board and Administration, the events of the company's Google Calendar.
 */
export function CalendarWidget({ className }: { className?: string }) {
  const today = dayOf(new Date());
  const [from, setFrom] = useState(today);
  const { data, error, loading } = useWidget<CalendarWeek>('calendar', from, 'from');
  const days = data ? calendarDays(data.from, data.items) : [];
  const empty = days.every((d) => d.items.length === 0);
  return (
    <Widget id="calendar" title="Calendar" icon={CalendarDays} className={className} action={<WeekSwitch from={from} today={today} onChange={setFrom} />}>
      {loading ? (
        <WidgetState kind="loading" />
      ) : error || !data ? (
        <WidgetState kind="error">{error ?? 'No data.'}</WidgetState>
      ) : (
        <>
          {empty ? (
            <WidgetState kind="empty">Nothing in the calendar these days.</WidgetState>
          ) : (
            <ol className="grid gap-3 lg:grid-cols-7">
              {days.map(({ day, items }) => (
                <li key={day} className={items.length ? '' : 'hidden lg:block'} aria-label={`${WEEKDAY.format(utc(day))} ${DAY.format(utc(day))}`}>
                  <p className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${day === today ? 'text-[#CC1F1F]' : 'text-gray-500'}`}>
                    {day === today ? 'Today' : WEEKDAY.format(utc(day))} · {DAY.format(utc(day))}
                  </p>
                  {items.length ? (
                    <ul className="space-y-1.5">
                      {items.map((item) => (
                        <Entry key={item.id} item={item} day={day} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">–</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {(data.google === 'off' || data.google === 'error') && <p className="mt-3 text-xs text-gray-500">{NOTE[data.google]}</p>}
        </>
      )}
    </Widget>
  );
}
