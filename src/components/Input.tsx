import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900
              placeholder:text-gray-400 transition-colors
              focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent
              disabled:bg-gray-50 disabled:text-gray-500
              ${leftIcon ? 'pl-10' : ''}
              ${error ? 'border-red-400 focus:ring-red-400' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
