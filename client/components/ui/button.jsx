import React from 'react';

const variantStyles = {
  default: 'bg-blue-500 text-white hover:bg-blue-600',
  ghost: 'bg-transparent hover:bg-gray-100',
  outline: 'bg-transparent border border-gray-300 hover:bg-gray-100',
};

const sizeStyles = {
  default: 'py-2 px-4',
  sm: 'py-1 px-3 text-sm',
  lg: 'py-3 px-6 text-lg',
  icon: 'p-2',
};

export function Button({ 
  children, 
  className = '', 
  variant = 'default', 
  size = 'default',
  ...props 
}) {
  return (
    <button
      className={`rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${variantStyles[variant] || variantStyles.default} ${sizeStyles[size] || sizeStyles.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
} 