import { useState } from 'react';
import {
    LayoutGrid,
    Layers,
    Move,
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
    Unlink,
    Scissors,
    RotateCw,
    Type,
    // Target, // Unused
    AlignJustify,
    Columns,
    PanelRight
} from 'lucide-react';
import { CLUT_PRESETS } from './CLUTPresets';
import { GridSelector } from './GridSelector';

import { ViewMode, ToolMode, ProjectionMode, ToolbarMode } from './types';

export interface WWLPreset {
    name: string;
    windowWidth: number;
    windowCenter: number;
}

export const WWL_PRESETS: WWLPreset[] = [
    { name: 'Soft Tissue', windowWidth: 350, windowCenter: 50 },
    { name: 'Abdomen', windowWidth: 500, windowCenter: 100 },
    { name: 'Mediastinum', windowWidth: 1000, windowCenter: 200 },
    { name: 'Lung', windowWidth: 1500, windowCenter: -500 },
    { name: 'Bone', windowWidth: 2000, windowCenter: 400 },
];

// ProjectionMode and ToolbarMode are now imported from types.ts

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
    selectedSeriesUid?: string | null;
    layout?: { rows: number; cols: number };
    onLayoutChange?: (rows: number, cols: number) => void;
    activeModality?: string | null;
    // Phase D Props
    isClipping?: boolean;
    onClippingToggle?: () => void;
    clippingRange?: number;
    onClippingRangeChange?: (range: number) => void;
    isAutoRotating?: boolean;
    onAutoRotateToggle?: () => void;
    // Overlay Props
    showOverlays?: boolean;
    onToggleOverlays?: () => void;
    onPresetSelect?: (preset: WWLPreset) => void;
    activeViewportOrientation?: 'Axial' | 'Coronal' | 'Sagittal' | 'Default';
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
    onSlabThicknessChange,
    layout = { rows: 1, cols: 1 },
    onLayoutChange,
    activeModality,
    isClipping = false,
    onClippingToggle,
    clippingRange = 50,
    onClippingRangeChange,
    isAutoRotating = false,
    onAutoRotateToggle,
    showOverlays = true,
    onToggleOverlays,
    onPresetSelect,
    activeViewportOrientation,
}: Props) => {
    // console.log('Toolbar Render:', { activeView, activeViewportOrientation });

    const [showMPRControls, setShowMPRControls] = useState(false);
    const [showWLPresets, setShowWLPresets] = useState(false);

    const renderViewButton = (mode: ViewMode, Icon: any, label: string) => {
        const isMprOr3D = mode === 'MPR' || mode === '3D';
        const isDisabled = !!(isMprOr3D && activeModality && ['CR', 'DX', 'MG', 'RF', 'XA'].includes(activeModality));
        const isButtonActive = activeView === mode || activeViewportOrientation === mode;

        const handleClick = () => {
            if (isDisabled) return;
            // The user wants Slab/MIP controls for Axial, Coronal, and Sagittal, but NOT for MPR.
            const isSectional = mode === 'Axial' || mode === 'Coronal' || mode === 'Sagittal';

            if (isSectional) {
                if (activeViewportOrientation === mode) {
                    setShowMPRControls(!showMPRControls);
                } else {
                    onViewChange(mode);
                    setShowMPRControls(false); // Reset on new entry
                }
            } else {
                onViewChange(mode);
                setShowMPRControls(false);
            }
        };

        return (
            <div className="relative">
                <button
                    onClick={handleClick}
                    disabled={isDisabled}
                    className={`
                    relative flex flex-col items-center justify-center min-w-[52px] h-[52px] rounded-lg transition-all duration-300 gap-1
                    ${isButtonActive
                            ? 'bg-white text-peregrine-accent shadow-[0_2px_8px_rgba(0,0,0,0.08)] scale-[1.02] z-10'
                            : isDisabled
                                ? 'text-gray-200 cursor-not-allowed opacity-30'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'}
                `}
                    title={isDisabled ? `${label} (Not supported for ${activeModality})` : label}
                >
                    <Icon size={18} strokeWidth={isButtonActive ? 2.5 : 2} />
                    <span className={`text-[10px] font-black uppercase tracking-tighter ${isButtonActive ? 'opacity-100' : 'opacity-60'}`}>{label}</span>
                    {isButtonActive && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-peregrine-accent animate-in fade-in zoom-in duration-500" />
                    )}
                </button>

                {/* Section Controls Popup (Axial, Coronal, Sagittal) */}
                {(mode === 'Axial' || mode === 'Coronal' || mode === 'Sagittal') && activeViewportOrientation === mode && showMPRControls && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/90 backdrop-blur-md border border-gray-200 shadow-xl rounded-xl p-3 z-50 animate-in fade-in zoom-in-95 duration-200 w-64 flex flex-col gap-3">
                        {/* Triangle Arrow */}
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 border-t border-l border-gray-200" />

                        {/* Projection Mode */}
                        <div className="flex bg-gray-100/50 p-1 rounded-lg gap-0.5">
                            {(['NORMAL', 'MIP', 'MINIP'] as ProjectionMode[]).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => onProjectionModeChange?.(m)}
                                    className={`
                                            flex-1 py-1.5 text-[9px] font-black rounded-md transition-all tracking-wider
                                            ${projectionMode === m
                                            ? 'bg-white text-peregrine-accent shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600 hover:bg-black/5'}
                                        `}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>

                        {/* Slab Thickness */}
                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Slab Thickness</span>
                                <span className="text-[10px] font-black text-peregrine-accent">{slabThickness} mm</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="10"
                                step="1"
                                value={slabThickness}
                                onChange={(e) => onSlabThicknessChange?.(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-peregrine-accent hover:accent-blue-600"
                            />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderToolButton = (tool: ToolMode, Icon: any, label: string) => (
        <button
            onClick={() => onToolChange(tool)}
            className={`
                group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                ${activeTool === tool
                    ? 'bg-blue-50/50 text-peregrine-accent shadow-inner'
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
            {/* ... (Database Mode Block) ... */}

            {mode === 'DATABASE' ? (
                // ... (Existing Database JSX) ...
                <div className="flex-1 flex items-center pl-8 pr-8 no-drag">
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 border border-[#000000]/10 shadow-inner">
                        {renderViewButton('Database', Database, 'Local DB')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mx-4 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    <div className="flex-1 min-w-[20px] h-full" />

                    <div className="flex items-center gap-6">
                        {/* Import Button */}
                        <button
                            onClick={onImport}
                            className="group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 bg-white hover:bg-gray-50 text-gray-600 border border-[#c0c0c0] shadow-sm hover:scale-105 active:scale-95"
                            title="Import DICOM Files"
                        >
                            <div className="p-0.5 text-peregrine-accent">
                                <Layers size={20} strokeWidth={2.5} />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest">Import</span>
                        </button>

                        <button
                            onClick={onOpenViewer}
                            className="group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 bg-gradient-to-b from-peregrine-accent to-[#005bb7] text-white shadow-[0_2px_10px_rgba(0,103,209,0.3)] hover:scale-105 active:scale-95 border border-[#004a95]"
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
                            className="group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 bg-white hover:bg-gray-50 text-gray-500 hover:text-peregrine-accent border border-[#c0c0c0] shadow-sm hover:scale-105 active:scale-95"
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
                    {/* Database & PACS Navigation (Persistent) */}
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 mr-6 border border-[#000000]/10 shadow-inner">
                        {renderViewButton('Database', Database, 'Local DB')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    {/* View Modes & Grid Selector */}
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 mr-6 border border-[#000000]/10 shadow-inner">
                        {onLayoutChange && <GridSelector currentLayout={layout} onChange={onLayoutChange} />}
                        {renderViewButton('2D', Layers, '2D')}
                        {renderViewButton('Axial', AlignJustify, 'Axial')}
                        {renderViewButton('Coronal', Columns, 'Coronal')}
                        {renderViewButton('Sagittal', PanelRight, 'Sagittal')}
                        {renderViewButton('MPR', LayoutGrid, 'MPR')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    {/* Standard Tools Group */}
                    <div className="flex gap-1 mr-6 relative">
                        {activeView === 'MPR' && renderToolButton('Crosshairs', Crosshair, 'Sync')}

                        <div className="relative">
                            <button
                                onClick={() => {
                                    if (activeTool === 'WindowLevel') {
                                        setShowWLPresets(!showWLPresets);
                                    } else {
                                        onToolChange('WindowLevel');
                                        setShowWLPresets(false);
                                    }
                                }}
                                className={`
                                    group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                    ${activeTool === 'WindowLevel'
                                        ? 'bg-blue-50/50 text-peregrine-accent shadow-inner'
                                        : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                                    }
                                `}
                                title="Window/Level (Click again for presets)"
                            >
                                <div className={`p-2 rounded-lg transition-all duration-300 ${activeTool === 'WindowLevel' ? 'scale-110' : 'group-hover:scale-110'}`}>
                                    <Sun size={18} strokeWidth={activeTool === 'WindowLevel' ? 2.5 : 2} />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#8e8e93]">W/L</span>
                            </button>

                            {/* WW/WL Presets Popover */}
                            {activeTool === 'WindowLevel' && showWLPresets && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200 min-w-[140px] flex flex-col gap-0.5">
                                    <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white/95 rotate-45 border-t border-l border-gray-200" />

                                    <div className="px-2 py-1.5 border-b border-gray-100 mb-1">
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Presets (WW/WL)</span>
                                    </div>

                                    {WWL_PRESETS.map(preset => (
                                        <button
                                            key={preset.name}
                                            onClick={() => {
                                                onPresetSelect?.(preset);
                                                setShowWLPresets(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-600 hover:bg-peregrine-accent hover:text-white rounded-lg transition-all flex justify-between items-baseline group/item"
                                        >
                                            <span className="truncate mr-4">{preset.name}</span>
                                            <span className="text-[8px] opacity-60 group-hover/item:opacity-100 tabular-nums">
                                                {preset.windowWidth}/{preset.windowCenter}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {renderToolButton('Pan', Move, 'Pan')}
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
                        {renderToolButton('Arrow', ArrowUpRight, 'Arrow')}
                        {renderToolButton('Text', Type, 'Text')}

                        {/* Overlay Toggle Button */}
                        <button
                            onClick={onToggleOverlays}
                            className={`
                                group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                ${showOverlays
                                    ? 'bg-blue-50/50 text-peregrine-accent shadow-inner'
                                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                                }
                            `}
                            title="Toggle Overlays (Tab)"
                        >
                            <div className={`p-2 rounded-lg transition-all duration-300 ${showOverlays ? 'scale-110' : 'group-hover:scale-110'}`}>
                                <Type size={18} strokeWidth={showOverlays ? 2.5 : 2} />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest">Info</span>
                        </button>
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
                                    className="appearance-none bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-[9px] font-bold text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent pr-5"
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
                    {/* Phase 4: MPR Tools (Moved to Popover) */}

                    {/* Phase D: 3D Visualization Tools */}
                    {activeView === '3D' && (
                        <div className="flex items-center gap-6 animate-in fade-in slide-in-from-left-8 duration-700 border-l border-gray-200 pl-6 ml-6">
                            <div className="flex gap-2">
                                <button
                                    onClick={onClippingToggle}
                                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 gap-1 ${isClipping ? 'bg-red-50 text-red-500 shadow-inner' : 'text-gray-400 hover:bg-gray-50'}`}
                                    title="VR Volume Clipping"
                                >
                                    <Scissors size={16} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Clip</span>
                                </button>

                                <button
                                    onClick={onAutoRotateToggle}
                                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 gap-1 ${isAutoRotating ? 'bg-indigo-50 text-indigo-500 shadow-inner' : 'text-gray-400 hover:bg-gray-50'}`}
                                    title="Auto-Rotate Volume"
                                >
                                    <RotateCw size={16} className={isAutoRotating ? 'animate-spin' : ''} style={{ animationDuration: '3s' }} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Rotate</span>
                                </button>
                            </div>

                            {isClipping && (
                                <div className="flex flex-col w-32 relative animate-in zoom-in slide-in-from-left-4 duration-300">
                                    <div className="flex justify-between items-end mb-1 px-0.5">
                                        <span className="text-[7px] text-gray-400 uppercase font-black tracking-[0.2em]">Crop</span>
                                        <div className="flex items-baseline gap-0.5">
                                            <span className="text-xs font-black text-red-500 drop-shadow-sm">{clippingRange}</span>
                                            <span className="text-[7px] font-bold text-gray-400">%</span>
                                        </div>
                                    </div>
                                    <div className="relative h-4 flex items-center">
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={clippingRange}
                                            onChange={(e) => onClippingRangeChange?.(parseInt(e.target.value))}
                                            className="w-full h-1 bg-gray-100 rounded-full appearance-none cursor-pointer accent-red-500 hover:h-1.5 transition-all z-10"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
