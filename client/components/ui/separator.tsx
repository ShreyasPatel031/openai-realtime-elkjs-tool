import React from 'react';

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function Separator({ 
  className, 
  orientation = 'horizontal', 
  ...props 
}: SeparatorProps) {
  return (
    <div
      className={`${
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'
      } bg-gray-200 ${className || ''}`}
      {...props}
    />
  );
} 