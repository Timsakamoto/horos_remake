import { useState, useMemo } from 'react';
import {
    LayoutGrid, Layers, Move, Ruler, Database, Play, Square, Settings,
    Activity, Maximize, Link, Unlink,
    Type, AlignJustify, Columns, PanelRight, Send,
    RefreshCw, Maximize2, Search, Zap
} from 'lucide-react';
import { useDatabase } from '../Database/DatabaseProvider';
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
    onToggleAnnotationList?: () => void;
    showAnnotationList?: boolean;
    onDetachViewer?: () => void;
    fusionSeriesUid?: string | null;
    fusionOpacity?: number;
    onFusionOpacityChange?: (opacity: number) => void;
    fusionLUT?: string;
    onFusionLUTChange?: (lut: string) => void;
    fusionVOI?: VOI | null;
    onFusionVOIChange?: (voi: VOI | null) => void;
    fusionTransferFunction?: FusionTransferFunction;
    onFusionTransferFunctionChange?: (mode: FusionTransferFunction) => void;
}

export const Toolbar = ({
    mode, activeView, onViewChange, activeTool, onToolChange, onOpenViewer, onImport, onOpenSettings,
    isCinePlaying = false, onCineToggle, isSynced = false, onSyncToggle,
    projectionMode = 'NORMAL', onProjectionModeChange, slabThickness = 0, onSlabThicknessChange,
    layout = { rows: 1, cols: 1 }, onLayoutChange,
    activeModality,
    isAutoRotating = false, onAutoRotateToggle, showOverlays = true, onToggleOverlays,
    activeViewportOrientation, showActivityManager, onToggleActivityManager,
}: Props) => {
    const { checkedItems, setShowSendModal } = useDatabase();
    const { activeJobs } = usePACS();
    const selectedCount = useMemo(() => checkedItems.size, [checkedItems]);
    const [showMPRControls, setShowMPRControls] = useState(false);

    const renderViewButton = (vMode: ViewMode, Icon: any, label: string) => {
        const isMprOr3D = vMode === 'MPR' || vMode === '3D';
        const isDisabled = !!(isMprOr3D && activeModality && ['CR', 'DX', 'MG', 'RF', 'XA'].includes(activeModality));
        const isButtonActive = activeView === vMode || activeViewportOrientation === vMode || (vMode === '2D' && activeViewportOrientation === 'Acquisition');

        return (
            <button
                key={vMode}
                onClick={() => {
                    if (isDisabled) return;

                    const matchesMode = activeView === vMode;
                    const matchesOrientation = activeView === '2D' && activeViewportOrientation === vMode;

                    if (['Axial', 'Coronal', 'Sagittal', 'MPR'].includes(vMode) && (matchesMode || matchesOrientation)) {
                        setShowMPRControls(!showMPRControls);
                    } else {
                        onViewChange(vMode);
                        setShowMPRControls(false);
                    }
                }}
                disabled={isDisabled}
                className={`flex-shrink-0 relative flex flex-col items-center justify-center min-w-[56px] h-14 rounded-xl transition-all duration-300 gap-1 ${isButtonActive ? 'bg-white text-peregrine-accent shadow-sm' : isDisabled ? 'opacity-20 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600'}`}
            >
                <Icon size={18} strokeWidth={isButtonActive ? 2.5 : 2} />
                <span className="text-[9px] font-black uppercase tracking-tighter leading-none">{label}</span>
                {isButtonActive && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-peregrine-accent" />}
            </button>
        );
    };

    const renderToolButton = (tool: ToolMode, Icon: any, label: string) => (
        <button
            key={tool}
            onClick={() => onToolChange(tool)}
            className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-300 gap-1.5 ${activeTool === tool ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <Icon size={18} strokeWidth={activeTool === tool ? 2.5 : 2} />
            <span className="text-[9px] font-black uppercase tracking-widest leading-none">{label}</span>
        </button>
    );

    return (
        <div
            onDoubleClick={() => (window as any).electron?.toggleMaximize()}
            className="h-[110px] bg-gradient-to-b from-[#e8e8e8] to-[#c2c2c2] border-b border-[#a0a0a0] flex flex-col select-none z-40 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] drag"
        >
            <div className="h-[38px] w-full shrink-0" />
            <div className="h-[64px] flex items-center w-full px-[var(--space-xl)] no-drag relative">
                {mode === 'DATABASE' ? (
                    <div className="flex items-center w-full h-full relative">
                        {/* LEFT: Local DB & Import */}
                        <div className="flex items-center gap-[var(--space-md)] shrink-0">
                            <div className="flex bg-black/5 p-0.5 rounded-lg gap-0.5 border border-black/10 shadow-inner shrink-0 leading-none">
                                {renderViewButton('Database', Database, 'Local DB')}
                            </div>
                            <button onClick={onImport} className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-white border border-gray-300 shadow-sm transition-all hover:scale-105 active:scale-95 text-gray-600 gap-1">
                                <Layers size={20} className="text-peregrine-accent" strokeWidth={2.5} />
                                <span className="text-[9px] font-black uppercase">Import</span>
                            </button>
                        </div>

                        {/* CENTER: View (Center of the entire toolbar) */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <button
                                onClick={onOpenViewer}
                                className="pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-b from-peregrine-accent to-[#005bb7] text-white shadow-md transition-all hover:scale-105 active:scale-95 gap-1"
                            >
                                <Layers size={20} strokeWidth={2.5} />
                                <span className="text-[9px] font-black uppercase">View</span>
                            </button>
                        </div>

                        {/* RIGHT: Send, Jobs, Config */}
                        <div className="flex items-center gap-[var(--space-md)] shrink-0 ml-auto">
                            <button
                                onClick={() => setShowSendModal(true)}
                                disabled={selectedCount === 0}
                                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border transition-all gap-1 relative ${selectedCount > 0 ? 'bg-white border-gray-300 text-peregrine-accent hover:scale-105 shadow-sm' : 'bg-gray-100 text-gray-300 border-gray-200 opacity-50'}`}
                                title="Send to PACS"
                            >
                                <Send size={20} strokeWidth={2.5} />
                                <span className="text-[9px] font-black uppercase">Send</span>
                                {selectedCount > 0 && (
                                    <div className="absolute -top-1 -right-1 bg-peregrine-accent text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-md animate-in zoom-in duration-200">
                                        {selectedCount}
                                    </div>
                                )}
                            </button>
                            <button
                                onClick={onToggleActivityManager}
                                className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all relative ${showActivityManager ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}
                                title="Recent Jobs & Activity"
                            >
                                <Activity size={18} className={activeJobs.some(j => j.status === 'active') ? 'animate-pulse' : ''} />
                                <span className="text-[9px] font-black uppercase">Jobs</span>
                                {activeJobs.length > 0 && (
                                    <div className="absolute top-1 right-1 bg-peregrine-accent text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                                        {activeJobs.length}
                                    </div>
                                )}
                            </button>
                            <button
                                onClick={onOpenSettings}
                                className="flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all text-gray-400 hover:text-gray-600"
                                title="Preferences & Configuration"
                            >
                                <Settings size={18} />
                                <span className="text-[9px] font-black uppercase">Config</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center min-w-max h-full">
                        <div className="flex bg-black/5 p-0.5 rounded-lg gap-0.5 border border-black/10 shadow-inner shrink-0 mr-6">
                            {renderViewButton('Database', Database, 'Local DB')}
                        </div>
                        <div className="h-10 w-[1.5px] bg-black/15 mr-6 shrink-0" />
                        <div className="flex items-center shrink-0">
                            {onLayoutChange && <GridSelector currentLayout={layout} onChange={(r, c) => onLayoutChange(r, c)} />}
                            {renderViewButton('2D', Layers, 'Original')}
                            {renderViewButton('Axial', AlignJustify, 'Axial')}
                            {renderViewButton('Coronal', Columns, 'Coronal')}
                            {renderViewButton('Sagittal', PanelRight, 'Sagittal')}
                            {renderViewButton('MPR', LayoutGrid, 'MPR')}
                            {renderViewButton('3D', Maximize2, '3D')}
                        </div>
                        <div className="h-10 w-[1.5px] bg-black/15 mx-6 shrink-0" />
                        <div className="flex gap-0.5 shrink-0">
                            {renderToolButton('WindowLevel', Zap, 'W/L')}
                            {renderToolButton('Pan', Move, 'Pan')}
                            {renderToolButton('Zoom', Search, 'Zoom')}
                            {renderToolButton('Length', Ruler, 'Dist')}
                            {renderToolButton('Magnify', Maximize, 'Mag')}
                            <button onClick={onToggleOverlays} className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${showOverlays ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}>
                                <Type size={18} />
                                <span className="text-[9px] font-black uppercase">Info</span>
                            </button>
                        </div>
                        <div className="h-10 w-[1.5px] bg-black/15 mx-6 shrink-0" />
                        <div className="flex gap-2 shrink-0">
                            <button onClick={onAutoRotateToggle} className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${isAutoRotating ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}>
                                <RefreshCw size={18} className={isAutoRotating ? 'animate-spin-slow' : ''} />
                                <span className="text-[9px] font-black uppercase">Rotate</span>
                            </button>
                            <button onClick={onCineToggle} className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${isCinePlaying ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}>
                                {isCinePlaying ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                                <span className="text-[9px] font-black uppercase">Cine</span>
                            </button>
                            <button onClick={onSyncToggle} className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${isSynced ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}>
                                {isSynced ? <Link size={16} /> : <Unlink size={16} />}
                                <span className="text-[9px] font-black uppercase">Sync</span>
                            </button>
                        </div>
                        <div className="h-10 w-[1.5px] bg-black/15 mx-6 shrink-0" />
                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <button onClick={onToggleActivityManager} className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all relative ${showActivityManager ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}>
                                <Activity size={18} className={activeJobs.some(j => j.status === 'active') ? 'animate-pulse' : ''} />
                                <span className="text-[9px] font-black uppercase">Jobs</span>
                                {activeJobs.length > 0 && <div className="absolute top-1 right-1 bg-peregrine-accent text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">{activeJobs.length}</div>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {/* MPR Controls Overlay */}
            {showMPRControls && (
                <div className="absolute top-[100px] left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-gray-200 shadow-2xl rounded-2xl p-4 z-[100] animate-in slide-in-from-top-2 duration-300 w-[300px]">
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center px-1">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Projection Mode</span>
                            <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                {(['NORMAL', 'MIP', 'MINIP'] as ProjectionMode[]).map(m => (
                                    <button key={m} onClick={() => onProjectionModeChange?.(m)} className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${projectionMode === m ? 'bg-white text-peregrine-accent shadow-sm' : 'text-gray-400'}`}>{m}</button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between px-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Slab Thickness</span>
                                <span className="text-[11px] font-black text-peregrine-accent leading-none">{slabThickness} mm</span>
                            </div>
                            <input type="range" min="0" max="20" step="1" value={slabThickness} onChange={(e) => onSlabThicknessChange?.(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-peregrine-accent" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
