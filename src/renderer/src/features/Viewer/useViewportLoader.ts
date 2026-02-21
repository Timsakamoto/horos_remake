import { useState, useEffect, useRef, useCallback } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    getRenderingEngine,
    cache,
    metaData,
    volumeLoader,
    imageLoader,
} from '@cornerstonejs/core';
import { useDatabase } from '../Database/DatabaseProvider';
import { useSettings } from '../Settings/SettingsContext';
import { prefetchMetadata } from './electronLoader';
import { useBackgroundCache } from './useBackgroundCache';
import { ViewportOrientation, ViewportMetadata, INITIAL_METADATA, VOI } from './types';


interface UseViewportLoaderProps {
    viewportId: string;
    renderingEngineId: string;
    element: HTMLDivElement | null;
    seriesUid: string | null;
    fusionSeriesUid?: string | null;
    isThumbnail?: boolean;
    orientation?: ViewportOrientation;
    initialImageId?: string | null;
    voiOverride?: VOI | null;
    onVoiChange?: () => void;
    activeLUT?: string;
    fusionOpacity?: number;
    fusionLUT?: string;
    fusionVOI?: VOI | null;
    fusionTransferFunction?: string;
    projectionMode?: string;
    autoFit?: boolean;
    initialWindowWidth?: number;
    initialWindowCenter?: number;
}

