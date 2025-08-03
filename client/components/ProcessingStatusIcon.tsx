import React, { useState, useEffect, useRef } from 'react';
import { Search, Code, Bot, Check } from 'lucide-react';

type ProcessingState = 'idle' | 'search' | 'function-call' | 'reasoning' | 'complete';

const ProcessingStatusIcon: React.FC = () => {
  const [state, setState] = useState<ProcessingState>('idle');
  const [isVisible, setIsVisible] = useState(true);
  const stateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const blinkIntervalRef = useRef<number | null>(null);
  const currentStateStartTime = useRef<number>(0);

  const startBlinking = () => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
    }
    
    setIsVisible(true);
    blinkIntervalRef.current = window.setInterval(() => {
      setIsVisible(prev => !prev);
    }, 500); // Blink every 500ms (appear/disappear)
  };

  const stopBlinking = () => {
    if (blinkIntervalRef.current) {
      clearInterval(blinkIntervalRef.current);
      blinkIntervalRef.current = null;
    }
    setIsVisible(true);
  };

  const setStateWithMinDuration = (newState: ProcessingState, minDuration: number = 0) => {
    console.log(`🎯 ProcessingStatusIcon: Setting state to ${newState} with min duration ${minDuration}ms`);
    
    if (stateTimeoutRef.current) {
      clearTimeout(stateTimeoutRef.current);
    }

    const now = Date.now();
    const elapsed = now - currentStateStartTime.current;
    const remainingTime = Math.max(0, minDuration - elapsed);

    const updateState = () => {
      setState(newState);
      currentStateStartTime.current = Date.now();
      
      // Start blinking for active states, stop for idle/complete
      if (newState === 'search' || newState === 'function-call' || newState === 'reasoning') {
        startBlinking();
      } else {
        stopBlinking();
      }
    };

    if (remainingTime > 0) {
      console.log(`🎯 ProcessingStatusIcon: Waiting ${remainingTime}ms before state change`);
      stateTimeoutRef.current = setTimeout(updateState, remainingTime);
    } else {
      updateState();
    }
  };

  useEffect(() => {
    const handleUserRequirementsStart = () => {
      console.log('🎯 ProcessingStatusIcon: userRequirementsStart received');
      setStateWithMinDuration('search', 2000); // Minimum 2 seconds
    };

    const handleFunctionCall = () => {
      console.log('🎯 ProcessingStatusIcon: functionCallStart received');
      setStateWithMinDuration('function-call', 2000); // Minimum 2 seconds
    };

    const handleReasoning = () => {
      console.log('🎯 ProcessingStatusIcon: reasoningStart received');
      setStateWithMinDuration('reasoning', 2000); // Minimum 2 seconds
    };

    const handleComplete = () => {
      console.log('🎯 ProcessingStatusIcon: processingComplete received, current state:', state);
      
      // Clear any existing timeout to avoid conflicts
      if (stateTimeoutRef.current) {
        clearTimeout(stateTimeoutRef.current);
      }
      
      // Stop any blinking and show complete immediately
      stopBlinking();
      setState('complete');
      currentStateStartTime.current = Date.now();
      
      // Reset to idle after 1 second
      stateTimeoutRef.current = setTimeout(() => {
        console.log('🎯 ProcessingStatusIcon: resetting to idle after complete');
        setState('idle');
        currentStateStartTime.current = Date.now();
      }, 1000);
    };

    // Listen for custom events
    window.addEventListener('userRequirementsStart', handleUserRequirementsStart);
    window.addEventListener('functionCallStart', handleFunctionCall);
    window.addEventListener('reasoningStart', handleReasoning);
    window.addEventListener('processingComplete', handleComplete);

    return () => {
      if (stateTimeoutRef.current) {
        clearTimeout(stateTimeoutRef.current);
      }
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
      window.removeEventListener('userRequirementsStart', handleUserRequirementsStart);
      window.removeEventListener('functionCallStart', handleFunctionCall);
      window.removeEventListener('reasoningStart', handleReasoning);
      window.removeEventListener('processingComplete', handleComplete);
    };
  }, []);

  const getIcon = () => {
    const baseClasses = "w-6 h-6";
    const iconStyle = { 
      opacity: isVisible ? 1 : 0,
      transition: 'opacity 0.1s ease-in-out'
    };
    
    switch (state) {
      case 'search':
        return <Search className={baseClasses} style={iconStyle} />;
      case 'function-call':
        return <Code className={baseClasses} style={iconStyle} />;
      case 'reasoning':
        return <Bot className={baseClasses} style={iconStyle} />;
      case 'complete':
        return <Check className={baseClasses} style={iconStyle} />;
      default:
        return <img 
          src="/assets/canvas/atelier.png" 
          alt="Atelier" 
          className="w-full h-full" 
          style={{ 
            objectFit: 'contain',
            opacity: isVisible ? 1 : 0,
            transition: 'opacity 0.1s ease-in-out'
          }}
        />;
    }
  };

  const getTitle = () => {
    switch (state) {
      case 'search':
        return 'Searching for architecture';
      case 'function-call':
        return 'Executing function call';
      case 'reasoning':
        return 'Processing reasoning';
      case 'complete':
        return 'Processing complete';
      default:
        return 'Atelier';
    }
  };

  return (
    <button
      className="w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all duration-200 p-0 overflow-hidden"
      title={getTitle()}
    >
      {getIcon()}
    </button>
  );
};

export default ProcessingStatusIcon;        

