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
} from '@cornerstonejs/tools';
import {
    cornerstoneStreamingImageVolumeLoader,
} from '@cornerstonejs/streaming-image-volume-loader';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

export const initCornerstone = async () => {
    console.log('Cornerstone: Initializing...');

    // 1. Init Core
    await csRenderInit();
    await csToolsInit();

    // 2. Register Tools Globally (Once)
    // Core Tools
    const tools = [
        WindowLevelTool,
        PanTool,
        ZoomTool,
        StackScrollMouseWheelTool,
        StackScrollTool,
        MagnifyTool,
    ];

    // Annotation Tools (C1-C7)
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

    // 3. Configure DICOM Image Loader
    // We disable WebWorkers for now because Electron/Vite environments have specific
    // worker path requirements, and passing codec functions directly causes postMessage errors.
    cornerstoneDICOMImageLoader.configure({
        useWebWorkers: false,
        decodeConfig: {
            convertFloatPixelDataToInt: false,
            // You can add other main-thread decoding options here if needed
        },
    });

    // NOTE: If you need high-performance worker-based decoding, 
    // you must provide worker paths and avoid passing functions in config.
    // cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);

    // 4. Register Volume Loaders
    (volumeLoader.registerUnknownVolumeLoader as any)(
        cornerstoneStreamingImageVolumeLoader,
    );
    (volumeLoader.registerVolumeLoader as any)(
        'cornerstoneStreamingImageVolume',
        cornerstoneStreamingImageVolumeLoader,
    );

    // 5. Register Electron Image Loader
    const { registerElectronImageLoader } = await import('./electronLoader');
    registerElectronImageLoader();

    console.log('Cornerstone: Initialized.');
};
