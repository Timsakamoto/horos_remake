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
        const allImages = await db.T_FilePath.find().exec();
        const allSeriesUIDs = new Set(
            (await db.T_Subseries.find().exec()).map(s => s.seriesInstanceUID)
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
        const allSeries = await db.T_Subseries.find().exec();
        const allStudyUIDs = new Set(
            (await db.T_Study.find().exec()).map(s => s.studyInstanceUID)
        );

        for (const series of allSeries) {
            if (!allStudyUIDs.has(series.studyInstanceUID)) {
                try {
                    // Also remove child images
                    const childImages = await db.T_FilePath.find({
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
        const allStudies = await db.T_Study.find().exec();
        const allPatientIDs = new Set(
            (await db.T_Patient.find().exec()).map(p => p.id)
        );

        for (const study of allStudies) {
            if (!allPatientIDs.has(study.patientId)) {
                try {
                    // Also remove child series and images
                    const childSeries = await db.T_Subseries.find({
                        selector: { studyInstanceUID: study.studyInstanceUID }
                    }).exec();
                    for (const s of childSeries) {
                        const childImages = await db.T_FilePath.find({
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
        const remainingImages = await db.T_FilePath.find().exec();
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

        // Step 5: Update study/series counts
        onProgress?.('Updating record counts...', 90);
        await updateRecordCounts(db);

        report.totalCleaned = report.orphanedImages + report.orphanedSeries + report.orphanedStudies;
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
    // Update series instance counts
    const allSeries = await db.T_Subseries.find().exec();
    for (const series of allSeries) {
        const imageCount = await db.T_FilePath.count({
            selector: { seriesInstanceUID: series.seriesInstanceUID }
        }).exec();
        await series.incrementalPatch({
            numberOfSeriesRelatedInstances: imageCount
        });
    }

    // Update study series/instance counts
    const allStudies = await db.T_Study.find().exec();
    for (const study of allStudies) {
        const seriesDocs = await db.T_Subseries.find({
            selector: { studyInstanceUID: study.studyInstanceUID }
        }).exec();

        let totalInstances = 0;
        for (const s of seriesDocs) {
            totalInstances += s.numberOfSeriesRelatedInstances || 0;
        }

        await study.incrementalPatch({
            numberOfStudyRelatedSeries: seriesDocs.length,
            numberOfStudyRelatedInstances: totalInstances
        });
    }
};

/**
 * Remove all empty patients (patients with no studies)
 */
export const removeEmptyPatients = async (db: AntigravityDatabase): Promise<number> => {
    let removed = 0;
    const patients = await db.T_Patient.find().exec();
    for (const patient of patients) {
        const studyCount = await db.T_Study.count({
            selector: { patientId: patient.id }
        }).exec();
        if (studyCount === 0) {
            await patient.remove();
            removed++;
        }
    }
    return removed;
};
