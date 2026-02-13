import {
    init as csRenderInit,
    volumeLoader,
} from '@cornerstonejs/core';
import {
    init as csToolsInit,
} from '@cornerstonejs/tools';
import {
    cornerstoneStreamingImageVolumeLoader,
} from '@cornerstonejs/streaming-image-volume-loader';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dcmjs from 'dcmjs';

export const initCornerstone = async () => {
    console.log('Cornerstone: Initializing...');

    // 1. Init Core with GPU/Worker settings
    // Cornerstone 1.x auto-detects GPU, but we can ensure it's prioritized
    await csRenderInit({
        gpu: {
            preferredDeviceType: 'discrete' // Preferred for diagnostic workstations
        }
    });

    await csToolsInit();

    // 2. Configure DICOM Image Loader WebWorkers (Phase 11)
    const config = {
        maxWebWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),
        startWebWorkersOnDemand: true,
        webWorkerTaskPaths: [],
        taskConfiguration: {
            decodeTask: {
                initializeCodecsOnIdle: true,
                strict: false,
            },
        },
    };

    cornerstoneDICOMImageLoader.webWorkerManager.initialize(config);

    // 3. Register Volume Loaders
    volumeLoader.registerUnknownVolumeLoader(
        cornerstoneStreamingImageVolumeLoader,
    );
    volumeLoader.registerVolumeLoader(
        'cornerstoneStreamingImageVolume',
        cornerstoneStreamingImageVolumeLoader,
    );

    console.log('Cornerstone: Initialized.');
};
