import React, { useEffect, useRef, useState } from 'react';
import type { ReactFlowInstance } from 'reactflow';

interface NodeHoverPreviewProps {
  reactFlowRef: React.MutableRefObject<ReactFlowInstance | null>;
  grid?: number;
  visible: boolean;
}

const NodeHoverPreview: React.FC<NodeHoverPreviewProps> = ({ reactFlowRef, grid = 16, visible }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const lastScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  
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
    // Listen on the pane for cursor movement
    const pane = document.querySelector('.react-flow__pane');
    if (!pane || !(pane instanceof HTMLElement)) return;
    let raf = 0;
    const reproject = (screen: { x: number; y: number }) => {
      const rf = reactFlowRef.current;
      if (!rf) return;
      const world = (rf as any).screenToFlowPosition
        ? (rf as any).screenToFlowPosition({ x: screen.x, y: screen.y })
        : (rf as any).project({ x: screen.x, y: screen.y });
      const snap = (v: number) => Math.round(v / grid) * grid;
      const snappedWorld = { x: snap(world.x), y: snap(world.y) };
      const flowToScreen = (rf as any).flowToScreenPosition
        ? (rf as any).flowToScreenPosition(snappedWorld)
        : null;
      const vp = (rf as any).getViewport ? (rf as any).getViewport() : { zoom: (rf as any).getZoom ? (rf as any).getZoom() : 1 };
      if (flowToScreen) {
        const rect = pane.getBoundingClientRect();
        const left = (flowToScreen as any).x - rect.left;
        const top = (flowToScreen as any).y - rect.top;
        setPos({ x: left, y: top });
        setZoom(vp.zoom || 1);
      } else {
        const rect = pane.getBoundingClientRect();
        const viewport = (rf as any).getViewport ? (rf as any).getViewport() : { x: 0, y: 0, zoom: (rf as any).getZoom ? (rf as any).getZoom() : 1 };
        const screenX = snappedWorld.x * viewport.zoom + viewport.x - rect.left;
        const screenY = snappedWorld.y * viewport.zoom + viewport.y - rect.top;
        setPos({ x: screenX, y: screenY });
        setZoom(viewport.zoom || 1);
      }
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
    // This ensures preview shows immediately when switching to box tool
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

  if (!visible || !pos) return null;
  const NODE_SIZE = 96;
  const size = NODE_SIZE * zoom;
  const half = size / 2;
  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: size,
        height: size,
        borderRadius: 8 * zoom,
        border: `${1 * zoom}px solid #e4e4e4`,
        background: 'rgba(228,228,228,0.5)',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        // center anchored to match cursor-centered placement
        transform: `translate(-${half}px, -${half}px)`,
        zIndex: 100
      }}
    />
  );
};

export default NodeHoverPreview;


