import { useState, useMemo } from 'react';
import {
    LayoutGrid,
    Layers,
    Move,
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
    AlignJustify,
    Columns,
    PanelRight,
    Send,
    Palette,
    RefreshCw,
    Maximize2,
    List
} from 'lucide-react';
import { useDatabase } from '../Database/DatabaseProvider';
import { CLUT_PRESETS } from './CLUTPresets';
import { GridSelector } from './GridSelector';
import { usePACS } from '../PACS/PACSProvider';

import { ViewMode, ToolMode, ProjectionMode, ToolbarMode, VOI, FusionTransferFunction } from './types';

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

interface Props {
    mode: ToolbarMode;
    activeView: ViewMode;
    onViewChange: (view: ViewMode) => void;
    activeTool: ToolMode;
    onToolChange: (tool: ToolMode) => void;
    onOpenViewer?: () => void;
    onImport?: () => void;
    onOpenSettings?: () => void;
    isCinePlaying?: boolean;
    onCineToggle?: () => void;
    isSynced?: boolean;
    onSyncToggle?: () => void;
    projectionMode?: ProjectionMode;
    onProjectionModeChange?: (mode: ProjectionMode) => void;
    slabThickness?: number;
    onSlabThicknessChange?: (thickness: number) => void;
    currentLUT?: string;
    onLUTChange?: (lut: string) => void;
    selectedSeriesUid?: string | null;
    layout?: { rows: number; cols: number };
    onLayoutChange?: (rows: number, cols: number) => void;
    activeModality?: string | null;
    isClipping?: boolean;
    onClippingToggle?: () => void;
    clippingRange?: number;
    onClippingRangeChange?: (range: number) => void;
    isAutoRotating?: boolean;
    onAutoRotateToggle?: () => void;
    showOverlays?: boolean;
    onToggleOverlays?: () => void;
    onPresetSelect?: (preset: WWLPreset) => void;
    activeViewportOrientation?: 'Axial' | 'Coronal' | 'Sagittal' | 'Acquisition' | 'Default';
    showActivityManager?: boolean;
    onToggleActivityManager?: () => void;
    fusionSeriesUid?: string | null;
    fusionOpacity?: number;
    onFusionOpacityChange?: (opacity: number) => void;
    fusionLUT?: string;
    onFusionLUTChange?: (lut: string) => void;
    fusionVOI?: VOI | null;
    onFusionVOIChange?: (voi: VOI) => void;
    fusionTransferFunction?: FusionTransferFunction;
    onFusionTransferFunctionChange?: (mode: FusionTransferFunction) => void;
    showAnnotationList?: boolean;
    onToggleAnnotationList?: () => void;
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
    isSynced = false,
    onSyncToggle,
    projectionMode = 'NORMAL',
    onProjectionModeChange,
    slabThickness = 0,
    onSlabThicknessChange,
    currentLUT = 'Grayscale',
    onLUTChange,
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
    showActivityManager,
    onToggleActivityManager,
    fusionSeriesUid,
    fusionOpacity = 0.5,
    onFusionOpacityChange,
    fusionLUT = 'Hot Metal',
    onFusionLUTChange,
    fusionVOI,
    onFusionVOIChange,
    fusionTransferFunction = 'Linear',
    onFusionTransferFunctionChange,
    showAnnotationList = false,
    onToggleAnnotationList
}: Props) => {
    const { checkedItems, setShowSendModal } = useDatabase();
    const { activeJobs } = usePACS();
    const selectedCount = useMemo(() => checkedItems.size, [checkedItems]);

    const [showMPRControls, setShowMPRControls] = useState(false);
    const [showWLPresets, setShowWLPresets] = useState(false);
    const [showLUTPresets, setShowLUTPresets] = useState(false);

    const renderViewButton = (mode: ViewMode, Icon: any, label: string) => {
        const isMprOr3D = mode === 'MPR' || mode === '3D';
        const isDisabled = !!(isMprOr3D && activeModality && ['CR', 'DX', 'MG', 'RF', 'XA'].includes(activeModality));
        const isButtonActive = activeView === mode || activeViewportOrientation === mode || (mode === '2D' && activeViewportOrientation === 'Acquisition');

        const handleClick = () => {
            if (isDisabled) return;
            const isSectional = mode === 'Axial' || mode === 'Coronal' || mode === 'Sagittal';

            if (isSectional) {
                if (activeViewportOrientation === mode) {
                    setShowMPRControls(!showMPRControls);
                } else {
                    onViewChange(mode);
                    setShowMPRControls(false);
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
                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45 border-t border-l border-gray-200" />

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
            {mode === 'DATABASE' ? (
                <div className="flex-1 flex items-center pl-8 pr-8 no-drag">
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 border border-[#000000]/10 shadow-inner">
                        {renderViewButton('Database', Database, 'Local DB')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mx-4 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    <div className="flex-1 min-w-[20px] h-full" />

                    <div className="flex items-center gap-6">
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

                        <div className="h-10 w-[1px] bg-[#000000]/10 mx-1" />

                        <button
                            onClick={() => setShowSendModal(true)}
                            disabled={selectedCount === 0}
                            className={`
                                group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1 border shadow-sm
                                ${selectedCount > 0
                                    ? 'bg-white hover:bg-gray-50 text-peregrine-accent border-[#c0c0c0] hover:scale-105 active:scale-95'
                                    : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed opacity-50'}
                            `}
                            title={selectedCount > 0 ? `Send ${selectedCount} selected items to PACS` : 'Select items to send'}
                        >
                            <div className={`p-0.5 ${selectedCount > 0 ? 'animate-pulse' : ''}`}>
                                <Send size={20} strokeWidth={2.5} />
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest">Send</span>
                            {selectedCount > 0 && (
                                <div className="absolute -top-1 -right-1 bg-peregrine-accent text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                    {selectedCount}
                                </div>
                            )}
                        </button>
                    </div>

                    <div className="flex-1 min-w-[20px] h-full" />

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onToggleActivityManager}
                            className={`
                                    group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5 relative
                                    ${showActivityManager
                                    ? 'bg-blue-50/50 text-peregrine-accent shadow-inner'
                                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                                }
                                `}
                            title={`${activeJobs.length} active background tasks`}
                        >
                            <div className={`p-2 rounded-lg transition-all duration-300 ${showActivityManager ? 'scale-110' : 'group-hover:scale-110'}`}>
                                <Activity size={18} strokeWidth={showActivityManager ? 2.5 : 2} className={activeJobs.some(j => j.status === 'active') ? 'animate-pulse' : ''} />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#8e8e93]">Jobs</span>

                            {activeJobs.length > 0 && (
                                <div className="absolute top-2 right-2 min-w-[16px] h-4 px-1 flex items-center justify-center bg-peregrine-accent text-white rounded-full text-[9px] font-black border-2 border-white shadow-sm ring-1 ring-black/5 animate-in zoom-in-50 duration-200">
                                    {activeJobs.length}
                                </div>
                            )}
                        </button>

                        {/* Annotation List Toggle Button (Database Mode) */}
                        <button
                            onClick={onToggleAnnotationList}
                            className={`
                                    group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                    ${showAnnotationList
                                    ? 'bg-blue-50/50 text-peregrine-accent shadow-inner'
                                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                                }
                                `}
                            title="Show ROI / Measurement List"
                        >
                            <div className={`p-2 rounded-lg transition-all duration-300 ${showAnnotationList ? 'scale-110' : 'group-hover:scale-110'}`}>
                                <List size={18} strokeWidth={showAnnotationList ? 2.5 : 2} />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#8e8e93]">List</span>
                        </button>

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
                    <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 mr-6 border border-[#000000]/10 shadow-inner">
                        {renderViewButton('Database', Database, 'Local DB')}
                    </div>

                    <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                    <div className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth flex items-center pr-12 group/scroll relative">
                        <div className="flex items-center">
                            <div className="flex bg-[#000000]/5 p-0.5 rounded-lg gap-0.5 mr-6 border border-[#000000]/10 shadow-inner flex-shrink-0">
                                {onLayoutChange && <GridSelector currentLayout={layout} onChange={onLayoutChange} />}
                                {renderViewButton('2D', Layers, 'Original')}
                                {renderViewButton('Axial', AlignJustify, 'Axial')}
                                {renderViewButton('Coronal', Columns, 'Coronal')}
                                {renderViewButton('Sagittal', PanelRight, 'Sagittal')}
                                {renderViewButton('MPR', LayoutGrid, 'MPR')}

                                <div className="h-10 w-[1.5px] bg-[#000000]/15 mx-2 shadow-[1px_0_0_rgba(255,255,255,0.4)]" />

                                <button
                                    onClick={() => onProjectionModeChange?.(projectionMode === 'MIP' ? 'NORMAL' : 'MIP')}
                                    className={`
                                        group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                        ${projectionMode === 'MIP'
                                            ? 'bg-orange-50/50 text-orange-600 shadow-inner'
                                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}
                                    `}
                                    title="Maximum Intensity Projection"
                                >
                                    <div className="p-2 rounded-lg font-black text-[10px]">MIP</div>
                                    <span className="text-[9px] font-black uppercase tracking-widest">MIP</span>
                                </button>

                                <button
                                    onClick={onAutoRotateToggle}
                                    className={`
                                        group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                        ${isAutoRotating
                                            ? 'bg-purple-50/50 text-purple-600 shadow-inner'
                                            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}
                                    `}
                                    title="Auto Horizontal Rotation"
                                >
                                    <div className={`p-2 rounded-lg transition-all duration-300 ${isAutoRotating ? 'animate-spin-slow' : ''}`}>
                                        <RefreshCw size={18} strokeWidth={isAutoRotating ? 2.5 : 2} />
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-widest">Rotate</span>
                                </button>
                            </div>

                            <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)] flex-shrink-0" />

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
                                            <Maximize2 size={18} strokeWidth={activeTool === 'WindowLevel' ? 2.5 : 2} />
                                        </div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#8e8e93]">W/L</span>
                                    </button>

                                    <div className="relative">
                                        <button
                                            onClick={() => setShowLUTPresets(!showLUTPresets)}
                                            className={`
                                                group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                                ${currentLUT !== 'Grayscale'
                                                    ? 'bg-indigo-50/50 text-indigo-600 shadow-inner'
                                                    : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}
                                            `}
                                            title="Color Maps / LUTs"
                                        >
                                            <div className="p-2 rounded-lg">
                                                <Palette size={18} strokeWidth={currentLUT !== 'Grayscale' ? 2.5 : 2} />
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-[#8e8e93]">Color</span>
                                        </button>

                                        {showLUTPresets && (
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-200 min-w-[140px] flex flex-col gap-0.5">
                                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white/95 rotate-45 border-t border-l border-gray-200" />
                                                <div className="px-2 py-1.5 border-b border-gray-100 mb-1">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Color LUTs</span>
                                                </div>
                                                {['Grayscale', 'Hot Metal', 'PET', 'Rainbow', 'Jet'].map(lut => (
                                                    <button
                                                        key={lut}
                                                        onClick={() => {
                                                            onLUTChange?.(lut);
                                                            setShowLUTPresets(false);
                                                        }}
                                                        className={`
                                                            w-full text-left px-3 py-2 text-[10px] font-bold transition-all rounded-lg flex items-center gap-2
                                                            ${currentLUT === lut ? 'bg-indigo-50 text-indigo-600' : 'text-gray-600 hover:bg-gray-50'}
                                                        `}
                                                    >
                                                        <div className={`w-3 h-3 rounded-full ${lut === 'Grayscale' ? 'bg-gray-400' : 'bg-gradient-to-r from-red-500 via-yellow-400 to-blue-500'}`} />
                                                        {lut}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

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

                            <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)] flex-shrink-0" />

                            <div className="flex gap-1 mr-6 relative">
                                {renderToolButton('Length', Ruler, 'Dist')}
                                {renderToolButton('Angle', Activity, 'Angle')}
                                {renderToolButton('Rectangle', Square, 'Rect')}
                                {renderToolButton('Ellipse', Circle, 'Oval')}
                                {renderToolButton('Probe', Crosshair, 'Probe')}
                                {renderToolButton('Arrow', ArrowUpRight, 'Arrow')}
                                {renderToolButton('Text', Type, 'Text')}

                                <button
                                    onClick={onToggleOverlays}
                                    className={`
                                        group flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5
                                        ${showOverlays ? 'bg-blue-50/50 text-peregrine-accent shadow-inner' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}
                                    `}
                                    title="Toggle Overlays (Tab)"
                                >
                                    <div className={`p-2 rounded-lg transition-all duration-300 ${showOverlays ? 'scale-110' : 'group-hover:scale-110'}`}>
                                        <Type size={18} strokeWidth={showOverlays ? 2.5 : 2} />
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-widest">Info</span>
                                </button>
                            </div>

                            <div className="h-10 w-[1.5px] bg-[#000000]/15 mr-6 shadow-[1px_0_0_rgba(255,255,255,0.4)] flex-shrink-0" />

                            <div className="flex items-center gap-4">
                                {/* Annotation List Toggle Button (Viewer Mode) */}
                                <button
                                    onClick={onToggleAnnotationList}
                                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 gap-1 ${showAnnotationList ? 'bg-blue-50 text-peregrine-accent' : 'text-gray-400 hover:bg-gray-50'}`}
                                    title="Toggle ROI / Annotation List"
                                >
                                    <List size={16} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">List</span>
                                </button>

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
                                            value={currentLUT}
                                            onChange={(e) => onLUTChange?.(e.target.value)}
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
                                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 gap-1 flex-shrink-0 ${isSynced ? 'bg-green-50 text-green-600' : 'text-gray-400 hover:bg-gray-50'}`}
                                    title="Sync Scrolling"
                                >
                                    {isSynced ? <Link size={16} /> : <Unlink size={16} />}
                                    <span className="text-[8px] font-black uppercase tracking-widest">Sync</span>
                                </button>
                            </div>

                            <div className="flex-1 min-w-[20px] h-full" />

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

                            {/* Fusion Controls Section */}
                            {fusionSeriesUid && (
                                <div className="flex items-center gap-6 animate-in fade-in slide-in-from-left-8 duration-700 border-l border-gray-200 pl-6 ml-6">
                                    <div className="flex flex-col gap-1 w-32">
                                        <div className="flex justify-between items-center px-0.5">
                                            <span className="text-[7px] text-gray-400 font-black uppercase tracking-widest">Fusion Opacity</span>
                                            <span className="text-[10px] font-black text-peregrine-accent">{Math.round(fusionOpacity * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={fusionOpacity}
                                            onChange={(e) => onFusionOpacityChange?.(parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-peregrine-accent"
                                        />
                                    </div>

                                    <div className="flex flex-col gap-0.5 w-24">
                                        <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest pl-1">Fusion LUT</span>
                                        <div className="relative group">
                                            <select
                                                value={fusionLUT}
                                                onChange={(e) => onFusionLUTChange?.(e.target.value)}
                                                className="appearance-none bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-[9px] font-bold text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent pr-5"
                                            >
                                                {['Grayscale', 'Hot Metal', 'PET', 'Rainbow', 'Jet', 'Hot'].map(lut => (
                                                    <option key={lut} value={lut}>{lut}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                                        <div className="flex flex-col gap-0.5 w-16">
                                            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest px-1">F-WW</span>
                                            <input
                                                type="number"
                                                value={Math.round(fusionVOI?.windowWidth || 0)}
                                                onChange={(e) => onFusionVOIChange?.({ ...fusionVOI, windowWidth: parseInt(e.target.value) })}
                                                className="bg-white border border-gray-300 rounded px-1 py-0.5 text-[9px] font-bold text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-0.5 w-16">
                                            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest px-1">F-WL</span>
                                            <input
                                                type="number"
                                                value={Math.round(fusionVOI?.windowCenter || 0)}
                                                onChange={(e) => onFusionVOIChange?.({ ...fusionVOI, windowCenter: parseInt(e.target.value) })}
                                                className="bg-white border border-gray-300 rounded px-1 py-0.5 text-[9px] font-bold text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-0.5 w-20">
                                        <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest pl-1">TF Mode</span>
                                        <div className="relative group">
                                            <select
                                                value={fusionTransferFunction}
                                                onChange={(e) => onFusionTransferFunctionChange?.(e.target.value as FusionTransferFunction)}
                                                className="appearance-none bg-white border border-gray-300 rounded-lg px-2 py-0.5 text-[9px] font-bold text-gray-700 w-full focus:outline-none focus:ring-1 focus:ring-peregrine-accent pr-5"
                                            >
                                                <option value="Linear">Linear</option>
                                                <option value="Logarithmic">Log</option>
                                                <option value="Exponential">Exp</option>
                                                <option value="Flat">Flat</option>
                                            </select>
                                            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => onFusionLUTChange?.('Grayscale')}
                                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-all font-black text-[10px]"
                                        title="Reset Fusion Color"
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
