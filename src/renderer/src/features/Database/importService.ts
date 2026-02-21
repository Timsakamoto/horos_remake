
export const importFiles = async (
    filePaths: string[],
    _copyToDatabase: boolean = false,
    onProgress?: (progress: number, message: string) => void
) => {
    onProgress?.(0, 'Initializing background import...');

    const allFilePaths: string[] = [];
    for (const path of filePaths) {
        try {
            // @ts-ignore
            const s = await window.electron.stat(path);
            if (s && s.isDirectory) {
                // @ts-ignore
                const files = await window.electron.readdirRecursive(path);
                if (files && files.length > 0) allFilePaths.push(...files);
            } else {
                allFilePaths.push(path);
            }
        } catch (e) {
            allFilePaths.push(path);
        }
    }

    if (allFilePaths.length === 0) {
        onProgress?.(100, 'No files found to import.');
        return;
    }

    // @ts-ignore
    const removeListener = window.electron.db.onImportProgress((data) => {
        onProgress?.(data.progress, data.message);
    });

    try {
        // @ts-ignore
        await window.electron.db.importFiles(allFilePaths);

        await new Promise<void>((resolve) => {
            // @ts-ignore
            const checkDone = window.electron.db.onImportProgress((data) => {
                if (data.progress >= 100) {
                    checkDone();
                    resolve();
                }
            });
        });

    } catch (err) {
        console.error('Background import trigger failed:', err);
        onProgress?.(100, 'Import failed to start.');
        throw err;
    } finally {
        removeListener();
    }
};
