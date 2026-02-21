import { useState, useCallback, useEffect } from 'react';
import { Patient, Study, SortConfig } from '../types';
import { clearMetadataCache } from '../../Viewer/electronLoader';

export const useDatabaseData = (viewMode: 'patient' | 'study', sortConfig: SortConfig, setAvailableModalities: (m: string[]) => void) => {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [studies, setStudies] = useState<Study[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const refreshData = useCallback(async () => {
        try {
            console.log('useDatabaseData: Refreshing data from SQLite...');
            setIsLoaded(true);

            if (viewMode === 'patient') {
                const patientsData = await (window as any).electron.db.query(`
                    SELECT 
                        p.*,
                        COUNT(s.id) as studyCount,
                        IFNULL(SUM(s.numberOfStudyRelatedInstances), 0) as totalImageCount,
                        GROUP_CONCAT(DISTINCT s.modalitiesInStudy) as allModalities,
                        MAX(s.studyDate) as latestStudyDate,
                        (SELECT institutionName FROM studies WHERE patientId = p.id ORDER BY studyDate DESC LIMIT 1) as latestInstitution
                    FROM patients p
                    LEFT JOIN studies s ON p.id = s.patientId
                    GROUP BY p.id
                    HAVING totalImageCount > 0
                    ORDER BY latestStudyDate DESC
                `);

                const mappedPatients = patientsData.map((p: any) => ({
                    id: String(p.id),
                    patientID: p.patientID,
                    patientName: p.patientName,
                    patientBirthDate: p.patientBirthDate || '',
                    patientSex: p.patientSex || '',
                    studyCount: p.studyCount || 0,
                    totalImageCount: p.totalImageCount || 0,
                    modalities: (p.allModalities || '').split(',').filter(Boolean),
                    studyDate: p.latestStudyDate || '',
                    institutionName: p.latestInstitution || ''
                }));

                setPatients(mappedPatients);
                const modalities = new Set<string>();
                mappedPatients.forEach((p: any) => p.modalities.forEach((m: string) => modalities.add(m)));
                setAvailableModalities(Array.from(modalities).sort());

            } else {
                const studiesData = await (window as any).electron.db.query(`
                    SELECT 
                        s.*,
                        p.patientName,
                        p.patientBirthDate,
                        p.patientSex
                    FROM studies s
                    JOIN patients p ON s.patientId = p.id
                    WHERE s.numberOfStudyRelatedInstances > 0
                    ORDER BY s.studyDate DESC
                `);

                const mappedStudies = studiesData.map((s: any) => ({
                    id: s.studyInstanceUID,
                    patientID: String(s.patientId || ''),
                    patientName: s.patientName || 'Unknown Patient',
                    patientBirthDate: s.patientBirthDate || s.studyDate || '',
                    patientSex: s.patientSex || '',
                    studyCount: 1,
                    totalImageCount: s.numberOfStudyRelatedInstances || 0,
                    modalities: (s.modalitiesInStudy || '').split(',').filter(Boolean),
                    _isStudy: true,
                    studyInstanceUID: s.studyInstanceUID,
                    studyId: s.id,
                    studyDescription: s.studyDescription,
                    accessionNumber: s.accessionNumber,
                    studyDate: s.studyDate,
                    institutionName: s.institutionName || ''
                }));

                setPatients(mappedStudies);
                const modalities = new Set<string>();
                mappedStudies.forEach((s: any) => s.modalities.forEach((m: string) => modalities.add(m)));
                setAvailableModalities(Array.from(modalities).sort());
            }
        } catch (err: any) {
            console.error('Failed to refresh SQLite data:', err);
            setError(err.message || 'Unknown database error');
        }
    }, [viewMode, sortConfig, setAvailableModalities]);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    useEffect(() => {
        // Observer for Main-process triggered imports or data changes
        // @ts-ignore
        const unsubImport = window.electron.db.onImportProgress((data) => {
            if (data.progress >= 100) refreshData();
        });

        let refreshTimeout: NodeJS.Timeout | null = null;
        // @ts-ignore
        const unsubData = window.electron.db.onDataUpdated(() => {
            if (refreshTimeout) clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
                clearMetadataCache();
                refreshData();
            }, 200);
        });

        return () => {
            unsubImport();
            if (unsubData) unsubData();
            if (refreshTimeout) clearTimeout(refreshTimeout);
        };
    }, [refreshData]);

    const fetchStudies = useCallback(async (patientId: string) => {
        try {
            const studiesData = await (window as any).electron.db.query(
                'SELECT * FROM studies WHERE patientId = ? ORDER BY studyDate DESC',
                [patientId]
            );

            setStudies(studiesData.map((s: any) => ({
                studyInstanceUID: s.studyInstanceUID,
                studyDate: s.studyDate,
                studyTime: s.studyTime || '',
                studyDescription: s.studyDescription,
                studyID: s.studyID,
                modalitiesInStudy: s.modalitiesInStudy,
                numberOfStudyRelatedSeries: s.numberOfStudyRelatedSeries || 0,
                numberOfStudyRelatedInstances: s.numberOfStudyRelatedInstances || 0,
                patientAge: s.patientAge,
                institutionName: s.institutionName,
                referringPhysicianName: s.referringPhysicianName,
                accessionNumber: s.accessionNumber,
                ImportDateTime: s.ImportDateTime,
                patientId: s.patientId,
                userComments: s.userComments || ''
            })));
        } catch (err) {
            console.error('Fetch studies failed:', err);
        }
    }, []);

    return {
        patients,
        studies,
        error,
        isLoaded,
        refreshData,
        fetchStudies
    };
};
