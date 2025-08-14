import React, { useState } from 'react';
import { Pen } from 'lucide-react';

interface EditButtonProps {
  onClick: () => void;
}

const EditButton: React.FC<EditButtonProps> = ({ onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed top-4 right-4 flex items-center h-10 bg-white rounded-lg shadow-lg border border-gray-200 text-gray-700 hover:shadow-md transition-all duration-300 ease-out overflow-hidden"
      style={{ 
        width: isHovered ? '80px' : '40px',
        justifyContent: 'flex-start',
        paddingLeft: '12px' // Increased padding for more space
      }}
    >
      <span
        className="whitespace-nowrap transition-opacity duration-200 z-0 text-sm" // Smaller text
        style={{ opacity: isHovered ? 1 : 0 }}
      >
        edit
      </span>
      <div 
        className="absolute right-0 top-0 h-full w-10 flex items-center justify-center bg-white z-10 transition-all duration-300 ease-out"
      >
        <Pen className="w-4 h-4" /> 
      </div>
    </button>
  );
};

export default EditButton;
