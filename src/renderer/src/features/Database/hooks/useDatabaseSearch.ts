import { useMemo } from 'react';
import { Patient, SearchFilters, SortConfig } from '../types';

export const useDatabaseSearch = (
    patients: Patient[],
    searchFilters: SearchFilters,
    setSearchFilters: (f: SearchFilters) => void,
    sortConfig: SortConfig,
    setSortConfig: (c: SortConfig) => void,
    availableModalities: string[],
    setAvailableModalities: (m: string[]) => void
) => {
    const filteredPatients = useMemo(() => {
        const {
            patientName,
            patientID,
            modalities,
            studyDescription,
            dateRange,
            institutionName,
            userComments
        } = searchFilters as any;

        const customFilter = (searchFilters as any).customFilter;

        // Check if any filters are active
        const hasFilters = patientName || patientID || modalities.length > 0 || studyDescription ||
            dateRange.start || dateRange.end || institutionName || userComments || customFilter;

        if (!hasFilters) {
            return patients;
        }

        return patients.filter(p => {
            // Patient Name Filter
            if (patientName) {
                const searchTerm = patientName.toLowerCase().trim();
                const target = String(p.patientName || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // Patient ID Filter
            if (patientID) {
                const searchTerm = patientID.toLowerCase().trim();
                const target = String(p.patientID || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // Modality Filter
            if (modalities.length > 0) {
                const hasMatchingModality = p.modalities.some(m => modalities.includes(m));
                if (!hasMatchingModality) return false;
            }

            // Date Range Filter
            if (dateRange.start || dateRange.end) {
                const dateToCompare = p.patientBirthDate || p.studyDate;
                if (dateToCompare) {
                    const cleanDate = dateToCompare.replace(/[^0-9]/g, '');
                    if (dateRange.start) {
                        const startDA = dateRange.start.replace(/-/g, '');
                        if (cleanDate < startDA) return false;
                    }
                    if (dateRange.end) {
                        const endDA = dateRange.end.replace(/-/g, '');
                        if (cleanDate > endDA) return false;
                    }
                } else {
                    return false;
                }
            }

            // Study Description Filter
            if (studyDescription) {
                const searchTerm = studyDescription.toLowerCase().trim();
                const target = String(p.studyDescription || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // User Comments Filter
            if (userComments) {
                const searchTerm = userComments.toLowerCase().trim();
                const target = String(p.userComments || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // Institution Name Filter
            if (institutionName) {
                const searchTerm = institutionName.toLowerCase().trim();
                const target = String(p.institutionName || '').toLowerCase();
                if (!target.includes(searchTerm)) return false;
            }

            // Custom Filter (e.g. for Fusion Ready)
            if (customFilter === 'fusion') {
                const modalities = p.modalities || [];
                if (!(modalities.includes('PT') || modalities.includes('NM') || modalities.includes('PET'))) return false;
                if (!modalities.includes('CT')) return false;
            }

            return true;
        });
    }, [patients, searchFilters]);

    return {
        searchFilters,
        setSearchFilters,
        sortConfig,
        setSortConfig,
        availableModalities,
        setAvailableModalities,
        filteredPatients
    };
};
