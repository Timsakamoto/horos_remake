import React, { useEffect, useState, useCallback } from 'react';
import {
    X,
    Trash2,
    Target,
    Type,
    ChevronRight,
    Ruler,
    Circle,
    Square,
    ArrowUpRight,
    Type as TypeIcon,
    Hash
} from 'lucide-react';
import { annotation } from '@cornerstonejs/tools';
import { getRenderingEngine } from '@cornerstonejs/core';
import { useViewer } from './ViewerContext';
import { RENDERING_ENGINE_ID } from './types';

interface AnnotationItem {
    id: string;
    toolName: string;
    label: string;
    value: string;
    unit: string;
    seriesInstanceUID: string;
    sliceIndex: number;
    viewportId: string;
}

export const AnnotationList: React.FC = () => {
    const { setShowAnnotationList, viewports, activeViewportIndex } = useViewer();
    const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);

    const refreshAnnotations = useCallback(() => {
        annotation.state.getAnnotationManager();
        const allAnnotations: AnnotationItem[] = [];

        // Cornerstone doesn't provide a direct "get all" easily for the manager, 
        // we usually iterate through frameOfReference or use state.getAnnotations
        // For simplicity in this implementation, we rely on the active viewport's tool group
        // and its specific tool names.
        const toolNames = ['Length', 'EllipticalROI', 'RectangleROI', 'ArrowAnnotate', 'Probe', 'Angle', 'Bidirectional'];

        toolNames.forEach(toolName => {
            const annotationsForTool = (annotation.state as any).getAnnotations(toolName);
            if (annotationsForTool) {
                annotationsForTool.forEach((ann: any) => {
                    // Extract display value logic
                    let value = '';
                    let unit = '';

                    if (ann.cachedStats) {
                        const stats = ann.cachedStats;
                        if (stats.length) { value = stats.length.toFixed(2); unit = 'mm'; }
                        else if (stats.area) { value = stats.area.toFixed(2); unit = 'mm²'; }
                        else if (stats.index !== undefined) { value = stats.index.toString(); unit = 'idx'; }
                        else if (stats.angle) { value = stats.angle.toFixed(1); unit = '°'; }
                    }

                    allAnnotations.push({
                        id: ann.annotationUID,
                        toolName: toolName,
                        label: ann.data?.text || toolName,
                        value: value || '-',
                        unit: unit,
                        seriesInstanceUID: ann.metadata.SeriesInstanceUID,
                        sliceIndex: ann.metadata.sliceIndex ?? 0,
                        viewportId: ann.metadata.viewportId || ''
                    });
                });
            }
        });

        setAnnotations(allAnnotations);
    }, []);

    useEffect(() => {
        refreshAnnotations();

        // Listen for changes
        const handleAnnotationChange = () => refreshAnnotations();

        // This is a bit of a hack as Cornerstone doesn't have a single "state changed" event for all tools
        // but we can listen to general mouse up on the viewport as a proxy, or specific events
        window.addEventListener('mouseup', handleAnnotationChange);

        return () => {
            window.removeEventListener('mouseup', handleAnnotationChange);
        };
    }, [refreshAnnotations]);

    const jumpToAnnotation = (ann: AnnotationItem) => {
        const engine = getRenderingEngine(RENDERING_ENGINE_ID);
        if (!engine) return;

        // Find the best viewport to jump in (prioritize active or matching sequence)
        const viewportId = viewports[activeViewportIndex]?.id || ann.viewportId;
        const viewport = engine.getViewport(viewportId);

        if (viewport && 'setSliceIndex' in viewport) {
            (viewport as any).setSliceIndex(ann.sliceIndex);
            viewport.render();
        }
    };

    const deleteAnnotation = (id: string) => {
        annotation.state.removeAnnotation(id);
        refreshAnnotations();
    };

    const getToolIcon = (name: string) => {
        switch (name) {
            case 'Length': return <Ruler size={14} />;
            case 'EllipticalROI': return <Circle size={14} />;
            case 'RectangleROI': return <Square size={14} />;
            case 'ArrowAnnotate': return <ArrowUpRight size={14} />;
            case 'Probe': return <Target size={14} />;
            case 'Angle': return <ChevronRight className="rotate-45" size={14} />;
            default: return <Hash size={14} />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#1c1c1e] text-white border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                    <TypeIcon size={16} className="text-peregrine-accent" />
                    <h2 className="text-xs font-black uppercase tracking-widest">ROI / Annotations</h2>
                </div>
                <button
                    onClick={() => setShowAnnotationList(false)}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {annotations.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 gap-2">
                        <Type size={32} />
                        <span className="text-[10px] font-bold uppercase tracking-tighter">No Measurements</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {annotations.map((ann) => (
                            <div
                                key={ann.id}
                                className="group bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-3 transition-all cursor-pointer overflow-hidden relative"
                                onClick={() => jumpToAnnotation(ann)}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-peregrine-accent/20 text-peregrine-accent rounded">
                                            {getToolIcon(ann.toolName)}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-tight leading-none mb-0.5">{ann.label}</span>
                                            <span className="text-[8px] text-white/40 font-bold uppercase">Slice {ann.sliceIndex + 1}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteAnnotation(ann.id);
                                        }}
                                        className="p-1.5 text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>

                                <div className="flex items-baseline gap-1">
                                    <span className="text-lg font-black text-peregrine-accent tabular-nums">{ann.value}</span>
                                    <span className="text-[9px] font-bold text-white/30 uppercase">{ann.unit}</span>
                                </div>

                                {/* Selection indicator (if we had active state) */}
                                <div className="absolute right-2 bottom-2 text-[8px] font-black text-white/10 uppercase italic">
                                    {ann.toolName}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-4 border-t border-white/5 bg-white/5 text-[9px] font-bold text-white/40 uppercase tracking-widest text-center">
                {annotations.length} items found
            </div>
        </div>
    );
};
