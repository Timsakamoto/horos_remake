import * as cornerstoneTools from '@cornerstonejs/tools';
import * as cornerstone from '@cornerstonejs/core';
import {
    init as csRenderInit,
    volumeLoader,
} from '@cornerstonejs/core';
import {
    init as csToolsInit,
    addTool,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollMouseWheelTool,
    StackScrollTool,
    LengthTool,
    EllipticalROITool,
    RectangleROITool,
    ProbeTool,
    AngleTool,
    ArrowAnnotateTool,
    CobbAngleTool,
    BidirectionalTool,
    CrosshairsTool,
    ReferenceLinesTool,
} from '@cornerstonejs/tools';
import {
    cornerstoneStreamingImageVolumeLoader,
} from '@cornerstonejs/streaming-image-volume-loader';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { registerElectronImageLoader } from './electronLoader';

cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

// CRITICAL: Register the loader IMMEDIATELY upon module load.
registerElectronImageLoader();

let initPromise: Promise<void> | null = null;

export const initCornerstone = async () => {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        console.log('Cornerstone: Initializing Core & Tools...');

        // 1. Init Core
        await csRenderInit();
        await csToolsInit();

        // 1.1 Configure Cache (2GB)
        cornerstone.cache.setMaxCacheSize(2048 * 1024 * 1024);

        // 2. Register Tools Globally (Once)
        const tools = [
            WindowLevelTool,
            PanTool,
            ZoomTool,
            StackScrollMouseWheelTool,
            StackScrollTool,
            CrosshairsTool,
            ReferenceLinesTool,
        ];

        const annotationTools = [
            LengthTool,
            EllipticalROITool,
            RectangleROITool,
            ProbeTool,
            AngleTool,
            ArrowAnnotateTool,
            CobbAngleTool,
            BidirectionalTool,
        ];

        [...tools, ...annotationTools].forEach(tool => {
            try {
                // We use try-catch because CS3D addTool throws if already registered.
                // This is the safest way to handle HMR and React Strict Mode.
                addTool(tool);
            } catch (e) {
                // console.debug(`Cornerstone: Tool ${tool.toolName} already registered.`);
            }
        });

        // 3. Configure DICOM Image Loader
        cornerstoneDICOMImageLoader.configure({
            useWebWorkers: false,
            decodeConfig: {
                convertFloatPixelDataToInt: false,
            },
        });

        try {
            cornerstoneDICOMImageLoader.wadouri.register(cornerstone);
            cornerstoneDICOMImageLoader.wadors.register(cornerstone);
        } catch (e) { /* ignore */ }

        // 4. Register Volume Loaders
        try {
            (volumeLoader.registerUnknownVolumeLoader as any)(
                cornerstoneStreamingImageVolumeLoader,
            );
            (volumeLoader.registerVolumeLoader as any)(
                'cornerstoneStreamingImageVolume',
                cornerstoneStreamingImageVolumeLoader,
            );
        } catch (e) { /* ignore */ }

        (window as any).cornerstone = cornerstone;
        (window as any).cornerstoneTools = cornerstoneTools;
        console.log('Cornerstone: Initialization Complete.');
    })();

    return initPromise;
};
