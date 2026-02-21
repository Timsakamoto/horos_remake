import { useEffect } from 'react';
import { importFiles } from '../importService';

export const useAutoReimport = (
    databasePath: string | null,
    isLoaded: boolean,
    setImportProgress: (progress: any) => void
) => {
    useEffect(() => {
        let isActive = true;
        const checkAutoReimport = async () => {
            const shouldReimport = localStorage.getItem('peregrine_reimport_after_reset') === 'true';
            if (!shouldReimport || !databasePath || !isLoaded) return;

            // Small delay to ensure DB is ready
            await new Promise(resolve => setTimeout(resolve, 500));
            if (!isActive) return;

            console.log('useAutoReimport: Auto-reimporting from:', databasePath);
            localStorage.removeItem('peregrine_reimport_after_reset');

            try {
                setImportProgress({ current: 0, total: 100, percent: 0, message: 'Scanning for files...' });
                // @ts-ignore
                const allFiles = await window.electron.readdirRecursive(databasePath);
                const filesToImport = allFiles.filter((f: string) => {
                    const name = f.split(/[/\\]/).pop() || '';
                    return !name.startsWith('.');
                });

                if (filesToImport.length > 0) {
                    await importFiles(filesToImport, false, (percent, message) => {
                        if (isActive) setImportProgress({ current: 0, total: 100, percent, message });
                    });
                }
            } catch (err) {
                console.error('Auto-reimport failed:', err);
            } finally {
                if (isActive) setImportProgress(null);
            }
        };
        checkAutoReimport();
        return () => { isActive = false; };
    }, [databasePath, isLoaded, setImportProgress]);
};
