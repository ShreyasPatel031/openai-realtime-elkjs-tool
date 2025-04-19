import React from 'react';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children?: React.ReactNode;
}

export function ScrollArea({ className, children, ...props }: ScrollAreaProps) {
  return (
    <div 
      className={`overflow-auto max-h-full ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
} 