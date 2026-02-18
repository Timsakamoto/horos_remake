import { useState } from 'react';
import { AntigravityDatabase } from '../db';
import { importFiles } from '../importService';

export const useDatabaseImport = (db: AntigravityDatabase | null, databasePath: string | null) => {
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [pendingImportPaths, setPendingImportPaths] = useState<string[]>([]);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number; message: string } | null>(null);

    const handleImport = async () => {
        if (!db) return;
        try {
            // @ts-ignore
            const filePaths = await window.electron.openFile();
            if (filePaths && filePaths.length > 0) {
                setPendingImportPaths(filePaths);
                setShowImportDialog(true);
            }
        } catch (err) {
            console.error('Import failed:', err);
        }
    };

    const importPaths = async (paths: string[]) => {
        if (!db || !paths || paths.length === 0) return;
        setPendingImportPaths(paths);
        setShowImportDialog(true);
    };

    const onSelectStrategy = async (strategy: 'copy' | 'link' | 'cancel') => {
        setShowImportDialog(false);
        if (strategy === 'cancel' || !db) {
            setPendingImportPaths([]);
            return;
        }

        try {
            await importFiles(db, pendingImportPaths, strategy === 'copy', (percent, message) => {
                setImportProgress({ current: 0, total: 100, percent, message });
            }, databasePath);
        } catch (err) {
            console.error('Final import failed:', err);
        } finally {
            setImportProgress(null);
            setPendingImportPaths([]);
        }
    };

    return {
        showImportDialog,
        setShowImportDialog,
        pendingImportPaths,
        importProgress,
        setImportProgress,
        handleImport,
        importPaths,
        onSelectStrategy
    };
};
