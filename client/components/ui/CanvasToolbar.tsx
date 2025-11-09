import React from "react";
import * as Lucide from "lucide-react";
import { Tool } from '../../hooks/useToolSelection';

export interface CanvasToolbarProps {
  selectedTool: Tool;
  onSelect: (tool: Tool) => void;
  className?: string;
}

const TOOL_SIZE = 24; // Figma: icon wrapper 24x24
const BAR_HEIGHT = 40; // Figma: total bar height 40
// Exact selected blue from Figma design
const BLUE_HEX = "#4285F4";

// Button wrapper exactly 24x24 with 4px inner padding (icon fits container)
const baseBtn =
  "flex items-center justify-center w-6 h-6 rounded-md transition-colors p-1"; // w-6/h-6 = 24px, p-1 = 4px

// Unselected: no border, white bg, subtle hover
const unselected = "bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100";
// Selected: solid brand blue, white icon
const selected = "text-white";

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({ selectedTool, onSelect, className }) => {
  const Btn: React.FC<{ tool: Tool; title: string; children: React.ReactNode }> = ({ tool, title, children }) => (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={(e) => {
        onSelect(tool);
      }}
      className={`${baseBtn} ${selectedTool === tool ? selected : unselected}`}
      style={selectedTool === tool ? { backgroundColor: BLUE_HEX } : undefined}
    >
      <div className="flex items-center justify-center w-full h-full">
        {children}
      </div>
    </button>
  );

  // Icon mappings with graceful fallbacks across lucide versions
  const SelectIcon = (Lucide as any).MousePointer2 || (Lucide as any).MousePointer;
  const BoxIcon = (Lucide as any).Square || (Lucide as any).RectangleHorizontal || (Lucide as any).RectangleVertical;
  // Use Spline per Figma selection; keep BezierCurve only as fallback if Spline missing
  const ConnectorIcon = (Lucide as any).Spline || (Lucide as any).BezierCurve;
  // Use Scan per Figma selection; keep RectangleDashed as fallback
  const GroupIcon = (Lucide as any).Scan || (Lucide as any).RectangleDashed || (Lucide as any).SquareDashed;

  return (
    <div
      className={`flex items-center bg-white/90 backdrop-blur-sm rounded-lg border border-gray-200 shadow-sm ${className || ""}`}
      style={{ height: BAR_HEIGHT, width: 160, paddingLeft: 16, paddingRight: 16, gap: 8 }}
    >
      {/* Select tool (left group) */}
      <Btn tool="select" title="Select (V)">
        {SelectIcon ? <SelectIcon className="w-5 h-5" /> : null}
      </Btn>

      {/* Divider between select and the other three */}
      {/* Divider between select and the other three (width 0, height 24, 1px left border) */}
      <div
        className="h-6"
        style={{ width: 0, borderLeft: '1px solid #e5e7eb' }}
      />

      {/* Box / Connector / Group (right items) */}
      <Btn tool="box" title="Add box (R)">
        {BoxIcon ? <BoxIcon className="w-full h-full" /> : null}
      </Btn>
      <Btn tool="connector" title="Add connector (C)">
        {ConnectorIcon ? <ConnectorIcon className="w-full h-full" /> : null}
      </Btn>
      <Btn tool="group" title="Create group (G)">
        {GroupIcon ? <GroupIcon className="w-full h-full" /> : null}
      </Btn>
    </div>
  );
};

export default CanvasToolbar;


