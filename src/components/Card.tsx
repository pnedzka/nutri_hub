import type { HTMLAttributes } from 'react';

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = '', children, ...props }: DivProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }: DivProps) {
  return (
    <div className={`px-6 py-4 border-b border-gray-100 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className = '', children, ...props }: DivProps) {
  return (
    <div className={`px-6 py-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
