// The leave API's responses (api/leave/*), shared by the server and the browser.
import type { Balance, LeaveSettings, LeaveStatus, LeaveType } from './leave';

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface LeaveRequestView {
  id: string;
  person: Person;
  type: LeaveType;
  start: string;
  end: string;
  halfDay: boolean;
  days: number;
  status: LeaveStatus;
  note: string | null;
  createdAt: string;
  /** Entered by an administrator for this person (not a request of their own). */
  enteredBy: Person | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** GET /api/leave */
export interface LeaveOverview {
  year: number;
  today: string;
  balance: Balance;
  /** The signed-in person's requests in the year, newest first. */
  requests: LeaveRequestView[];
  /** Pending requests the signed-in person may approve, with the requester's balance. */
  approvals: { request: LeaveRequestView; balance: Balance }[];
  /** Has people to approve (a manager) or is an administrator. */
  isApprover: boolean;
  isAdmin: boolean;
  /** Administrators: everyone with access to Leave, to enter leave for them. */
  people: Person[];
}

/** POST /api/leave */
export interface NewLeaveRequest {
  type: LeaveType;
  start: string;
  end: string;
  halfDay: boolean;
  note?: string;
  /** Administrators only: enter (already approved) leave for this person. */
  userId?: string;
}

/** POST /api/leave/decision */
export interface LeaveDecision {
  id: string;
  action: 'approve' | 'reject' | 'cancel';
  note?: string;
}

/** GET /api/leave/calendar?month=YYYY-MM */
export interface CalendarEntry {
  personId: string;
  start: string;
  end: string;
  halfDay: boolean;
  status: 'approved' | 'pending';
  /** Only for the person, their manager and administrators; others see "Absent". */
  type: LeaveType | null;
}

export interface CalendarResponse {
  month: string;
  today: string;
  people: Person[];
  entries: CalendarEntry[];
  holidays: string[];
}

/** GET /api/leave/employees (administrators) */
export interface EmployeeRow {
  person: Person;
  isAdmin: boolean;
  /** Settings saved by an administrator; false: the defaults are shown. */
  configured: boolean;
  settings: LeaveSettings;
  manager: Person | null;
  balance: Balance;
}

export interface EmployeesResponse {
  year: number;
  employees: EmployeeRow[];
}

/** PUT /api/leave/employees (administrators) */
export interface EmployeeSettingsUpdate extends LeaveSettings {
  userId: string;
  /** Days granted for the current year. */
  allowance: number;
}
