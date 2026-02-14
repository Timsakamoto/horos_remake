import { imageLoader } from '@cornerstonejs/core';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

export function registerElectronImageLoader() {
    // Configure cornerstoneDICOMImageLoader
    cornerstoneDICOMImageLoader.configure({
        useWebWorkers: false, // Electron renderer often has issues with worker paths unless configured carefully. For now, main thread is safer for local files.
        decodeConfig: {
            convertFloatPixelDataToInt: false,
        },
    });

    // Register a custom loader for 'electronfile'
    imageLoader.registerImageLoader('electronfile', loadElectronImage);
}

// Helper to load image
export const loadElectronImage = (imageId: string) => {
    return {
        promise: (async () => {
            // imageId format: electronfile:PATH?frame=N
            // Safely parse the imageId to extract filePath and frame index
            const withoutScheme = imageId.replace('electronfile:', '');
            const qIndex = withoutScheme.lastIndexOf('?frame=');
            let filePath: string;
            let frameIndex = '0';

            if (qIndex !== -1) {
                filePath = withoutScheme.substring(0, qIndex);
                frameIndex = withoutScheme.substring(qIndex + 7) || '0';
            } else {
                filePath = withoutScheme;
            }

            // Decode percent-encoded path components
            try {
                filePath = decodeURIComponent(filePath);
            } catch (e) { /* ignore */ }

            // Resolve relative path if needed
            if (!filePath.startsWith('/') && !filePath.includes(':') && !filePath.startsWith('\\')) {
                const managedDir = localStorage.getItem('horos_database_path');
                if (managedDir) {
                    const originalPath = filePath;
                    // @ts-ignore
                    filePath = await window.electron.join(managedDir, filePath);
                    console.log(`ElectronLoader: Resolved relative path [${originalPath}] to [${filePath}] using managedDir [${managedDir}]`);
                } else {
                    console.warn(`ElectronLoader: Path [${filePath}] is relative but 'horos_database_path' is not set in localStorage.`);
                }
            }

            console.log(`ElectronLoader: Loading ${filePath} (frame: ${frameIndex})`);

            // @ts-ignore
            const buffer = await window.electron.readFile(filePath);
            if (!buffer) {
                console.error(`ElectronLoader: Failed to read file at ${filePath}`);
                throw new Error(`Failed to read DICOM file: ${filePath}`);
            }
            console.log(`ElectronLoader: Successfully read ${buffer.byteLength} bytes from ${filePath}`);

            const blob = new Blob([buffer]);
            const file = new File([blob], "dicom");

            // Register file with loader
            const imageIdFile = cornerstoneDICOMImageLoader.wadouri.fileManager.add(file);

            // For multi-frame, append the frame index back
            const finalImageId = frameIndex !== '0'
                ? `${imageIdFile}?frame=${frameIndex}`
                : imageIdFile;

            const image = await cornerstoneDICOMImageLoader.wadouri.loadImage(finalImageId).promise;

            // Ensure sizeInBytes is present for Cornerstone cache
            if (image && image.sizeInBytes === undefined) {
                image.sizeInBytes = buffer.byteLength || 0;
            }

            return image;
        })()
    };
}
