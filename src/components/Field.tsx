import { type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react';

const labelClass = 'text-xs font-semibold text-gray-500 uppercase tracking-wider';
const controlClass = `w-full min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900
  placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent
  disabled:bg-gray-50 disabled:text-gray-500`;

function Labelled({ id, label, hint, children }: { id?: string; label?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, hint, id, className = '', children, ...props }, ref) => (
  <Labelled id={id} label={label} hint={hint}>
    <select ref={ref} id={id} className={`${controlClass} ${className}`} {...props}>
      {children}
    </select>
  </Labelled>
));
Select.displayName = 'Select';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ label, hint, id, className = '', ...props }, ref) => (
  <Labelled id={id} label={label} hint={hint}>
    <textarea ref={ref} id={id} className={`${controlClass} ${className}`} {...props} />
  </Labelled>
));
Textarea.displayName = 'Textarea';
