import { useState } from 'react';

interface DeletionTarget {
    type: 'patient' | 'study' | 'series';
    id: string;
    name: string;
}

export const useDatabaseDeletion = () => {
    const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
    const [lastDeletionTime, setLastDeletionTime] = useState(0);

    const deleteFilesForRecord = async (type: 'patient' | 'study' | 'series', id: string) => {
        let query = '';
        let params: any[] = [];

        if (type === 'patient') {
            query = `
                SELECT i.filePath 
                FROM instances i
                JOIN series s ON i.seriesId = s.id
                JOIN studies st ON s.studyId = st.id
                WHERE st.patientId = ?
            `;
            params = [id];
        } else if (type === 'study') {
            query = `
                SELECT i.filePath 
                FROM instances i
                JOIN series s ON i.seriesId = s.id
                WHERE s.studyId = (SELECT id FROM studies WHERE studyInstanceUID = ?)
            `;
            params = [id];
        } else if (type === 'series') {
            query = `
                SELECT i.filePath 
                FROM instances i
                JOIN series s ON i.seriesId = s.id
                WHERE s.seriesInstanceUID = ?
            `;
            params = [id];
        }

        try {
            // @ts-ignore
            const files = await window.electron.db.query(query, params);
            for (const f of files) {
                if (f.filePath) {
                    // @ts-ignore
                    await window.electron.unlink(f.filePath);
                }
            }
        } catch (e) {
            console.error('[Deletion] Failed to cleanup files:', e);
        }
    };

    const performDeletion = async (type: 'patient' | 'study' | 'series', id: string, deleteFiles: boolean) => {
        try {
            if (deleteFiles) {
                await deleteFilesForRecord(type, id);
            }

            let sql = '';
            let params: any[] = [];

            if (type === 'patient') {
                sql = 'DELETE FROM patients WHERE id = ?';
                params = [id];
            } else if (type === 'study') {
                sql = 'DELETE FROM studies WHERE studyInstanceUID = ?';
                params = [id];
            } else if (type === 'series') {
                sql = 'DELETE FROM series WHERE seriesInstanceUID = ?';
                params = [id];
            }

            // @ts-ignore
            await window.electron.db.run(sql, params);
            setLastDeletionTime(Date.now());
        } catch (err) {
            console.error('[Deletion] SQLite deletion failed:', err);
        }
    };

    const requestDelete = (type: 'patient' | 'study' | 'series', id: string, name: string) => {
        setDeletionTarget({ type, id, name });
    };

    const onSelectDeleteStrategy = async (strategy: 'record-only' | 'record-and-files' | 'cancel') => {
        if (!deletionTarget || strategy === 'cancel') {
            setDeletionTarget(null);
            return;
        }

        const deleteFiles = strategy === 'record-and-files';
        const { type, id } = deletionTarget;

        try {
            await performDeletion(type, id, deleteFiles);
            setLastDeletionTime(Date.now());
        } catch (err) {
            console.error('Final deletion failed:', err);
        } finally {
            setDeletionTarget(null);
        }
    };

    return {
        deletionTarget,
        setDeletionTarget,
        lastDeletionTime,
        requestDelete,
        onSelectDeleteStrategy
    };
};
