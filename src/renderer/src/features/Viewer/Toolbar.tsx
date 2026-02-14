import {
    LayoutGrid,
    Box,
    Layers,
    Move,
    Search,
    Sun,
    Ruler,
    Circle,
    Database,
    Play,
    Square,
    Settings,
    Crosshair,
    ChevronDown,
    Activity,
    ArrowUpRight,
    Maximize,
    Link,
    Unlink
} from 'lucide-react';
import { CLUT_PRESETS } from './CLUTPresets';

export type ViewMode = 'Database' | '2D' | 'MPR' | '3D' | 'PACS';
export type ToolMode =
    | 'WindowLevel'
    | 'Pan'
    | 'Zoom'
    | 'Length'
    | 'Probe'
    | 'Rectangle'
    | 'Ellipse'
    | 'Angle'
    | 'Arrow'
    | 'Bidirectional'
    | 'Magnify';

export type ProjectionMode = 'NORMAL' | 'MIP' | 'MINIP';
export type ToolbarMode = 'DATABASE' | 'VIEWER';

interface Props {
    mode: ToolbarMode;
    activeView: ViewMode;
    onViewChange: (view: ViewMode) => void;
    activeTool: ToolMode;
    onToolChange: (tool: ToolMode) => void;
    onOpenViewer?: () => void;
    onImport?: () => void;
    onOpenSettings?: () => void;
    // Phase 2 Props
    isCinePlaying?: boolean;
    onCineToggle?: () => void;
    activeCLUT?: string;
    onCLUTChange?: (name: string) => void;
    isSynced?: boolean;
    onSyncToggle?: () => void;
    // Phase 3/4 Props
    projectionMode?: ProjectionMode;
    onProjectionModeChange?: (mode: ProjectionMode) => void;
    slabThickness?: number;
    onSlabThicknessChange?: (thickness: number) => void;
}

