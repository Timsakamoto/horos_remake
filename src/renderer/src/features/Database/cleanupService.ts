/**
 * Database Cleanup Service (A7)
 * 
 * Detects and repairs database integrity issues:
 * - Orphaned image records (no parent series)
 * - Orphaned series records (no parent study)
 * - Orphaned study records (no parent patient)
 * - Duplicate records
 * - Missing file references
 */

import { AntigravityDatabase } from './db';

export interface CleanupReport {
    orphanedImages: number;
    orphanedSeries: number;
    orphanedStudies: number;
    missingFiles: number;
    totalCleaned: number;
    errors: string[];
}

/**
 * Run a full database integrity check and cleanup
 */
export const runDatabaseCleanup = async (
    db: AntigravityDatabase,
    onProgress?: (message: string, percent: number) => void
): Promise<CleanupReport> => {
    const report: CleanupReport = {
        orphanedImages: 0,
        orphanedSeries: 0,
        orphanedStudies: 0,
        missingFiles: 0,
        totalCleaned: 0,
        errors: []
    };

    try {
        // Step 1: Remove orphaned images (missing parent series)
        onProgress?.('Checking image records...', 10);
        const allImages = await db.images.find().exec();
        const allSeriesUIDs = new Set(
            (await db.series.find().exec()).map(s => s.seriesInstanceUID)
        );

        for (const img of allImages) {
            if (!allSeriesUIDs.has(img.seriesInstanceUID)) {
                try {
                    await img.remove();
                    report.orphanedImages++;
                } catch (e) {
                    report.errors.push(`Failed to remove orphaned image: ${img.sopInstanceUID}`);
                }
            }
        }

        // Step 2: Remove orphaned series (missing parent study)
        onProgress?.('Checking series records...', 30);
        const allSeries = await db.series.find().exec();
        const allStudyUIDs = new Set(
            (await db.studies.find().exec()).map(s => s.studyInstanceUID)
        );

        for (const series of allSeries) {
            if (!allStudyUIDs.has(series.studyInstanceUID)) {
                try {
                    // Also remove child images
                    const childImages = await db.images.find({
                        selector: { seriesInstanceUID: series.seriesInstanceUID }
                    }).exec();
                    for (const img of childImages) {
                        await img.remove();
                        report.orphanedImages++;
                    }
                    await series.remove();
                    report.orphanedSeries++;
                } catch (e) {
                    report.errors.push(`Failed to remove orphaned series: ${series.seriesInstanceUID}`);
                }
            }
        }

        // Step 3: Remove orphaned studies (missing parent patient)
        onProgress?.('Checking study records...', 50);
        const allStudies = await db.studies.find().exec();
        const allPatientIDs = new Set(
            (await db.patients.find().exec()).map(p => p.id)
        );

        for (const study of allStudies) {
            if (!allPatientIDs.has(study.patientId)) {
                try {
                    // Also remove child series and images
                    const childSeries = await db.series.find({
                        selector: { studyInstanceUID: study.studyInstanceUID }
                    }).exec();
                    for (const s of childSeries) {
                        const childImages = await db.images.find({
                            selector: { seriesInstanceUID: s.seriesInstanceUID }
                        }).exec();
                        for (const img of childImages) {
                            await img.remove();
                            report.orphanedImages++;
                        }
                        await s.remove();
                        report.orphanedSeries++;
                    }
                    await study.remove();
                    report.orphanedStudies++;
                } catch (e) {
                    report.errors.push(`Failed to remove orphaned study: ${study.studyInstanceUID}`);
                }
            }
        }

        // Step 4: Check for missing files
        onProgress?.('Verifying file references...', 70);
        const remainingImages = await db.images.find().exec();
        for (const img of remainingImages) {
            try {
                // @ts-ignore - Electron preload API
                const buffer = await window.electron.readFile(img.filePath);
                if (!buffer) {
                    report.missingFiles++;
                }
            } catch {
                report.missingFiles++;
            }
        }

        // Step 5: Remove empty series (0 images)
        onProgress?.('Checking for empty series...', 85);
        const removedEmptyCount = await removeEmptySeries(db);
        report.totalCleaned += removedEmptyCount;

        // Step 6: Update study/series counts
        onProgress?.('Updating record counts...', 95);
        await updateRecordCounts(db);

        report.totalCleaned += report.orphanedImages + report.orphanedSeries + report.orphanedStudies;
        onProgress?.('Cleanup complete', 100);

    } catch (err: any) {
        report.errors.push(`Cleanup error: ${err.message || err}`);
    }

    return report;
};

/**
 * Update numberOfStudyRelatedSeries/Instances and numberOfSeriesRelatedInstances
 */
export const updateRecordCounts = async (db: AntigravityDatabase): Promise<void> => {
    // 1. Update series instance counts in batches
    const allSeries = await db.series.find().exec();
    const seriesChunkSize = 25;
    for (let i = 0; i < allSeries.length; i += seriesChunkSize) {
        const chunk = allSeries.slice(i, i + seriesChunkSize);
        await Promise.all(chunk.map(async (series) => {
            const imageCount = await db.images.count({
                selector: { seriesInstanceUID: series.seriesInstanceUID }
            }).exec();
            return series.incrementalPatch({
                numberOfSeriesRelatedInstances: imageCount
            });
        }));
    }

    // 2. Update study series/instance counts in batches
    const allStudies = await db.studies.find().exec();
    const studyChunkSize = 10;
    for (let i = 0; i < allStudies.length; i += studyChunkSize) {
        const chunk = allStudies.slice(i, i + studyChunkSize);
        await Promise.all(chunk.map(async (study) => {
            const seriesDocs = await db.series.find({
                selector: { studyInstanceUID: study.studyInstanceUID }
            }).exec();

            let totalInstances = 0;
            for (const s of seriesDocs) {
                totalInstances += s.numberOfSeriesRelatedInstances || 0;
            }

            return study.incrementalPatch({
                numberOfStudyRelatedSeries: seriesDocs.length,
                numberOfStudyRelatedInstances: totalInstances
            });
        }));
    }

    // 3. Update patient instance counts
    const allPatients = await db.patients.find().exec();
    for (const patient of allPatients) {
        const studies = await db.studies.find({
            selector: { patientId: patient.id }
        }).exec();

        let totalPatientInstances = 0;
        for (const st of studies) {
            totalPatientInstances += st.numberOfStudyRelatedInstances || 0;
        }

        await patient.incrementalPatch({
            numberOfPatientRelatedInstances: totalPatientInstances
        });
    }
};

/**
 * Remove all empty patients (patients with no studies)
 */
export const removeEmptyPatients = async (db: AntigravityDatabase): Promise<number> => {
    let removed = 0;
    const patients = await db.patients.find().exec();
    for (const patient of patients) {
        const studyCount = await db.studies.count({
            selector: { patientId: patient.id }
        }).exec();
        if (studyCount === 0) {
            await patient.remove();
            removed++;
        }
    }
    return removed;
};
/**
 * Remove any series that have 0 image records
 */
export const removeEmptySeries = async (db: AntigravityDatabase): Promise<number> => {
    let removed = 0;
    const series = await db.series.find().exec();
    for (const s of series) {
        const imageCount = await db.images.count({
            selector: { seriesInstanceUID: s.seriesInstanceUID }
        }).exec();
        if (imageCount === 0) {
            await s.remove();
            removed++;
        }
    }
    return removed;
};
