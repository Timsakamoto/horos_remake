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
    MagnifyTool,
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
// This ensures that even if child components (Viewport) mount and call setStack 
// before the parent (App) finishes async initCornerstone, the 'electronfile:' 
// scheme is already recognized by Cornerstone's imageLoader.
registerElectronImageLoader();

let isInitialized = false;

export const initCornerstone = async () => {
    if (isInitialized) return;
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
        MagnifyTool,
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
            addTool(tool);
        } catch (e) {
            // Already added
        }
    });

    // 3. Configure DICOM Image Loader (Default for non-electronfile)
    cornerstoneDICOMImageLoader.configure({
        useWebWorkers: false,
        decodeConfig: {
            convertFloatPixelDataToInt: false,
        },
    });
    cornerstoneDICOMImageLoader.wadouri.register(cornerstone);
    cornerstoneDICOMImageLoader.wadors.register(cornerstone);

    // 4. Register Volume Loaders
    (volumeLoader.registerUnknownVolumeLoader as any)(
        cornerstoneStreamingImageVolumeLoader,
    );
    (volumeLoader.registerVolumeLoader as any)(
        'cornerstoneStreamingImageVolume',
        cornerstoneStreamingImageVolumeLoader,
    );

    isInitialized = true;
    (window as any).cornerstone = cornerstone;
    (window as any).cornerstoneTools = cornerstoneTools;
    console.log('Cornerstone: Initialization Complete.');
};