export const Toolbar = ({
    mode,
    activeView,
    onViewChange,
    activeTool,
    onToolChange,
    onOpenViewer,
    onImport,
    onOpenSettings,
    isCinePlaying = false,
    onCineToggle,
    activeCLUT = 'Default',
    onCLUTChange,
    isSynced = false,
    onSyncToggle,
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
        <div
            onDoubleClick={() => (window as any).electron?.toggleMaximize()}
            className="h-24 bg-gradient-to-b from-[#e8e8e8] to-[#c2c2c2] border-b border-[#a0a0a0] flex flex-col pt-8 select-none z-40 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] drag"
        >
            {mode === 'DATABASE' ? (
                <div className="flex-1 flex items-center pl-8 pr-8 no-drag">
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 border border-[#000000]/10 shadow-inner">
                        {renderViewButton('Database', Database, 'Local DB')}
                        {renderViewButton('PACS', Database, 'PACS')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mx-4 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    <div className="flex-1 min-w-[20px] h-full" />

                    <div className="flex items-center gap-6">
                        <button
                            onClick={onImport}
                            className="group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 bg-white hover:bg-gray-50 text-gray-600 border border-[#c0c0c0] shadow-sm hover:scale-105 active:scale-95"
                            title="Import DICOM Files"
                        >
                            <div className="p-0.5 text-horos-accent">
                                <Layers size={20} strokeWidth={2.5} />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest">Import</span>
                        </button>

                        <button
                            onClick={onOpenViewer}
                            className="group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 bg-gradient-to-b from-horos-accent to-[#005bb7] text-white shadow-[0_2px_10px_rgba(0,103,209,0.3)] hover:scale-105 active:scale-95 border border-[#004a95]"
                            title="Open in Viewer"
                        >
                            <Layers size={20} strokeWidth={2.5} />
                            <span className="text-[8px] font-black uppercase tracking-widest drop-shadow-sm">View</span>
                        </button>
                    </div>

                    <div className="flex-1 min-w-[20px] h-full" />

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onOpenSettings}
                            className="group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 bg-white hover:bg-gray-50 text-gray-500 hover:text-horos-accent border border-[#c0c0c0] shadow-sm hover:scale-105 active:scale-95"
                            title="Preferences"
                        >
                            <div className="p-0.5">
                                <Settings size={20} strokeWidth={2.5} />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest text-[#8e8e93]">Config</span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center pl-8 pr-8 no-drag">
                    {/* View Modes */}
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 mr-6 border border-[#000000]/10 shadow-inner">
                        {renderViewButton('2D', Layers, '2D')}
                        {renderViewButton('MPR', LayoutGrid, 'MPR')}
                        {renderViewButton('3D', Box, '3D VR')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    {/* Standard Tools Group */}
                    <div className="flex gap-1 mr-6 relative">
                        {renderToolButton('WindowLevel', Sun, 'W/L')}
                        {renderToolButton('Pan', Move, 'Pan')}
                        {renderToolButton('Zoom', Search, 'Zoom')}
                        {renderToolButton('Magnify', Maximize, 'Mag')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    {/* Measurement Tools Group */}
                    <div className="flex gap-1 mr-6 relative">
                        {renderToolButton('Length', Ruler, 'Dist')}
                        {renderToolButton('Angle', Activity, 'Angle')}
                        {renderToolButton('Rectangle', Square, 'Rect')}
                        {renderToolButton('Ellipse', Circle, 'Oval')}
                        {renderToolButton('Probe', Crosshair, 'Probe')}
                        {renderToolButton('Arrow', ArrowUpRight, 'Note')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    {/* Controls Group: Cine, CLUT, Sync */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onCineToggle}
                            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 gap-1 ${isCinePlaying ? 'bg-orange-50 text-orange-500' : 'text-gray-400 hover:bg-gray-50'}`}
                            title="Toggle Cine Loop"
                        >
                            <Play size={16} fill={isCinePlaying ? 'currentColor' : 'none'} />
                            <span className="text-[8px] font-black uppercase tracking-widest">Cine</span>
                        </button>

                        <div className="flex flex-col gap-0.5 w-20">
                            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest pl-1">LUT</span>
                            <div className="relative group">
                                <select
                                    value={activeCLUT}
                                    onChange={(e) => onCLUTChange?.(e.target.value)}
                                    className="appearance-none bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-[9px] font-bold text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-horos-accent pr-5"
                                >
                                    {CLUT_PRESETS.map(p => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                            </div>
                        </div>

                        <button
                            onClick={onSyncToggle}
                            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 gap-1 ${isSynced ? 'bg-green-50 text-green-600' : 'text-gray-400 hover:bg-gray-50'}`}
                            title="Sync Scrolling"
                        >
                            {isSynced ? <Link size={16} /> : <Unlink size={16} />}
                            <span className="text-[8px] font-black uppercase tracking-widest">Sync</span>
                        </button>
                    </div>

                    <div className="flex-1 min-w-[20px] h-full" />

                    {/* Phase 4: MPR Tools */}
                    {activeView === 'MPR' && (
                        <div className="flex items-center gap-6 animate-in fade-in slide-in-from-left-8 duration-700">
                            <div className="flex bg-gray-50/50 p-1 rounded-xl gap-0.5 border border-gray-100">
                                {(['NORMAL', 'MIP', 'MINIP'] as ProjectionMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => onProjectionModeChange?.(mode)}
                                        className={`
                                            px-3 py-1 text-[8px] font-black rounded-lg transition-all tracking-[0.1em]
                                            ${projectionMode === mode
                                                ? 'bg-white text-horos-accent shadow-sm border border-gray-100'
                                                : 'text-gray-300 hover:text-gray-500'}
                                        `}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-col w-32 relative">
                                <div className="flex justify-between items-end mb-1 px-0.5">
                                    <span className="text-[7px] text-gray-300 uppercase font-black tracking-[0.2em]">Slab</span>
                                    <div className="flex items-baseline gap-0.5">
                                        <span className="text-xs font-black text-horos-accent drop-shadow-sm">{slabThickness}</span>
                                        <span className="text-[7px] font-bold text-gray-400">MM</span>
                                    </div>
                                </div>
                                <div className="relative h-4 flex items-center">
                                    <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        step="1"
                                        value={slabThickness}
                                        onChange={(e) => onSlabThicknessChange?.(parseInt(e.target.value))}
                                        className="w-full h-1 bg-gray-100 rounded-full appearance-none cursor-pointer accent-horos-accent hover:h-1.5 transition-all z-10"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