export const useViewportLoader = ({
    viewportId,
    renderingEngineId,
    element,
    seriesUid,
    fusionSeriesUid,
    isThumbnail = false,
    orientation = 'Default',
    initialImageId = null,
    voiOverride,
    onVoiChange,
    activeLUT,
    fusionOpacity = 0.5,
    fusionLUT = 'Hot Metal',
    fusionVOI,
    fusionTransferFunction = 'Linear',
    projectionMode,
    autoFit,
    initialWindowWidth,
    initialWindowCenter
}: UseViewportLoaderProps) => {
    const { prefetchStudyThumbnails } = useDatabase();
    const { databasePath } = useSettings();

    const [isReady, setIsReady] = useState(false);
    const [isComposed, setIsComposed] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [volumeProgress, setVolumeProgress] = useState(0);
    const [metadata, setMetadata] = useState<ViewportMetadata>(INITIAL_METADATA);

    const mountedRef = useRef(true);
    const lastSeriesUidRef = useRef<string | null>(null);
    const lastOrientationRef = useRef<ViewportOrientation | null>(null);
    const hasValidDimensionsRef = useRef(false);
    const lastResizeTimeRef = useRef(0);
    const lastUpdateTimeRef = useRef(0);
    const [imageIds, setImageIds] = useState<string[]>([]);
    const [initialImgIdx, setInitialImgIdx] = useState(0);
    const THROTTLE_MS = 32; // ~30fps - prevents react render flood

    const loadSeries = useCallback(async () => {
        if (!seriesUid || !element || !mountedRef.current) {
            // Further silence deferred logs for thumbnails/previews
            if (seriesUid && !element && !isThumbnail && viewportId.startsWith('viewport-')) {
                console.debug(`[useViewportLoader] ${viewportId}: Load deferred - element is null`);
            }
            return;
        }

        // Avoid loading if viewport is too small (Cornerstone requirements)
        // Adjust threshold to 10px to avoid race conditions with 1x1 initial sizes
        if (element.clientWidth < 10 || element.clientHeight < 10) {
            if (!isThumbnail) {
                console.log(`[useViewportLoader] ${viewportId}: Load deferred - viewport too small (${element.clientWidth}x${element.clientHeight})`);
            }
            return;
        }

        console.log(`[useViewportLoader] ${viewportId}: loadSeries start`, { seriesUid, isThumbnail, width: element.clientWidth });

        const isVolumeOrientation = !isThumbnail && (orientation === 'Coronal' || orientation === 'Sagittal' || orientation === 'Axial' || orientation === 'Acquisition');

        let ids: string[] = [];
        let hasMultiFrame = false;
        let images: any[] = [];


        // Fast Switch Optimization (Volume)
        if (isVolumeOrientation && seriesUid === lastSeriesUidRef.current && isReady) {
            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId);

            // Explicitly check if it's already a Volume viewport
            if (viewport?.type === Enums.ViewportType.ORTHOGRAPHIC && (viewport as Types.IVolumeViewport).setOrientation) {
                const vp = viewport as Types.IVolumeViewport;
                // If Acquisition, default to AXIAL (most common setup)
                const targetOrientation = orientation === 'Acquisition' ? 'AXIAL' : orientation.toUpperCase();
                const orientationKey = targetOrientation as keyof typeof Enums.OrientationAxis;
                vp.setOrientation(Enums.OrientationAxis[orientationKey]);
                vp.render();

                const nSlices = vp.getNumberOfSlices();
                setMetadata(prev => ({ ...prev, totalInstances: nSlices, instanceNumber: Math.floor(nSlices / 2) + 1 }));

                const midIndex = Math.floor(nSlices / 2);
                if ((vp as any).setSliceIndex) (vp as any).setSliceIndex(midIndex);

                setIsComposed(true);
                lastOrientationRef.current = orientation;
                return;
            }
        }

        // Fast Switch Optimization (Stack/2D) - skip reload if same series & element & ALREADY STACK
        if (!isVolumeOrientation && seriesUid === lastSeriesUidRef.current && isReady) {
            const engine = getRenderingEngine(renderingEngineId);
            const viewport = engine?.getViewport(viewportId);

            if (viewport?.type === Enums.ViewportType.STACK) {
                console.log(`[useViewportLoader] ${viewportId}: Fast switch/Skip reload for stable stack`);
                setIsComposed(true);
                return;
            }
        }

        // Full Reload Logic
        setIsReady(false);
        setVolumeProgress(0);
        setStatus('Loading Series...');

        lastSeriesUidRef.current = seriesUid;
        lastOrientationRef.current = orientation;

        try {
            // Re-using ids, hasMultiFrame, images declared above
            if (isThumbnail && initialImageId) {
                console.log(`[useViewportLoader] Loading THUMBNAIL for ${seriesUid}: ${initialImageId}`);
                // For thumbnails, prefix and use initialImageId immediately
                ids = [`electronfile://${initialImageId.replace('electronfile://', '').replace('electronfile:', '')}`];
            } else {
                images = await (window as any).electron.db.query(
                    `SELECT i.* FROM instances i 
                     JOIN series s ON i.seriesId = s.id 
                     WHERE s.seriesInstanceUID = ? 
                     ORDER BY i.instanceNumber ASC`,
                    [seriesUid]
                );

                images.forEach((img: any) => {
                    let fullPath = img.filePath;
                    if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
                        const sep = databasePath.includes('\\') ? '\\' : '/';
                        fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
                    }

                    if (img.numberOfFrames > 1) {
                        hasMultiFrame = true;
                        // Use a consistent SOP-based ID for framing
                        for (let f = 0; f < img.numberOfFrames; f++) {
                            ids.push(`electronfile://${fullPath}?seriesUid=${seriesUid}&frame=${f}`);
                        }
                    } else {
                        ids.push(`electronfile://${fullPath}?seriesUid=${seriesUid}`);
                    }
                });
            }

            if (ids.length === 0) {
                setStatus('No images.');
                return;
            }

            // Compute isVolumeView AFTER we know hasMultiFrame (from DB query above)
            const isVolumeView = isVolumeOrientation && !hasMultiFrame;

            let renderingEngine = getRenderingEngine(renderingEngineId);
            if (!renderingEngine) renderingEngine = new RenderingEngine(renderingEngineId);

            const existingViewport = renderingEngine.getViewport(viewportId);
            const isTypeMatch = isVolumeView ? existingViewport?.type === Enums.ViewportType.ORTHOGRAPHIC : existingViewport?.type === Enums.ViewportType.STACK;

            // Only disable and re-enable if element changed or type mismatch
            if (existingViewport && (!isTypeMatch || existingViewport.element !== element)) {
                try { renderingEngine.disableElement(viewportId); } catch (e) { }
            }

            if (isThumbnail) {
                console.log(`[useViewportLoader] ${viewportId}: Loading thumbnail for ${seriesUid}`);
            }
            if (element.clientWidth === 0 || element.clientHeight === 0) {
                console.warn(`[useViewportLoader] Viewport element for ${viewportId} has 0 dimensions, scheduling retry in 100ms...`);
                hasValidDimensionsRef.current = false;
                setTimeout(loadSeries, 100);
                return;
            }
            hasValidDimensionsRef.current = true;

            if (!mountedRef.current || !element) return;

            const viewportInput: Types.PublicViewportInput = {
                viewportId,
                type: isVolumeView ? Enums.ViewportType.ORTHOGRAPHIC : Enums.ViewportType.STACK,
                element,
                defaultOptions: { background: [0, 0, 0] },
            };

            if (!renderingEngine.getViewport(viewportId)) {
                try {
                    renderingEngine.enableElement(viewportInput);
                    console.log(`[useViewportLoader] ${viewportId}: Element enabled successfully. Target=${element.clientWidth}x${element.clientHeight}`);
                } catch (err: any) {
                    console.error(`[useViewportLoader] ${viewportId}: CRITICAL - enableElement failed:`, err);
                    setStatus('Engine Error');
                    return;
                }
            }
            renderingEngine.resize();
            // CRITICAL: Re-render ALL viewports after global resize to prevent blanking
            renderingEngine.render();

            // OPTIMIZATION: Prefetch metadata in parallel for 2D, but AWAIT for 3D/Volume
            const prefetchPromise = prefetchMetadata(ids);
            if (isVolumeView) {
                await prefetchPromise;
            }

            // Metadata Sorting (Skip for thumbnails and handle multi-frame stability)
            if (!isThumbnail && ids.length > 1) {
                // Determine if we should sort. For single-file multi-frame Cine, we MUST NOT sort by space.
                const isSingleFileMultiFrame = hasMultiFrame && images.length === 1;

                if (!isSingleFileMultiFrame) {
                    // Head-First Sorting with Instance Tie-breaker
                    ids.sort((a, b) => {
                        const lpA = metaData.get('imagePlaneModule', a)?.sliceLocation ?? 0;
                        const lpB = metaData.get('imagePlaneModule', b)?.sliceLocation ?? 0;
                        const diff = lpB - lpA;

                        if (Math.abs(diff) > 0.001) return diff;

                        // Fallback to frame/instance order to keep temporal sequences stable
                        const getFrame = (id: string) => parseInt(new URLSearchParams(id.split('?')[1] || '').get('frame') || '0');
                        return getFrame(a) - getFrame(b);
                    });
                }
            }

            // ROBUSTNESS: For Volume view, ensure at least one slice metadata is valid to prevent NaN in shaders
            if (isVolumeView && ids.length > 0) {
                const testMeta = metaData.get('imagePlaneModule', ids[0]);
                if (!testMeta || !testMeta.imageOrientationPatient || !testMeta.imagePositionPatient) {
                    console.warn(`[useViewportLoader] ${viewportId}: Volume metadata incomplete, waiting 100ms...`);
                    setTimeout(loadSeries, 100);
                    return;
                }
            }

            setIsReady(true);
            let initialIndex = 0;
            if (initialImageId) {
                const normalizedTarget = initialImageId.replace(/\\/g, '/');
                const idx = ids.findIndex(id => id.replace(/\\/g, '/').includes(normalizedTarget));
                if (idx !== -1) initialIndex = idx;
            }

            if (isVolumeView) {
                const viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;
                const volumeId = `cornerstoneStreamingImageVolume:volume-${seriesUid}`;

                const existingVolume = cache.getVolume(volumeId);
                if (existingVolume && existingVolume.loadStatus?.loaded) {
                    setVolumeProgress(100);
                } else {
                    const CHUNK_SIZE = 10;
                    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                        if (!mountedRef.current) return;
                        const chunk = ids.slice(i, i + CHUNK_SIZE);
                        await Promise.all(chunk.map(id => imageLoader.loadAndCacheImage(id)));
                        setVolumeProgress(Math.min(99, Math.round(((i + chunk.length) / ids.length) * 100)));
                        await new Promise(r => setTimeout(r, 0));
                    }
                }

                const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: ids });
                await volume.load();

                let volumeInputs: Types.IVolumeInput[] = [{ volumeId }];

                // --- ★ Fusion Integration ★ ---
                const fusionActorId = fusionSeriesUid ? `volume-${fusionSeriesUid}` : null;
                if (fusionSeriesUid) {
                    const fusionVolumeId = `cornerstoneStreamingImageVolume:volume-${fusionSeriesUid}`;

                    // Load fusion images
                    const fusionImages = await (window as any).electron.db.query(
                        'SELECT * FROM instances WHERE seriesId = (SELECT id FROM series WHERE seriesInstanceUID = ?) ORDER BY instanceNumber ASC',
                        [fusionSeriesUid]
                    );

                    const fusionIds = fusionImages.map((img: any) => {
                        let fullPath = img.filePath;
                        if (fullPath && !(fullPath.startsWith('/') || /^[a-zA-Z]:/.test(fullPath)) && databasePath) {
                            const sep = databasePath.includes('\\') ? '\\' : '/';
                            fullPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${fullPath.replace(/^[\\/]/, '')}`;
                        }
                        return `electronfile://${fullPath}`;
                    });

                    if (fusionSeriesUid) {
                        prefetchStudyThumbnails(fusionSeriesUid as string);
                    }

                    if (fusionIds.length > 0) {
                        await prefetchMetadata(fusionIds);
                        // We need to ensure the fusion volume is created and loaded
                        let fusionVolume = cache.getVolume(fusionVolumeId) as any;
                        if (!fusionVolume) {
                            fusionVolume = await volumeLoader.createAndCacheVolume(fusionVolumeId, { imageIds: fusionIds });
                        }
                        await (fusionVolume as any).load();

                        volumeInputs.push({
                            volumeId: fusionVolumeId,
                            blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND
                        });

                        // --- ★ Initial Fusion Properties ★ ---
                        // Use provided LUT or default to 'Hot Metal' for visual distinction
                        const colormapMap: Record<string, string> = {
                            'Grayscale': '',
                            'Hot Metal': 'hotiron',
                            'PET': 'pet',
                            'Rainbow': 'rainbow',
                            'Jet': 'jet',
                            'Hot': 'hot'
                        };
                        const colormapId = colormapMap[fusionLUT || 'Hot Metal'] || 'hotiron';
                        if (colormapId) {
                            viewport.setProperties({ colormap: { name: colormapId } }, fusionActorId as string);
                        }

                        // Apply VOI (Initial or State)
                        let targetVOI = fusionVOI;
                        if (!targetVOI) {
                            // Automatically fall back to the series' default Window/Level
                            const fImg = fusionImages[0];
                            if (fImg) {
                                targetVOI = {
                                    windowWidth: Number(Array.isArray(fImg.windowWidth) ? fImg.windowWidth[0] : fImg.windowWidth),
                                    windowCenter: Number(Array.isArray(fImg.windowCenter) ? fImg.windowCenter[0] : fImg.windowCenter)
                                };
                            }
                        }

                        if (targetVOI && targetVOI.windowWidth !== undefined && targetVOI.windowCenter !== undefined) {
                            viewport.setProperties({
                                voiRange: {
                                    lower: targetVOI.windowCenter - targetVOI.windowWidth / 2,
                                    upper: targetVOI.windowCenter + targetVOI.windowWidth / 2,
                                }
                            }, fusionActorId as string);
                        }
                    }
                }

                setVolumeProgress(100);
                await viewport.setVolumes(volumeInputs);

                // --- ★ Apply Fusion Properties ★ ---
                if (fusionActorId) {
                    const fusionActor = viewport.getActor(fusionActorId)?.actor as any;
                    if (fusionActor) {
                        // Update Opacity (Signal-Dependent Thresholding & Advanced Transfer Functions)
                        applyFusionOpacity(fusionActor, fusionOpacity, fusionVOI, fusionTransferFunction);

                        const fColormapMap: Record<string, string> = {
                            'Grayscale': '',
                            'Hot Metal': 'hotiron',
                            'PET': 'pet',
                            'Rainbow': 'rainbow',
                            'Jet': 'jet',
                            'HotIron': 'hotiron',
                            'Hot': 'hot',
                            'Cool': 'cool'
                        };
                        const colormapId = fColormapMap[fusionLUT || 'Hot Metal'] || 'hotiron';
                        if (colormapId) {
                            viewport.setProperties({ colormap: { name: colormapId } }, fusionActorId as string);
                        }

                        if (fusionVOI && fusionVOI.windowWidth !== undefined && fusionVOI.windowCenter !== undefined) {
                            viewport.setProperties({
                                voiRange: {
                                    lower: fusionVOI.windowCenter - fusionVOI.windowWidth / 2,
                                    upper: fusionVOI.windowCenter + fusionVOI.windowWidth / 2,
                                }
                            }, fusionActorId as string);
                        }
                    }
                }

                // --- ★ Apply MIP & LUT ★ ---
                const volumeActor = viewport.getActor(volumeId)?.actor as any;
                if (volumeActor && viewport.type === Enums.ViewportType.ORTHOGRAPHIC) {
                    const isMIP = projectionMode === 'MIP';
                    (viewport as any).setBlendMode(isMIP ? Enums.BlendModes.MAXIMUM_INTENSITY_BLEND : Enums.BlendModes.COMPOSITE, volumeId);

                    if (activeLUT && activeLUT !== 'Grayscale') {
                        // In a real Horos/Cornerstone app, we'd map this to full transfer functions.
                        // Here we use the colormap property for simpler integration.
                        const colormapMap: Record<string, string> = {
                            'Hot Metal': 'hotiron',
                            'PET': 'pet',
                            'Rainbow': 'rainbow',
                            'Jet': 'jet'
                        };
                        const colormapId = colormapMap[activeLUT] || '';
                        if (colormapId) viewport.setProperties({ colormap: { name: colormapId } }, volumeId);
                    }
                }

                const targetOrientation = orientation === 'Acquisition' ? 'AXIAL' : orientation.toUpperCase();
                const orientationKey = targetOrientation as keyof typeof Enums.OrientationAxis;
                viewport.setOrientation(Enums.OrientationAxis[orientationKey]);

                const nSlices = viewport.getNumberOfSlices();
                const midIndex = Math.floor(nSlices / 2);
                if ((viewport as any).setSliceIndex) (viewport as any).setSliceIndex(midIndex);

                setMetadata(prev => ({ ...prev, totalInstances: nSlices, instanceNumber: midIndex + 1 }));
            } else {
                const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
                try {
                    await viewport.setStack(ids, initialIndex);
                } catch (stackErr) {
                    console.error(`[useViewportLoader] ${viewportId}: setStack FAILED:`, stackErr);
                    setStatus('Stack Error');
                    return;
                }
                setMetadata(prev => ({ ...prev, totalInstances: ids.length, instanceNumber: initialIndex + 1 }));
            }

            setImageIds(ids);
            setInitialImgIdx(initialIndex);

            // --- ★ Background Caching (Horos Parity) ---
            if (!isThumbnail && ids.length > 1) {
                const triggerBackgroundCache = async () => {
                    const CHUNK_SIZE = 5;
                    let loadedCount = 0;

                    // Create a prioritized list: current index first, then outwards
                    const priorityIds = [...ids];
                    priorityIds.sort((a, b) => {
                        const distA = Math.abs(ids.indexOf(a) - initialIndex);
                        const distB = Math.abs(ids.indexOf(b) - initialIndex);
                        return distA - distB;
                    });

                    for (let i = 0; i < priorityIds.length; i += CHUNK_SIZE) {
                        if (!mountedRef.current || lastSeriesUidRef.current !== seriesUid) break;
                        const chunk = priorityIds.slice(i, i + CHUNK_SIZE);

                        await Promise.all(chunk.map(async (id) => {
                            try {
                                if (!cache.getImage(id)) {
                                    await imageLoader.loadAndCacheImage(id);
                                }
                                loadedCount++;
                            } catch (e) {
                                // Silent failure for background cache
                                loadedCount++;
                            }
                        }));

                        const progress = Math.round((loadedCount / ids.length) * 100);
                        if (mountedRef.current) {
                            setMetadata(prev => ({ ...prev, cacheProgress: progress }));
                        }

                        // Breathing room for UI
                        await new Promise(r => setTimeout(r, 100));
                    }
                };

                // Start after a short delay to ensure initial render is prioritized
                setTimeout(triggerBackgroundCache, 500);
            }

            const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
            console.log(`[useViewportLoader] ${viewportId}: Rendering ${isVolumeView ? 'Volume' : 'Stack'} with ${ids.length} images`);
            viewport.resetCamera();
            viewport.render();
            setStatus('Rendering...');

            // --- ★ Thumbnail/Volume/Stack: Set isComposed immediately to ensure visibility ---
            console.log(`[useViewportLoader] ${viewportId}: Data fetched, composing viewport...`);
            setTimeout(() => {
                if (mountedRef.current) {
                    setIsComposed(true);
                    console.log(`[useViewportLoader] ${viewportId}: Viewport composed successfully.`);
                }
            }, 100);

            // Set Initial VOI
            setTimeout(async () => {
                if (!mountedRef.current) return;
                viewport.resetCamera();

                const imgDoc = images.length > 0 ? images[initialIndex] : null;
                const normalize = (val: any) => {
                    if (Array.isArray(val)) return Number(val[0]);
                    if (typeof val === 'string' && val.includes('\\')) return Number(val.split('\\')[0]);
                    return Number(val);
                };

                const wc = initialWindowCenter !== undefined ? initialWindowCenter : (imgDoc ? normalize(imgDoc.windowCenter) : undefined);
                const ww = initialWindowWidth !== undefined ? initialWindowWidth : (imgDoc ? normalize(imgDoc.windowWidth) : undefined);

                if (wc !== undefined && ww !== undefined && !isNaN(wc) && !isNaN(ww)) {
                    viewport.setProperties({ voiRange: { lower: wc - ww / 2, upper: wc + ww / 2 } });
                }

                if (isThumbnail) {
                    setMetadata(prev => ({
                        ...prev,
                        windowWidth: ww ?? prev.windowWidth,
                        windowCenter: wc ?? prev.windowCenter
                    }));
                } else {
                    // Fetch full metadata for overlays (Main Viewer Only)
                    const subseries = await (window as any).electron.db.get('SELECT * FROM series WHERE seriesInstanceUID = ?', [seriesUid]);
                    const study = subseries ? await (window as any).electron.db.get('SELECT * FROM studies WHERE studyInstanceUID = ?', [subseries.studyInstanceUID]) : null;
                    const patient = study ? await (window as any).electron.db.get('SELECT * FROM patients WHERE id = ?', [study.patientId]) : null;

                    setMetadata(prev => ({
                        ...prev,
                        patientName: patient?.patientName || 'Anonymous',
                        patientID: patient?.patientID || 'Unknown',
                        institutionName: study?.institutionName || '',
                        studyDescription: study?.studyDescription || '',
                        seriesNumber: subseries ? String(subseries.seriesNumber) : '',
                        seriesDescription: subseries?.seriesDescription || '',
                        modality: subseries?.modality || '',
                        windowWidth: ww ?? prev.windowWidth,
                        windowCenter: wc ?? prev.windowCenter,
                    }));
                }

                viewport.render();

                // Apply CLUT and initial fits
                const { CLUT_PRESETS } = await import('./CLUTPresets');
                const preset = CLUT_PRESETS.find(p => p.name === activeLUT);
                if (preset) {
                    viewport.setProperties({
                        voiRange: {
                            lower: preset.windowCenter - preset.windowWidth / 2,
                            upper: preset.windowCenter + preset.windowWidth / 2,
                        }
                    });
                } else if (autoFit) {
                    viewport.resetCamera();
                }

                setStatus('');
            }, 50);

        } catch (err) {
            console.error(`[useViewportLoader] ${viewportId}: ❌ Load Error for series ${seriesUid}:`, err);
            setStatus('Load Failed');
        }
    }, [
        seriesUid,
        viewportId,
        renderingEngineId,
        element,
        orientation,
        isThumbnail,
        initialImageId,
        databasePath,
        initialWindowWidth,
        initialWindowCenter,
        activeLUT,
        autoFit,
        voiOverride,
        // Removed dimensions.width/height and onVoiChange to prevent jitter
    ]);

    // Dimension Observer
    const retryCountRef = useRef(0);
    const MAX_RETRIES = 50; // 5 seconds total

    useEffect(() => {
        if (!element || !seriesUid) return;

        const checkSizeAndInit = async () => {
            // Again, require at least 10px to consider the element "ready"
            if (element.clientWidth < 10 || element.clientHeight < 10) {
                if (retryCountRef.current < MAX_RETRIES) {
                    retryCountRef.current++;
                    if (!isThumbnail) {
                        console.debug(`[useViewportLoader] ${viewportId}: Element size ${element.clientWidth}x${element.clientHeight}, retrying (${retryCountRef.current}/${MAX_RETRIES})...`);
                    }
                    setTimeout(checkSizeAndInit, 100);
                } else {
                    console.error(`[useViewportLoader] ${viewportId}: Gave up waiting for element size after ${MAX_RETRIES} attempts.`);
                    setStatus(`Error: Container size too small (${element.clientWidth}x${element.clientHeight})`);
                }
                return;
            }

            console.log(`[useViewportLoader] ${viewportId}: Element size ready: ${element.clientWidth}x${element.clientHeight}`);
            retryCountRef.current = 0; // Reset on success
            loadSeries(); // Trigger the main load logic
        };

        // Initial check
        checkSizeAndInit();

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;

                if (width >= 10 && height >= 10) {
                    const now = Date.now();
                    if (now - lastResizeTimeRef.current > 33) {
                        const engine = getRenderingEngine(renderingEngineId);
                        if (engine) {
                            try {
                                engine.resize();
                                // CRITICAL: Re-render ALL viewports to prevent blanking others
                                engine.render();
                            } catch (e) { }
                        }
                        lastResizeTimeRef.current = now;
                    }

                    // If we previously had 0 dimensions and were waiting to load, trigger it now
                    if (!hasValidDimensionsRef.current) {
                        console.log(`[useViewportLoader] ${viewportId}: Dimensions became valid (${width}x${height}), triggering load.`);
                        hasValidDimensionsRef.current = true;
                        loadSeries();
                    }
                } else {
                    hasValidDimensionsRef.current = false;
                }
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element, renderingEngineId, viewportId, loadSeries]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        loadSeries();
    }, [loadSeries]);

    // Handle Metadata Updates (Scrolling, VOI changes)
    useEffect(() => {
        if (!isReady || !element) return;

        const updateMetadata = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;

            // PERFORMANCE: Throttle React state updates during high-frequency scrolling
            const now = Date.now();
            if (now - lastUpdateTimeRef.current < THROTTLE_MS) return;
            lastUpdateTimeRef.current = now;

            const engine = getRenderingEngine(renderingEngineId);
            const vp = engine?.getViewport(viewportId) as any;
            if (!vp) return;

            const props = vp.getProperties();
            const voiRange = props?.voiRange;

            let instanceNumber = 1;
            let totalInstances = 1;

            if (vp.getSliceIndex) {
                instanceNumber = vp.getSliceIndex() + 1;
                totalInstances = vp.getNumberOfSlices();
            } else if (vp.getCurrentImageIdIndex) {
                instanceNumber = vp.getCurrentImageIdIndex() + 1;
                totalInstances = vp.getImageIds().length;
            }

            const newWw = voiRange ? voiRange.upper - voiRange.lower : undefined;
            const newWc = voiRange ? (voiRange.upper + voiRange.lower) / 2 : undefined;

            setMetadata(prev => {
                const hasInstanceChanged = prev.instanceNumber !== instanceNumber;
                const hasTotalChanged = prev.totalInstances !== totalInstances;
                const hasWwChanged = newWw !== undefined && Math.abs((prev.windowWidth || 0) - newWw) > 0.1;
                const hasWcChanged = newWc !== undefined && Math.abs((prev.windowCenter || 0) - newWc) > 0.1;

                if (!hasInstanceChanged && !hasTotalChanged && !hasWwChanged && !hasWcChanged) {
                    return prev;
                }

                console.log(`[useViewportLoader] Metadata Updated: ${instanceNumber}/${totalInstances} (WW: ${newWw}, WC: ${newWc})`);

                return {
                    ...prev,
                    instanceNumber,
                    totalInstances,
                    windowWidth: newWw ?? prev.windowWidth,
                    windowCenter: newWc ?? prev.windowCenter,
                };
            });
        };

        const handleRendered = (evt: any) => {
            if (evt.detail.viewportId !== viewportId) return;
            const isOrthographic = !isThumbnail && (orientation === 'Coronal' || orientation === 'Sagittal' || orientation === 'Axial');
            if (!isComposed && (!isOrthographic || volumeProgress >= 100)) {
                if (mountedRef.current) setIsComposed(true);
            }
            updateMetadata(evt);
        };

        element.addEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
        element.addEventListener(Enums.Events.VOI_MODIFIED, updateMetadata);
        element.addEventListener(Enums.Events.STACK_NEW_IMAGE, updateMetadata);
        // element.addEventListener(Enums.Events.CAMERA_MODIFIED, updateMetadata); // Too high frequency, causing lag

        // Handle Active CLUT change reactively
        const applyCLUT = async () => {
            const engine = getRenderingEngine(renderingEngineId);
            const vp = engine?.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
            if (!vp) return;

            // Map friendly names to Cornerstone colormap IDs
            const colormapMap: Record<string, string> = {
                'Grayscale': '', // Empty or default
                'Hot Metal': 'hotiron',
                'PET': 'pet',
                'Rainbow': 'rainbow',
                'Jet': 'jet',
                'HotIron': 'hotiron',
                'Hot': 'hot',
                'Cool': 'cool'
            };

            const colormapId = colormapMap[activeLUT || 'Grayscale'] || '';

            if (vp.type === Enums.ViewportType.ORTHOGRAPHIC || vp.type === Enums.ViewportType.VOLUME_3D) {
                // For volume viewports, colormap is applied to the actor
                vp.setProperties({
                    colormap: colormapId ? { name: colormapId } : undefined
                });
            } else {
                // For stack viewports, colormap is applied to the image
                vp.setProperties({
                    colormap: colormapId ? { name: colormapId } : undefined
                });
            }
            vp.render();
        };
        applyCLUT();

        return () => {
            element.removeEventListener(Enums.Events.IMAGE_RENDERED, handleRendered);
            element.removeEventListener(Enums.Events.VOI_MODIFIED, updateMetadata);
            element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, updateMetadata);
            // element.removeEventListener(Enums.Events.CAMERA_MODIFIED, updateMetadata);
        };
    }, [viewportId, renderingEngineId, element, isReady, isThumbnail, orientation, activeLUT, fusionSeriesUid, fusionOpacity, fusionLUT]);

    // Handle Fusion Property Updates (Reactive)
    useEffect(() => {
        if (!isReady || !fusionSeriesUid) return;
        const engine = getRenderingEngine(renderingEngineId);
        const vp = engine?.getViewport(viewportId) as Types.IVolumeViewport;
        if (!vp) return;

        const fusionActorId = `volume-${fusionSeriesUid}`;
        const fusionActor = vp.getActor(fusionActorId)?.actor as any;
        if (fusionActor) {
            // Update Opacity (Signal-Dependent Thresholding & Advanced Transfer Functions)
            applyFusionOpacity(fusionActor, fusionOpacity, fusionVOI, fusionTransferFunction);

            // Update Colormap
            const colormapMap: Record<string, string> = {
                'Grayscale': '',
                'Hot Metal': 'hotiron',
                'PET': 'pet',
                'Rainbow': 'rainbow',
                'Jet': 'jet'
            };
            const colormapId = colormapMap[fusionLUT || 'Hot Metal'] || 'hotiron';
            if (colormapId) {
                vp.setProperties({ colormap: { name: colormapId } }, fusionActorId);
            }

            // Update VOI
            if (fusionVOI && fusionVOI.windowWidth !== undefined && fusionVOI.windowCenter !== undefined) {
                vp.setProperties({
                    voiRange: {
                        lower: fusionVOI.windowCenter - fusionVOI.windowWidth / 2,
                        upper: fusionVOI.windowCenter + fusionVOI.windowWidth / 2,
                    }
                }, fusionActorId);
            }

            vp.render();
        }
    }, [fusionOpacity, fusionLUT, fusionVOI, fusionSeriesUid, isReady, viewportId, renderingEngineId]);

    // Apply VOI Override
    useEffect(() => {
        if (!isReady || !voiOverride) return;
        const engine = getRenderingEngine(renderingEngineId);
        const vp = engine?.getViewport(viewportId) as Types.IStackViewport | Types.IVolumeViewport;
        if (vp && voiOverride.windowWidth !== undefined && voiOverride.windowCenter !== undefined) {
            vp.setProperties({
                voiRange: {
                    lower: voiOverride.windowCenter - voiOverride.windowWidth / 2,
                    upper: voiOverride.windowCenter + voiOverride.windowWidth / 2,
                }
            });
            vp.render();
            onVoiChange?.();
        }
    }, [voiOverride, isReady, viewportId, renderingEngineId, onVoiChange]);

    // Background Cache Integration
    const { cacheProgress } = useBackgroundCache({
        seriesUid,
        imageIds,
        initialIndex: initialImgIdx,
        enabled: isReady && !isThumbnail
    });

    useEffect(() => {
        if (cacheProgress !== undefined) {
            setMetadata(prev => ({ ...prev, cacheProgress }));
        }
    }, [cacheProgress]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (renderingEngineId && viewportId) {
                try {
                    const engine = getRenderingEngine(renderingEngineId);
                    if (engine && engine.getViewport(viewportId)) {
                        engine.disableElement(viewportId);
                        console.log(`[useViewportLoader] ${viewportId}: Disabled on unmount`);
                    }
                } catch (e) { }
            }
        };
    }, [viewportId, renderingEngineId]);

    return {
        isReady,
        isComposed,
        status,
        volumeProgress,
        metadata,
        reload: loadSeries
    };
};

