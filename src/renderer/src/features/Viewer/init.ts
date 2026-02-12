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

    // 1. Init Core & Tools
    await csRenderInit();
    await csToolsInit();

    // 2. Register Volume Loaders
    volumeLoader.registerUnknownVolumeLoader(
        cornerstoneStreamingImageVolumeLoader,
    );
    volumeLoader.registerVolumeLoader(
        'cornerstoneStreamingImageVolume',
        cornerstoneStreamingImageVolumeLoader,
    );

    // 3. Configure DICOM Image Loader (WADO-RS / Local)
    // For Electron local files, we might need a custom loader or
    // use cornerstoneDICOMImageLoader.wadouri with 'file://' protocol if supported,
    // or register a custom loader.
    // For now, let's just init the basics.

    console.log('Cornerstone: Initialized.');
};
