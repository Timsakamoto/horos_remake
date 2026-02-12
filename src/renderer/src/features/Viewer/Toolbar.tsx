import {
    LayoutGrid,
    Box,
    Layers,
    MousePointer2,
    Move,
    Search,
    Sun,
    Ruler,
    Circle
} from 'lucide-react';

export type ViewMode = '2D' | 'MPR' | '3D';
export type ToolMode = 'WindowLevel' | 'Pan' | 'Zoom' | 'Length' | 'Probe' | 'Rectangle' | 'Ellipse';

interface Props {
    activeView: ViewMode;
    onViewChange: (view: ViewMode) => void;
    activeTool: ToolMode;
    onToolChange: (tool: ToolMode) => void;
}

export const Toolbar = ({ activeView, onViewChange, activeTool, onToolChange }: Props) => {

    const renderViewButton = (mode: ViewMode, Icon: any, label: string) => (
        <button
            onClick={() => onViewChange(mode)}
            className={`
                flex flex-col items-center justify-center px-4 py-2 min-w-[60px] rounded-md transition-colors gap-1
                ${activeView === mode ? 'bg-horos-accent text-white shadow-sm' : 'text-gray-500 hover:bg-horos-hover hover:text-gray-800'}
            `}
            title={label}
        >
            <Icon size={20} strokeWidth={activeView === mode ? 2.5 : 1.5} />
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    );

    const renderToolButton = (tool: ToolMode, Icon: any, label: string) => (
        <button
            onClick={() => onToolChange(tool)}
            className={`
                flex flex-col items-center justify-center p-2 min-w-[50px] rounded-md transition-colors gap-1
                ${activeTool === tool ? 'bg-horos-selected text-horos-accent font-semibold' : 'text-gray-500 hover:bg-horos-hover hover:text-gray-800'}
            `}
            title={label}
        >
            <Icon size={18} strokeWidth={activeTool === tool ? 2.5 : 1.5} />
            <span className="text-[9px]">{label}</span>
        </button>
    );

    return (
        <div className="h-16 bg-white border-b border-horos-border flex items-center px-4 shadow-sm select-none">
            {/* View Modes */}
            <div className="flex gap-1 mr-6 border-r border-horos-border pr-6">
                {renderViewButton('2D', Layers, '2D')}
                {renderViewButton('MPR', LayoutGrid, 'MPR')}
                {renderViewButton('3D', Box, '3D VR')}
            </div>

            {/* Standard Tools */}
            <div className="flex gap-1 mr-6 border-r border-horos-border pr-6">
                {renderToolButton('WindowLevel', Sun, 'W/L')}
                {renderToolButton('Pan', Move, 'Pan')}
                {renderToolButton('Zoom', Search, 'Zoom')}
            </div>

            {/* Measurement Tools (Placeholders for now, will implement logic next) */}
            <div className="flex gap-1">
                {renderToolButton('Length', Ruler, 'Length')}
                {renderToolButton('Ellipse', Circle, 'ROI')}
            </div>

            <div className="flex-1" />

            <div className="text-xs text-gray-400 font-mono">
                Antigravity v0.2
            </div>
        </div>
    );
};
