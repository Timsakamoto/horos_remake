import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

// Map to store temporary ObjectURLs to clean them up later
const imageIdToBlobUrl = new Map<string, string>();

export function registerElectronImageLoader() {
    // Register a custom loader for 'electronfile'
    // @ts-ignore
    cornerstoneDICOMImageLoader.wadors.metaData.addProvider((imageId) => {
        // ... metadata provider if needed
    });
}

// Helper to load image
export const loadElectronImage = async (imageId: string) => {
    // imageId format: electronfile:/path/to/file
    const filePath = imageId.replace('electronfile:', '');

    // 1. Read buffer
    // @ts-ignore
    const buffer = await window.electron.readFile(filePath);
    if (!buffer) throw new Error("Read failed");

    // 2. Create Blob
    const blob = new Blob([buffer]);
    const file = new File([blob], "dicom");

    // 3. Use File Loader
    const imageIdFile = cornerstoneDICOMImageLoader.wadouri.fileManager.add(file);
    return cornerstoneDICOMImageLoader.wadouri.loadImage(imageIdFile);
}
