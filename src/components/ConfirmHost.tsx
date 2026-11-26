import { useConfirm } from '../lib/confirm';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** Shows the question of askConfirm() (src/lib/confirm.ts); mounted once in App. */
export function ConfirmHost() {
  const { request, answer } = useConfirm();
  if (!request) return null;
  return (
    <Dialog
      title={request.title}
      onClose={() => answer(false)}
      footer={
        <>
          <Button variant="secondary" onClick={() => answer(false)}>{request.cancelLabel}</Button>
          <Button data-autofocus variant={request.danger ? 'danger' : 'primary'} onClick={() => answer(true)}>
            {request.confirmLabel}
          </Button>
        </>
      }
    >
      {request.message && <p className="whitespace-pre-line">{request.message}</p>}
    </Dialog>
  );
}
