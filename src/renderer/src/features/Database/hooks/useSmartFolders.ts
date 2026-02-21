import { useState, useEffect, useCallback } from 'react';
import { SearchFilters, emptyFilters } from '../types';

export const useSmartFolders = (
    searchFilters: SearchFilters,
    setSearchFilters: (filters: SearchFilters) => void
) => {
    const [smartFolders, setSmartFolders] = useState<any[]>([]);
    const [activeSmartFolderId, setActiveSmartFolderId] = useState<string | null>(null);

    const refreshSmartFolders = useCallback(async () => {
        try {
            // @ts-ignore
            const docs = await window.electron.db.query('SELECT * FROM smart_folders ORDER BY createdAt DESC');
            setSmartFolders(docs.map((d: any) => ({
                ...d,
                query: JSON.parse(d.query)
            })));
        } catch (err) {
            console.error('Failed to fetch smart folders:', err);
        }
    }, []);

    const seedDefaultSmartFolders = useCallback(async () => {
        try {
            // @ts-ignore
            const countObj = await window.electron.db.get('SELECT COUNT(*) as count FROM smart_folders');
            if (countObj.count > 0) return;

            console.log('useSmartFolders: Seeding default smart folders...');
            const defaults = [
                {
                    id: 'all',
                    name: 'All Patients',
                    icon: 'Database',
                    query: JSON.stringify({})
                },
                {
                    id: 'recent_ct',
                    name: 'Recent CTs',
                    icon: 'Layers',
                    query: JSON.stringify({ modalities: ['CT'] })
                }
            ];

            for (const folder of defaults) {
                // @ts-ignore
                await window.electron.db.run('INSERT INTO smart_folders (id, name, icon, query) VALUES (?, ?, ?, ?)', [folder.id, folder.name, folder.icon, folder.query]);
            }
            await refreshSmartFolders();
        } catch (err) {
            console.error('Failed to seed smart folders:', err);
        }
    }, [refreshSmartFolders]);

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
                ...folder.query
            });
        }
    }, [smartFolders, setSearchFilters]);

    const saveSmartFolder = useCallback(async (name: string, icon: string = 'Folder') => {
        const id = `smart_${Date.now()}`;
        const queryJson = JSON.stringify({
            patientName: searchFilters.patientName,
            patientID: searchFilters.patientID,
            modalities: searchFilters.modalities,
            dateRange: searchFilters.dateRange,
            institutionName: searchFilters.institutionName
        });

        try {
            // @ts-ignore
            await window.electron.db.run('INSERT INTO smart_folders (id, name, icon, query) VALUES (?, ?, ?, ?)', [id, name, icon, queryJson]);
            await refreshSmartFolders();
            setActiveSmartFolderId(id);
        } catch (err) {
            console.error('Failed to save smart folder:', err);
        }
    }, [searchFilters, refreshSmartFolders]);

    useEffect(() => {
        seedDefaultSmartFolders();
        refreshSmartFolders();
    }, [seedDefaultSmartFolders, refreshSmartFolders]);

    return {
        smartFolders,
        activeSmartFolderId,
        applySmartFolder,
        saveSmartFolder
    };
};
