import { useEffect, useRef, useState, useCallback } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    cache,
    metaData,
    volumeLoader,
} from '@cornerstonejs/core';
import { ToolGroupManager } from '@cornerstonejs/tools';
import { useDatabase } from '../../Database/DatabaseProvider';
import { useSettings } from '../../Settings/SettingsContext';
import { prefetchMetadata } from '../electronLoader';
import { CLUT_PRESETS } from '../CLUTPresets';
import { addViewportToSync, triggerInitialSync } from '../SyncManager';

const { ViewportType } = Enums;
const TOOL_GROUP_ID = 'main-tool-group';

// Global cache to persist WW/WL per series across viewport instances
const globalVoiCache = new Map<string, Types.VOIRange>();

interface UseCornerstoneProps {
    viewportId: string;
    renderingEngineId: string;
    seriesUid: string | null;
    initialImageId?: string | null;
    isThumbnail?: boolean;
    activeCLUT?: string;
    autoFit?: boolean;
    orientation?: 'Axial' | 'Coronal' | 'Sagittal' | 'Default';
    initialWindowWidth?: number;
    initialWindowCenter?: number;
    voiOverride?: { windowWidth: number; windowCenter: number } | null;
    onVoiChange?: () => void;
}

export const useCornerstone = ({
    viewportId,
    renderingEngineId,
    seriesUid,
    initialImageId,
    isThumbnail,
    activeCLUT,
    autoFit,
    orientation = 'Default',
    initialWindowWidth,
    initialWindowCenter,
    voiOverride,
    onVoiChange
}: UseCornerstoneProps) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const { db } = useDatabase();
    const { databasePath } = useSettings();
    const [status, setStatus] = useState<string>('');
    const [metadata, setMetadata] = useState<any>({});
    const [isReady, setIsReady] = useState(false);
    const manualVoiRange = useRef<Types.VOIRange | null>(null);

    // Helper to get robust VOI
    const getDisplayVoi = useCallback((viewport: Types.IStackViewport | Types.IVolumeViewport, imageIds: string[]) => {
        const props = viewport.getProperties();
        if (props.voiRange) {
            return {
                windowWidth: props.voiRange.upper - props.voiRange.lower,
                windowCenter: (props.voiRange.upper + props.voiRange.lower) / 2
            };
        }
        const currentId = (viewport as Types.IStackViewport).getCurrentImageId ? (viewport as Types.IStackViewport).getCurrentImageId() : imageIds[0];
        const voi = currentId ? metaData.get('voiLutModule', currentId) : null;
        if (voi && voi.windowCenter != null) {
            return {
                windowWidth: Number(Array.isArray(voi.windowWidth) ? voi.windowWidth[0] : voi.windowWidth),
                windowCenter: Number(Array.isArray(voi.windowCenter) ? voi.windowCenter[0] : voi.windowCenter)
            };
        }
        return { windowWidth: 1, windowCenter: 0.5 };
    }, []);

    const updateMetadata = useCallback(async (viewport: Types.IStackViewport | Types.IVolumeViewport, ids: string[]) => {
        if (!isThumbnail && seriesUid) {
            const subseries = await db?.T_Subseries.findOne(seriesUid).exec();
            const study = subseries ? await db?.T_Study.findOne({ selector: { studyInstanceUID: subseries.studyInstanceUID } }).exec() : null;
            const patient = study ? await db?.T_Patient.findOne({ selector: { id: study.patientId } }).exec() : null;
            const displayVoi = getDisplayVoi(viewport, ids);

            setMetadata({
                patientName: patient ? patient.patientName : 'Anonymous',
                patientID: patient ? patient.patientID : 'Unknown',
                institutionName: study ? study.institutionName : '',
                studyDescription: study ? study.studyDescription : '',
                seriesNumber: subseries ? String(subseries.seriesNumber) : '',
                seriesDescription: subseries ? subseries.seriesDescription : '',
                modality: subseries ? subseries.modality : '',
                instanceNumber: viewport.getCurrentImageIdIndex() + 1,
                totalInstances: ids.length,
                windowWidth: displayVoi.windowWidth,
                windowCenter: displayVoi.windowCenter,
            });
        } else if (isThumbnail) {
            setMetadata((prev: any) => ({
                ...prev,
                instanceNumber: viewport.getCurrentImageIdIndex() + 1,
                totalInstances: ids.length,
            }));
        }
    }, [db, isThumbnail, seriesUid, getDisplayVoi]);


    // Load Images
    useEffect(() => {
        if (!db || !seriesUid) return;

        let resizeObserver: ResizeObserver | null = null;
        let isMounted = true;

        const loadSeries = async () => {
            if (!elementRef.current) return;

            // YIELD: Allow UI to update
            await new Promise(resolve => setTimeout(resolve, 10));
            if (!isMounted) return;

            setIsReady(false);
            setStatus('Loading Series...');

            let ids: string[] = [];
            let images: any[] = [];

            if (isThumbnail && initialImageId) {
                let fullPath = initialImageId;
                if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
                    const sep = databasePath.includes('\\') ? '\\' : '/';
                    fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
                }
                ids.push(`electronfile:${fullPath}`);
            } else {
                images = await db.T_FilePath.find({
                    selector: { seriesInstanceUID: seriesUid },
                    sort: [{ instanceNumber: 'asc' }]
                }).exec();

                if (images.length === 0) {
                    setStatus('No images.');
                    return;
                }

                images.forEach((img: any) => {
                    let fullPath = img.filePath;
                    if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
                        const sep = databasePath.includes('\\') ? '\\' : '/';
                        fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
                    }

                    if (img.numberOfFrames > 1) {
                        for (let i = 0; i < img.numberOfFrames; i++) {
                            ids.push(`electronfile:${fullPath}?frame=${i}`);
                        }
                    } else {
                        ids.push(`electronfile:${fullPath}`);
                    }
                });
            }

            let renderingEngine = getRenderingEngine(renderingEngineId);
            if (!renderingEngine) {
                renderingEngine = new RenderingEngine(renderingEngineId);
            }

            // Pre-fetch metadata
            await prefetchMetadata(ids);

            if (!elementRef.current || !isMounted) return;

            const isVolumeOrientation = !isThumbnail && (orientation === 'Coronal' || orientation === 'Sagittal');

            const viewportInput: Types.PublicViewportInput = {
                viewportId,
                type: isVolumeOrientation ? ViewportType.ORTHOGRAPHIC : ViewportType.STACK,
                element: elementRef.current,
                defaultOptions: { background: [0, 0, 0] },
            };

            renderingEngine.enableElement(viewportInput);
            setIsReady(true);

            const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
            if (!isThumbnail) {
                toolGroup?.addViewport(viewportId, renderingEngineId);
            }

            try {
                let initialIndex = 0;
                if (initialImageId) {
                    const normalizedTarget = initialImageId.replace(/\\/g, '/');
                    const index = ids.findIndex(id => id.replace(/\\/g, '/').includes(normalizedTarget));
                    if (index !== -1) initialIndex = index;
                }

                if (isVolumeOrientation) {
                    const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
                    const volumeId = `volume-${seriesUid}-${viewportId}`;
                    const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: ids });
                    await volume.load();
                    await viewport.setVolumes([{ volumeId }]);
                    const orientationKey = orientation.toUpperCase() as keyof typeof Enums.OrientationAxis;
                    viewport.setOrientation(Enums.OrientationAxis[orientationKey]);
                } else {
                    const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
                    await viewport.setStack(ids, initialIndex);
                }

                const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;

                if (!isThumbnail) {
                    try {
                        addViewportToSync(viewportId, renderingEngineId);
                        triggerInitialSync(renderingEngineId, viewportId);
                    } catch (syncErr) {
                        console.warn('Initial synchronization failed:', syncErr);
                    }
                }

                viewport.resetCamera();
                viewport.render();

                setTimeout(() => {
                    if (!isMounted) return;
                    viewport.resetCamera();

                    // Apply VOI
                    const cachedVoi = seriesUid ? globalVoiCache.get(seriesUid) : null;
                    if (cachedVoi) {
                        viewport.setProperties({ voiRange: cachedVoi });
                        manualVoiRange.current = cachedVoi;
                    } else if (manualVoiRange.current) {
                        viewport.setProperties({ voiRange: manualVoiRange.current });
                    } else {
                        const currentId = ids[initialIndex];
                        const cachedImage = cache.getImage(currentId);
                        if (cachedImage && 'windowCenter' in cachedImage && 'windowWidth' in cachedImage) {
                            // @ts-ignore
                            const wc = cachedImage.windowCenter;
                            // @ts-ignore
                            const ww = cachedImage.windowWidth;
                            if (typeof wc === 'number' && typeof ww === 'number') {
                                viewport.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
                            }
                        } else if (isThumbnail && initialWindowCenter !== undefined && initialWindowWidth !== undefined) {
                            viewport.setProperties({ voiRange: { lower: initialWindowCenter - initialWindowWidth / 2, upper: initialWindowCenter + initialWindowWidth / 2 } });
                        } else if (images[initialIndex]) {
                            const imgDoc = images[initialIndex] as any;
                            const normalize = (val: any) => {
                                if (Array.isArray(val)) return Number(val[0]);
                                if (typeof val === 'string' && val.includes('\\')) return Number(val.split('\\')[0]);
                                return Number(val);
                            };
                            const wc = normalize(imgDoc.windowCenter);
                            const ww = normalize(imgDoc.windowWidth);
                            if (!isNaN(wc) && !isNaN(ww)) {
                                viewport.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
                            }
                        }
                    }
                    viewport.render();
                }, 50);

                setStatus('');
                updateMetadata(viewport, ids);


                resizeObserver = new ResizeObserver(() => {
                    const engine = getRenderingEngine(renderingEngineId);
                    if (engine) {
                        engine.resize();
                        if (autoFit) {
                            const vp = engine.getViewport(viewportId);
                            if (vp) {
                                vp.resetCamera();
                                vp.render();
                            }
                        }
                    }
                });
                resizeObserver.observe(elementRef.current);

            } catch (err) {
                console.error('Load Error:', err);
                if (isMounted) setStatus('Load Failed');
            }
        };

        loadSeries();

        return () => {
            isMounted = false;
            if (resizeObserver) resizeObserver.disconnect();
            const engine = getRenderingEngine(renderingEngineId);
            if (engine && engine.getViewport(viewportId)) {
                engine.disableElement(viewportId);
            }
        };
    }, [db, seriesUid, viewportId, renderingEngineId, isThumbnail, databasePath, orientation, initialImageId, autoFit, updateMetadata, initialWindowCenter, initialWindowWidth]);

    // Handle CLUT Changes
    useEffect(() => {
        if (!isReady) return;
        const engine = getRenderingEngine(renderingEngineId);
        if (!engine) return;

        const viewport = engine.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
        if (!viewport) return;

        const preset = CLUT_PRESETS.find(p => p.name === activeCLUT);
        if (preset) {
            viewport.setProperties({
                voiRange: {
                    lower: preset.windowCenter - preset.windowWidth / 2,
                    upper: preset.windowCenter + preset.windowWidth / 2,
                }
            });
            viewport.render();
        }
    }, [activeCLUT, viewportId, renderingEngineId, isReady]);

    // Handle VOI Override
    useEffect(() => {
        if (!isReady || !voiOverride || isThumbnail) return;

        const engine = getRenderingEngine(renderingEngineId);
        const viewport = engine?.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
        if (viewport) {
            const voiRange = {
                lower: voiOverride.windowCenter - voiOverride.windowWidth / 2,
                upper: voiOverride.windowCenter + voiOverride.windowWidth / 2,
            };
            viewport.setProperties({ voiRange });
            viewport.render();

            if (seriesUid) {
                globalVoiCache.set(seriesUid, voiRange);
                manualVoiRange.current = voiRange;
                onVoiChange?.();
            }
        }
    }, [voiOverride, isReady, isThumbnail, renderingEngineId, viewportId, seriesUid, onVoiChange]);

    // Event Listeners for metadata updates & sticky VOI
    useEffect(() => {
        if (!isReady || isThumbnail) return;

        const enforceStickyVoi = () => {
            if (!seriesUid) return;
            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId) as Types.IStackViewport;
            if (!viewport) return;

            const targetVoi = manualVoiRange.current || globalVoiCache.get(seriesUid);
            if (!targetVoi) return;

            const currentVoi = viewport.getProperties().voiRange;
            if (!currentVoi) return;

            const diff = Math.abs(currentVoi.lower - targetVoi.lower) + Math.abs(currentVoi.upper - targetVoi.upper);
            if (diff > 0.5) {

                viewport.setProperties({ voiRange: targetVoi });
                viewport.render();
            }
        };

        const handleImageChange = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            enforceStickyVoi();

            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
            if (!viewport) return;

            // Simple metadata update for window/level
            const displayVoi = getDisplayVoi(viewport, []); // ids not needed for WL
            setMetadata((prev: any) => ({
                ...prev,
                instanceNumber: (viewport as Types.IStackViewport).getCurrentImageIdIndex() + 1,
                windowWidth: displayVoi.windowWidth,
                windowCenter: displayVoi.windowCenter,
            }));
        };

        const handleVoiModified = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId) as Types.IStackViewport;
            if (!viewport) return;

            const props = viewport.getProperties();
            if (props.voiRange && seriesUid) {
                const newVoi = { ...props.voiRange };
                manualVoiRange.current = newVoi;
                globalVoiCache.set(seriesUid, newVoi);
            }

            handleImageChange(evt);
        };

        const handleCameraModified = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            enforceStickyVoi();
        };

        const element = elementRef.current;
        element?.addEventListener(Enums.Events.STACK_NEW_IMAGE, handleImageChange);
        element?.addEventListener(Enums.Events.VOI_MODIFIED, handleVoiModified);
        element?.addEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);

        return () => {
            element?.removeEventListener(Enums.Events.STACK_NEW_IMAGE, handleImageChange);
            element?.removeEventListener(Enums.Events.VOI_MODIFIED, handleVoiModified);
            element?.removeEventListener(Enums.Events.CAMERA_MODIFIED, handleCameraModified);
        };

    }, [viewportId, renderingEngineId, isThumbnail, isReady, seriesUid, getDisplayVoi]);

    return {
        elementRef,
        isReady,
        metadata,
        status,
        setMetadata
    };
};
