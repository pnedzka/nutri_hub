import { describe, expect, it } from 'vitest';
import { askConfirm, confirmRequest, useConfirm } from './confirm';

describe('confirmRequest', () => {
  it('takes the title from the first paragraph and the button from its first word', () => {
    const r = confirmRequest('Delete the account a@b.c?\n\nThis cannot be undone.', {}, () => {});
    expect(r).toMatchObject({ title: 'Delete the account a@b.c?', message: 'This cannot be undone.', confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true });
  });
  it('is not red for steps that delete nothing, and takes given labels', () => {
    expect(confirmRequest('Publish this post? Everyone gets an e-mail.', {}, () => {})).toMatchObject({ confirmLabel: 'Publish', danger: false, message: '' });
    expect(confirmRequest('Cancel this request?', { confirmLabel: 'Cancel request', cancelLabel: 'Keep it', danger: true }, () => {})).toMatchObject({ confirmLabel: 'Cancel request', cancelLabel: 'Keep it', danger: true });
  });
});

describe('askConfirm', () => {
  it('resolves with the answer, and answers an older open question "no"', async () => {
    const first = askConfirm('Remove the photo?');
    const second = askConfirm('Delete this comment?');
    await expect(first).resolves.toBe(false);
    useConfirm.getState().answer(true);
    await expect(second).resolves.toBe(true);
    expect(useConfirm.getState().request).toBeNull();
  });
});
