import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { monthLabel, monthOf, type ContractsSummary, type ContractTotals } from '../../../shared/dashboard';
import { formatChange, formatEur } from './format';
import { useWidget } from './useWidget';
import { MonthSwitch, Widget, WidgetState } from './Widget';

function Side({ label, now, before, previousMonth }: { label: string; now: ContractTotals; before: ContractTotals; previousMonth: string }) {
  return (
    <div className="rounded-lg bg-[#F5F5F5] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {now.count}
        <span className="ml-1 text-sm font-medium text-gray-500">{now.count === 1 ? 'contract' : 'contracts'}</span>
      </p>
      <p className="text-sm font-semibold text-gray-700">{formatEur(now.eur)}</p>
      <p className="mt-1 text-xs text-gray-500" title={`${before.count} contracts, ${formatEur(before.eur)} in ${monthLabel(previousMonth)}`}>
        {formatChange(now.count, before.count)} vs {monthLabel(previousMonth).split(' ')[0]}
      </p>
    </div>
  );
}

/** Contracts of the month and their value in EUR, sales and purchases (administrators, Board, Administration). */
export function ContractsWidget({ className }: { className?: string }) {
  const current = monthOf(new Date());
  const [month, setMonth] = useState(current);
  const { data, error, loading } = useWidget<ContractsSummary>('contracts', month);
  return (
    <Widget id="contracts" title="Contracts" icon={FileSignature} className={className} action={<MonthSwitch month={month} current={current} onChange={setMonth} />}>
      {loading ? (
        <WidgetState kind="loading" />
      ) : error || !data ? (
        <WidgetState kind="error">{error ?? 'No data.'}</WidgetState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Side label="Sales" now={data.sales} before={data.previous.sales} previousMonth={data.previous.month} />
            <Side label="Purchases" now={data.purchases} before={data.previous.purchases} previousMonth={data.previous.month} />
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {data.pending > 0 ? (
              <span className="font-medium text-[#CC1F1F]">{data.pending} waiting for approval. </span>
            ) : null}
            Contracts made in the intranet in the chosen month, without cancelled ones; values in EUR at the rate of the contract's day.
            {data.withoutEur > 0 && ` ${data.withoutEur} without an EUR rate left out of the sums.`}
          </p>
        </>
      )}
    </Widget>
  );
}
