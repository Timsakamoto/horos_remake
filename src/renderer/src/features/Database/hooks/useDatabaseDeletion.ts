import { useState } from 'react';
import { AntigravityDatabase } from '../db';

interface DeletionTarget {
    type: 'patient' | 'study' | 'series';
    id: string;
    name: string;
}

export const useDatabaseDeletion = (db: AntigravityDatabase | null) => {
    const [deletionTarget, setDeletionTarget] = useState<DeletionTarget | null>(null);
    const [lastDeletionTime, setLastDeletionTime] = useState(0);

    const deleteSeries = async (seriesUid: string, deleteFiles: boolean, skipParentCleanup = false) => {
        if (!db) return;
        try {
            const seriesDoc = await db.series.findOne(seriesUid).exec();
            if (!seriesDoc) return;

            const studyUid = seriesDoc.studyInstanceUID;

            // Delete associated images
            const images = await db.images.find({ selector: { seriesInstanceUID: seriesUid } }).exec();
            for (const img of images) {
                if (deleteFiles && img.filePath) {
                    try {
                        // @ts-ignore
                        await window.electron.unlink(img.filePath);
                    } catch (e) {
                        console.error(`Failed to delete file: ${img.filePath}`, e);
                    }
                }
                await img.remove();
            }

            await seriesDoc.remove();

            if (!skipParentCleanup && studyUid) {
                const remainingSeries = await db.series.count({ selector: { studyInstanceUID: studyUid } }).exec();
                if (remainingSeries === 0) {
                    await deleteStudy(studyUid, deleteFiles);
                }
            }
        } catch (err) {
            console.error('Delete series failed:', err);
        }
    };

    const deleteStudy = async (studyUid: string, deleteFiles: boolean, skipParentCleanup = false) => {
        if (!db) return;
        try {
            const studyDoc = await db.studies.findOne(studyUid).exec();
            if (!studyDoc) return;

            const patientId = studyDoc.patientId;

            const seriesDocs = await db.series.find({ selector: { studyInstanceUID: studyUid } }).exec();
            for (const s of seriesDocs) {
                await deleteSeries(s.seriesInstanceUID, deleteFiles, true);
            }

            await studyDoc.remove();

            if (!skipParentCleanup && patientId) {
                const remainingStudies = await db.studies.count({ selector: { patientId } }).exec();
                if (remainingStudies === 0) {
                    await deletePatient(patientId, deleteFiles);
                }
            }
        } catch (err) {
            console.error('Delete study failed:', err);
        }
    };

    const deletePatient = async (patientId: string, deleteFiles: boolean) => {
        if (!db) return;
        try {
            const studiesDocs = await db.studies.find({ selector: { patientId } }).exec();
            for (const s of studiesDocs) {
                await deleteStudy(s.studyInstanceUID, deleteFiles, true);
            }
            const patientDoc = await db.patients.findOne(patientId).exec();
            if (patientDoc) {
                await patientDoc.remove();
            }
        } catch (err) {
            console.error('Delete patient failed:', err);
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
            if (type === 'patient') await deletePatient(id, deleteFiles);
            else if (type === 'study') await deleteStudy(id, deleteFiles);
            else if (type === 'series') await deleteSeries(id, deleteFiles);
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
