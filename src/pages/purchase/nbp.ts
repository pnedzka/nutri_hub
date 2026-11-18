import { useEffect, useState } from 'react';
import type { NbpRates } from '../../../shared/purchaseApi.ts';
import { api } from '../../lib/api';
import { PURCHASE_API } from './format';

let nbpRequest: Promise<NbpRates | null> | null = null;

/** Today's NBP rates, asked once per page load and shared by every price on the screen. */
export function useNbpRates(): NbpRates | null {
  const [rates, setRates] = useState<NbpRates | null>(null);
  useEffect(() => {
    nbpRequest ??= api<{ rates: NbpRates | null }>(`${PURCHASE_API}&view=nbpRates`)
      .then((answer) => answer.rates)
      .catch(() => {
        nbpRequest = null;
        return null;
      });
    let live = true;
    void nbpRequest.then((r) => live && setRates(r));
    return () => {
      live = false;
    };
  }, []);
  return rates;
}

