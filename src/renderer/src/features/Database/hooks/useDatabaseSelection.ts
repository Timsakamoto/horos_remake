import { useState, useCallback } from 'react';

export const useDatabaseSelection = () => {
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

    const toggleSelection = useCallback(async (id: string, type: 'patient' | 'study' | 'series') => {
        const newChecked = new Set(checkedItems);
        const isChecked = newChecked.has(id);

        const addCascading = async (targetId: string, targetType: 'patient' | 'study' | 'series') => {
            newChecked.add(targetId);
            if (targetType === 'patient') {
                const studiesSelection = await (window as any).electron.db.query('SELECT id, studyInstanceUID FROM studies WHERE patientId = ?', [targetId]);
                for (const st of studiesSelection) {
                    newChecked.add(st.studyInstanceUID);
                    const seriesSelection = await (window as any).electron.db.query('SELECT seriesInstanceUID FROM series WHERE studyId = ?', [st.id]);
                    for (const s of seriesSelection) newChecked.add(s.seriesInstanceUID);
                }
            } else if (targetType === 'study') {
                const studySelection = await (window as any).electron.db.get('SELECT id FROM studies WHERE studyInstanceUID = ?', [targetId]);
                if (studySelection) {
                    const seriesSelection = await (window as any).electron.db.query('SELECT seriesInstanceUID FROM series WHERE studyId = ?', [studySelection.id]);
                    for (const s of seriesSelection) newChecked.add(s.seriesInstanceUID);
                }
            }
        };

        const removeCascading = async (targetId: string, targetType: 'patient' | 'study' | 'series') => {
            newChecked.delete(targetId);
            if (targetType === 'patient') {
                const studiesSelection = await (window as any).electron.db.query('SELECT id, studyInstanceUID FROM studies WHERE patientId = ?', [targetId]);
                for (const st of studiesSelection) {
                    newChecked.delete(st.studyInstanceUID);
                    const seriesSelection = await (window as any).electron.db.query('SELECT seriesInstanceUID FROM series WHERE studyId = ?', [st.id]);
                    for (const s of seriesSelection) newChecked.delete(s.seriesInstanceUID);
                }
            } else if (targetType === 'study') {
                const studySelection = await (window as any).electron.db.get('SELECT id FROM studies WHERE studyInstanceUID = ?', [targetId]);
                if (studySelection) {
                    const seriesSelection = await (window as any).electron.db.query('SELECT seriesInstanceUID FROM series WHERE studyId = ?', [studySelection.id]);
                    for (const s of seriesSelection) newChecked.delete(s.seriesInstanceUID);
                }
            }
        };

        if (isChecked) await removeCascading(id, type);
        else await addCascading(id, type);

        setCheckedItems(newChecked);
    }, [checkedItems]);

    return {
        checkedItems,
        setCheckedItems,
        toggleSelection
    };
};
