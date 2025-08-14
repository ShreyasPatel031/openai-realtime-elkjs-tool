import React, { useState } from 'react';
import { SquarePen } from 'lucide-react';

const EditButton: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed top-4 right-4 flex items-center justify-center h-10 bg-white rounded-lg shadow-lg border border-gray-200 text-gray-700 hover:shadow-md transition-all duration-300 ease-in-out overflow-hidden"
      style={{ width: isHovered ? '90px' : '40px' }}
    >
      <span
        className="transition-opacity duration-300 ease-in-out whitespace-nowrap"
        style={{ opacity: isHovered ? 1 : 0, transform: isHovered ? 'translateX(0)' : 'translateX(10px)' }}
      >
        Edit
      </span>
      <SquarePen className="absolute right-2.5 transition-transform duration-300 ease-in-out" style={{ transform: isHovered ? 'translateX(0)' : 'translateX(0)' }} />
    </button>
  );
};

export default EditButton;
