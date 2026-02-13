import {
    LayoutGrid,
    Box,
    Layers,
    MousePointer2,
    Move,
    Search,
    Sun,
    Ruler,
    Circle,
    Database
} from 'lucide-react';

export type ViewMode = '2D' | 'MPR' | '3D' | 'PACS';
export type ToolMode = 'WindowLevel' | 'Pan' | 'Zoom' | 'Length' | 'Probe' | 'Rectangle' | 'Ellipse';
export type ProjectionMode = 'NORMAL' | 'MIP' | 'MinIP';

interface Props {
    activeView: ViewMode;
    onViewChange: (view: ViewMode) => void;
    activeTool: ToolMode;
    onToolChange: (tool: ToolMode) => void;
    // Phase 4 Props
    projectionMode?: ProjectionMode;
    onProjectionModeChange?: (mode: ProjectionMode) => void;
    slabThickness?: number;
    onSlabThicknessChange?: (thickness: number) => void;
}

export const Toolbar = ({
    activeView,
    onViewChange,
    activeTool,
    onToolChange,
    projectionMode = 'NORMAL',
    onProjectionModeChange,
    slabThickness = 0,
    onSlabThicknessChange
}: Props) => {

    const renderViewButton = (mode: ViewMode, Icon: any, label: string) => (
        <button
            onClick={() => onViewChange(mode)}
            className={`
                relative flex items-center justify-center h-8 px-4 rounded-lg transition-all duration-300 gap-2
                ${activeView === mode
                    ? 'bg-white text-horos-accent shadow-[0_2px_8px_rgba(0,0,0,0.08)] scale-[1.02] z-10'
                    : 'text-gray-400 hover:text-gray-600'
                }
            `}
            title={label}
        >
            <Icon size={16} strokeWidth={activeView === mode ? 2.5 : 2} />
            <span className={`text-[11px] font-bold tracking-tight ${activeView === mode ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
            {activeView === mode && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-horos-accent animate-in fade-in zoom-in duration-500" />
            )}
        </button>
    );

    const renderToolButton = (tool: ToolMode, Icon: any, label: string) => (
        <button
            onClick={() => onToolChange(tool)}
            className={`
                group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                ${activeTool === tool
                    ? 'bg-blue-50/50 text-horos-accent shadow-inner'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                }
            `}
            title={label}
        >
            <div className={`
                p-2 rounded-lg transition-all duration-300
                ${activeTool === tool ? 'scale-110' : 'group-hover:scale-110'}
            `}>
                <Icon size={18} strokeWidth={activeTool === tool ? 2.5 : 2} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
        </button>
    );

    return (
        <div className="h-20 bg-white border-b border-gray-100 flex items-center px-8 select-none z-40">
            {/* View Modes - LiftKit Segmented Control */}
            <div className="flex bg-gray-100/50 p-1 rounded-[12px] gap-0.5 mr-10 border border-gray-50">
                {renderViewButton('2D', Layers, '2D')}
                {renderViewButton('MPR', LayoutGrid, 'MPR')}
                {renderViewButton('3D', Box, '3D VR')}
                {renderViewButton('PACS', Database, 'PACS')}
            </div>

            {/* Standard Tools Group */}
            <div className="flex gap-2 mr-10 relative">
                <div className="absolute -top-3 left-0">
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-[0.3em]">Navigation</span>
                </div>
                {renderToolButton('WindowLevel', Sun, 'W/L')}
                {renderToolButton('Pan', Move, 'Pan')}
                {renderToolButton('Zoom', Search, 'Zoom')}
            </div>

            {/* Measurement Tools Group */}
            <div className="flex gap-2 mr-10 relative">
                <div className="absolute -top-3 left-0">
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-[0.3em]">Analysis</span>
                </div>
                {renderToolButton('Length', Ruler, 'Dist')}
                {renderToolButton('Ellipse', Circle, 'ROI')}
            </div>

            {/* Phase 4: MPR Tools (Perfectionist Refinement) */}
            {activeView === 'MPR' && (
                <div className="flex items-center gap-10 animate-in fade-in slide-in-from-left-8 duration-700">
                    <div className="flex bg-gray-50/50 p-1 rounded-xl gap-1 border border-gray-100">
                        {(['NORMAL', 'MIP', 'MinIP'] as ProjectionMode[]).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => onProjectionModeChange?.(mode)}
                                className={`
                                    px-5 py-1.5 text-[10px] font-black rounded-lg transition-all tracking-[0.1em]
                                    ${projectionMode === mode
                                        ? 'bg-white text-horos-accent shadow-sm border border-gray-100'
                                        : 'text-gray-300 hover:text-gray-500'}
                                `}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col w-48 relative">
                        <div className="flex justify-between items-end mb-2.5 px-0.5">
                            <span className="text-[9px] text-gray-300 uppercase font-black tracking-[0.2em]">Slab Thickness</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-black text-horos-accent drop-shadow-sm">{slabThickness}</span>
                                <span className="text-[8px] font-bold text-gray-400">MM</span>
                            </div>
                        </div>
                        <div className="relative h-6 flex items-center">
                            <input
                                type="range"
                                min="0"
                                max="50"
                                step="1"
                                value={slabThickness}
                                onChange={(e) => onSlabThicknessChange?.(parseInt(e.target.value))}
                                className="w-full h-1 bg-gray-100 rounded-full appearance-none cursor-pointer accent-horos-accent hover:h-1.5 transition-all z-10"
                            />
                            {/* Visual Scale Dots */}
                            <div className="absolute inset-0 flex justify-between items-center px-0.5 pointer-events-none">
                                {[0, 10, 20, 30, 40, 50].map(val => (
                                    <div key={val} className="w-0.5 h-0.5 rounded-full bg-gray-200" />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1" />

            {/* Branding - Subtle LiftKit Polish */}
            <div className="flex items-center gap-4 bg-gray-50/50 px-4 py-2 rounded-2xl border border-gray-100">
                <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-horos-accent animate-pulse" />
                        <span className="text-[10px] font-black text-gray-900 tracking-[0.1em]">ANTIGRAVITY</span>
                    </div>
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter opacity-60">Engine v2.0</span>
                </div>
            </div>
        </div>
    );
};
