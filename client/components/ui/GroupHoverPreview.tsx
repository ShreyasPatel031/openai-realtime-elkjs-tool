import React, { useState, useEffect, useRef, MutableRefObject } from 'react';
import { ReactFlowInstance } from 'reactflow';

interface GroupHoverPreviewProps {
  reactFlowRef: MutableRefObject<ReactFlowInstance | null>;
  grid?: number;
  visible: boolean;
}

const GROUP_WIDTH = 480;
const GROUP_HEIGHT = 320;

const GroupHoverPreview: React.FC<GroupHoverPreviewProps> = ({ reactFlowRef, grid = 16, visible }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const lastScreenPosRef = useRef<{ x: number; y: number } | null>(null);

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

    let raf = 0;

    const snap = (v: number) => Math.round(v / grid) * grid;

    const reproject = (screen: { x: number; y: number }) => {
      const flow = rf.screenToFlowPosition(screen);
      const flowCorner = {
        x: snap(flow.x - GROUP_WIDTH / 2),
        y: snap(flow.y - GROUP_HEIGHT / 2),
      };
      const screenSnapped = rf.flowToScreenPosition(flowCorner);
      const paneRect = pane.getBoundingClientRect();
      setPos({ x: screenSnapped.x - paneRect.left, y: screenSnapped.y - paneRect.top });
      setZoom(rf.getViewport().zoom);
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

    if (lastScreenPosRef.current) {
      reproject(lastScreenPosRef.current);
    } else {
      const rect = pane.getBoundingClientRect();
      const fallback = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      lastScreenPosRef.current = fallback;
      reproject(fallback);
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
  }, [grid, reactFlowRef, visible]);

  if (!pos) return null;

  const width = GROUP_WIDTH * zoom;
  const height = GROUP_HEIGHT * zoom;

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width,
        height,
        borderRadius: 8 * zoom,
        border: `1px solid #E4E4E4`, /* Grey border at 100% opacity */
        outline: 'none', /* No outline */
        outlineWidth: 0,
        boxShadow: 'none', /* No shadow */
        background: 'rgba(228, 228, 228, 0.5)', /* Grey fill at 50% opacity */
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 100,
      }}
      className="group-hover-preview"
      data-hover-preview="group"
    />
  );
};

export default GroupHoverPreview;
