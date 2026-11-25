import { createContext, useContext } from 'react';
import type { ComplaintSetup } from '../../../shared/complaintsApi.ts';

export const COMPLAINTS_API = '/api/people?resource=complaints';

/** Who the signed-in person is in the module (from view=setup), shared by the screens. */
export const SetupContext = createContext<ComplaintSetup | null>(null);
export const useSetup = () => useContext(SetupContext);
