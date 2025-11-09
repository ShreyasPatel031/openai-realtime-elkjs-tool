import React, { useState, useEffect, useRef, MutableRefObject } from 'react';
import { ReactFlowInstance } from 'reactflow';

interface GroupHoverPreviewProps {
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>;
  grid?: number;
  visible: boolean;
}

const GroupHoverPreview: React.FC<GroupHoverPreviewProps> = ({ reactFlowRef, grid = 16, visible }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const lastScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  
  // Group dimensions: 480x320 (30×16, 20×16 - grid aligned) - must match InteractiveCanvas
  const GROUP_WIDTH = 480;
  const GROUP_HEIGHT = 320;
  
  // Track mouse position even when not visible, so preview shows immediately when tool is selected
  useEffect(() => {
    const pane = document.querySelector('.react-flow__pane');
    if (!pane || !(pane instanceof HTMLElement)) return;
    
    const trackMouse = (e: MouseEvent) => {
      lastScreenPosRef.current = { x: e.clientX, y: e.clientY };
    };
    
    pane.addEventListener('mousemove', trackMouse);
    return () => {
      pane.removeEventListener('mousemove', trackMouse);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setPos(null);
      return;
    }

    const pane = document.querySelector('.react-flow__pane');
    if (!pane || !(pane instanceof HTMLElement)) return;

    const rf = reactFlowRef.current;
    if (!rf) return;

    let raf: number;
    
    const reproject = (screen: { x: number; y: number }) => {
      const flow = rf.screenToFlowPosition(screen);
      const snap = (v: number) => Math.round(v / grid) * 16;
      
      // Match the exact group creation logic: subtract half dimensions, then snap corner
      const cornerFlow = { 
        x: flow.x - (GROUP_WIDTH / 2), // 480/2 = 240
        y: flow.y - (GROUP_HEIGHT / 2)  // 320/2 = 160
      };
      const snappedCorner = { x: snap(cornerFlow.x), y: snap(cornerFlow.y) };
      
      // CORRECTLY convert flow→screen like NodeHoverPreview does  
      const screenSnapped = rf.flowToScreenPosition(snappedCorner);
      const paneRect = pane.getBoundingClientRect();
      const finalPos = {
        x: screenSnapped.x - paneRect.left,
        y: screenSnapped.y - paneRect.top
      };
      
      console.log('🟡 [GroupHoverPreview] COORDINATES FIXED:', {
        screenMouse: screen,
        flowMouse: flow, 
        cornerFlow: cornerFlow,
        snappedCorner: snappedCorner,
        screenSnapped: screenSnapped,
        paneRect: { left: paneRect.left, top: paneRect.top },
        finalPreviewPos: finalPos,
        note: 'Now correctly adjusting for pane offset like NodeHoverPreview'
      });
      
      const { zoom: currentZoom } = rf.getViewport();
      setZoom(currentZoom);
      setPos(finalPos);
    };

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const screen = { x: e.clientX, y: e.clientY };
        lastScreenPosRef.current = screen;
        reproject(screen);
      });
    };
    const onWheel = () => {
      if (!lastScreenPosRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        reproject(lastScreenPosRef.current!);
      });
    };
    
    // Initialize position immediately when becoming visible (use current mouse position if available)
    // This ensures preview shows immediately when switching to group tool
    if (lastScreenPosRef.current) {
      reproject(lastScreenPosRef.current);
    } else {
      // If no last position, try to get current mouse position from document
      const getCurrentMousePos = () => {
        // We can't get current mouse position without an event, so we'll wait for first mousemove
        // But we can initialize at center of viewport as fallback
        const rect = pane.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return { x: centerX, y: centerY };
      };
      const fallbackPos = getCurrentMousePos();
      lastScreenPosRef.current = fallbackPos;
      reproject(fallbackPos);
    }
    
    pane.addEventListener('mousemove', onMove);
    pane.addEventListener('wheel', onWheel, { passive: true });
    const onLeave = () => setPos(null);
    pane.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      pane.removeEventListener('mousemove', onMove);
      pane.removeEventListener('wheel', onWheel as any);
      pane.removeEventListener('mouseleave', onLeave);
    };
  }, [reactFlowRef, grid, visible]);

  if (!pos) return null;

  const width = GROUP_WIDTH * zoom;
  const height = GROUP_HEIGHT * zoom;
  
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: width,
        height: height,
        borderRadius: 8 * zoom,
        border: `${1 * zoom}px solid #e4e4e4`,
        background: 'rgba(228,228,228,0.5)', // Same hover background from Figma
        boxSizing: 'border-box',
        pointerEvents: 'none',
        // No transform needed - pos is already the correct corner position
        zIndex: 100
      }}
    />
  );
};

export default GroupHoverPreview;
