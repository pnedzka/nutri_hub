import { create } from 'zustand';

// A question before a step (delete, publish, deactivate…) in the hub's own window (ConfirmHost) instead of the
// browser's confirm(): `if (!(await askConfirm('Delete the post?'))) return;`. The first paragraph of the text is the
// title, the rest the explanation. Delete, Remove, Deactivate and Disconnect get a red button.

export interface ConfirmOptions {
  /** The button that goes ahead; by default the first word of the title ("Delete", "Publish"…). */
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface ConfirmRequest extends Required<ConfirmOptions> {
  title: string;
  message: string;
  resolve: (ok: boolean) => void;
}

const DANGER = /^(Delete|Remove|Deactivate|Disconnect)\b/;

export function confirmRequest(text: string, options: ConfirmOptions, resolve: (ok: boolean) => void): ConfirmRequest {
  const [title, ...rest] = text.split('\n\n');
  return {
    title,
    message: rest.join('\n\n'),
    confirmLabel: options.confirmLabel ?? (title.split(/\s+/)[0] || 'OK'),
    cancelLabel: options.cancelLabel ?? 'Cancel',
    danger: options.danger ?? DANGER.test(title),
    resolve,
  };
}

export const useConfirm = create<{ request: ConfirmRequest | null; answer: (ok: boolean) => void }>((set, get) => ({
  request: null,
  answer: (ok) => {
    get().request?.resolve(ok);
    set({ request: null });
  },
}));

export function askConfirm(text: string, options: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    // A question still open is answered "no" before the new one shows.
    useConfirm.getState().request?.resolve(false);
    useConfirm.setState({ request: confirmRequest(text, options, resolve) });
  });
}
