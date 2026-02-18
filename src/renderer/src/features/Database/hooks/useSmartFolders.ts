import { useState, useEffect, useCallback } from 'react';
import { AntigravityDatabase } from '../db';
import { SmartFolderDocType } from '../schema/smartFolder.schema';
import { SearchFilters, emptyFilters } from '../types';

export const useSmartFolders = (
    db: AntigravityDatabase | null,
    searchFilters: SearchFilters,
    setSearchFilters: (filters: SearchFilters) => void
) => {
    const [smartFolders, setSmartFolders] = useState<SmartFolderDocType[]>([]);
    const [activeSmartFolderId, setActiveSmartFolderId] = useState<string | null>(null);

    const seedDefaultSmartFolders = useCallback(async (database: AntigravityDatabase) => {
        try {
            const count = await database.smart_folders.count().exec();
            if (count > 0) return;

            console.log('useSmartFolders: Seeding default smart folders...');
            const defaults: SmartFolderDocType[] = [
                {
                    id: 'all',
                    name: 'All Patients',
                    icon: 'Database',
                    query: {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                },
                {
                    id: 'recent_ct',
                    name: 'Recent CTs',
                    icon: 'Layers',
                    query: { modality: ['CT'] },
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ];

            for (const folder of defaults) {
                await database.smart_folders.insert(folder);
            }
        } catch (err) {
            console.error('Failed to seed smart folders:', err);
        }
    }, []);

    const applySmartFolder = useCallback((id: string | null) => {
        setActiveSmartFolderId(id);
        if (!id) {
            setSearchFilters(emptyFilters);
            return;
        }
        const folder = smartFolders.find(f => f.id === id);
        if (folder) {
            setSearchFilters({
                ...emptyFilters,
                ...folder.query,
                dateRange: {
                    start: folder.query.studyDateStart || '',
                    end: folder.query.studyDateEnd || ''
                },
                modalities: folder.query.modality || []
            });
        }
    }, [smartFolders, setSearchFilters]);

    const saveSmartFolder = useCallback(async (name: string, icon: string = 'Folder') => {
        if (!db) return;
        const id = `smart_${Date.now()}`;
        try {
            await db.smart_folders.insert({
                id,
                name,
                icon,
                query: {
                    patientName: searchFilters.patientName,
                    patientID: searchFilters.patientID,
                    modality: searchFilters.modalities,
                    studyDateStart: searchFilters.dateRange.start,
                    studyDateEnd: searchFilters.dateRange.end,
                    institutionName: searchFilters.institutionName
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            setActiveSmartFolderId(id);
        } catch (err) {
            console.error('Failed to save smart folder:', err);
        }
    }, [db, searchFilters]);

    useEffect(() => {
        if (!db) return;
        seedDefaultSmartFolders(db);
        const sub = db.smart_folders.find({ sort: [{ updatedAt: 'desc' }] }).$.subscribe(docs => {
            setSmartFolders(docs.map(d => d.toJSON() as any));
        });
        return () => sub.unsubscribe();
    }, [db, seedDefaultSmartFolders]);

    return {
        smartFolders,
        activeSmartFolderId,
        applySmartFolder,
        saveSmartFolder
    };
};
