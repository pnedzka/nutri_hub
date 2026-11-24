import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

/** Loads a widget's data (for a month or another period, `param`); a new period aborts the old request. */
export function useWidget<T>(widget: string, month = '', param = 'month') {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null });
  const key = `${widget}:${month}`;
  useEffect(() => {
    const controller = new AbortController();
    api<T>(`/api/people?${new URLSearchParams({ resource: 'dashboard', widget, ...(month ? { [param]: month } : {}) })}`, { signal: controller.signal })
      .then((data) => setState({ key, data, error: null }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setState({ key, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [key, widget, month, param]);
  const fresh = state.key === key;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: !fresh };
}