// --- ★ Helper: sophisticated opacity functions (Horos/Osirix style) ★ ---
const applyFusionOpacity = (actor: any, baseOpacity: number, voi: VOI | null | undefined, mode: string = 'Linear') => {
    const property = actor.getProperty();
    const opacityFunction = property.getScalarOpacity(0);
    opacityFunction.removeAllPoints();

    if (!voi || voi.windowWidth === undefined || voi.windowCenter === undefined) {
        property.setScalarOpacity(0, baseOpacity);
        return;
    }

    const lower = voi.windowCenter - voi.windowWidth / 2;
    const upper = voi.windowCenter + voi.windowWidth / 2;
    const range = voi.windowWidth;

    switch (mode) {
        case 'Flat':
            opacityFunction.addPoint(lower - 0.1, 0.0);
            opacityFunction.addPoint(lower, baseOpacity);
            opacityFunction.addPoint(upper, baseOpacity);
            break;
        case 'Logarithmic':
            opacityFunction.addPoint(lower - 0.1, 0.0);
            for (let i = 0; i <= 5; i++) {
                const t = i / 5;
                const val = lower + t * range;
                const alpha = (Math.log10(1 + 9 * t)) * baseOpacity;
                opacityFunction.addPoint(val, alpha);
            }
            break;
        case 'Exponential':
            opacityFunction.addPoint(lower - 0.1, 0.0);
            for (let i = 0; i <= 5; i++) {
                const t = i / 5;
                const val = lower + t * range;
                const alpha = ((Math.pow(10, t) - 1) / 9) * baseOpacity;
                opacityFunction.addPoint(val, alpha);
            }
            break;
        case 'Linear':
        default:
            opacityFunction.addPoint(lower - 0.1, 0.0);
            opacityFunction.addPoint(lower, 0.0);
            opacityFunction.addPoint(upper, baseOpacity);
            break;
    }
};
