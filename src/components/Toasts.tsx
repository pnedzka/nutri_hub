import { useEffect } from 'react';
import { CheckCircle, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type ToastMessage, type ToastType } from '../lib/toast';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-green-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  info: <Info size={18} className="text-blue-500" />,
};

function ToastItem({ toast }: { toast: ToastMessage }) {
  const { removeToast } = useToastStore();

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <div className="flex items-start gap-3 bg-white rounded-xl shadow-lg border border-gray-100 p-4 w-full sm:w-auto sm:min-w-[280px] sm:max-w-sm">
      <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{toast.title}</p>
        {toast.message && <p className="text-xs text-gray-500 mt-0.5">{toast.message}</p>}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 -m-2.5 p-2.5 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6 sm:bottom-6 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
