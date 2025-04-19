import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <div className={`rounded-lg border border-gray-200 shadow-sm ${className || ''}`} {...props} />
  );
}

export function CardContent({ className, ...props }: CardProps) {
  return (
    <div className={`p-6 ${className || ''}`} {...props} />
  );
}

export function CardFooter({ className, ...props }: CardProps) {
  return (
    <div className={`p-6 pt-0 border-t border-gray-200 ${className || ''}`} {...props} />
  );
} 