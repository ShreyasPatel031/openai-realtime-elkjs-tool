import React from 'react';

interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  id: string;
  value: string;
}

export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <div className={`space-y-2 ${className || ''}`} role="radiogroup" {...props} />
  );
}

export function RadioGroupItem({ id, className, ...props }: RadioGroupItemProps) {
  return (
    <input
      type="radio"
      id={id}
      className={`w-4 h-4 text-blue-600 focus:ring-blue-500 ${className || ''}`}
      {...props}
    />
  );
} 