import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { SQLiteManager } from './SQLiteManager';
import { BrowserWindow } from 'electron';
import { JobManager } from '../dicom/JobManager';

export class ImportManager {
    private static instance: ImportManager;
    private isImporting = false;

    public static getInstance(): ImportManager {
        if (!ImportManager.instance) {
            ImportManager.instance = new ImportManager();
        }
        return ImportManager.instance;
    }

    public async importFiles(filePaths: string[]) {
        if (this.isImporting) {
            console.warn('[ImportManager] Import already in progress.');
            return;
        }

        this.isImporting = true;
        const job = JobManager.getInstance().createJob('IMPORT', 'Importing DICOM files', 'Local File System', filePaths.length);
        const db = SQLiteManager.getInstance().getDB();
        const totalFiles = filePaths.length;
        let processedFiles = 0;

        console.log(`[ImportManager] Starting background import of ${totalFiles} files...`);
        JobManager.getInstance().updateJob(job.id, { status: 'active', details: `Processing ${totalFiles} files...` });

        // Split files into batches for workers (Smaller batches for more granular UI updates)
        const batchSize = 25;
        const batches: string[][] = [];
        for (let i = 0; i < filePaths.length; i += batchSize) {
            batches.push(filePaths.slice(i, i + batchSize));
        }

        // Initialize a persistent worker for this import session
        const workerPath = join(__dirname, 'dicomWorker.js');
        const worker = new Worker(workerPath);

        const runBatchOnWorker = (batch: string[]) => {
            return new Promise<any[]>((resolve, reject) => {
                const onMessage = (results: any[]) => {
                    worker.off('error', onError);
                    resolve(results);
                };
                const onError = (err: any) => {
                    worker.off('message', onMessage);
                    reject(err);
                };
                worker.once('message', onMessage);
                worker.once('error', onError);
                worker.postMessage(batch);
            });
        };

        const notifyProgress = (progress: number, message: string) => {
            const wins = BrowserWindow.getAllWindows();
            wins.forEach(w => w.webContents.send('db:importProgress', { progress, message }));

            // Also update JobManager
            JobManager.getInstance().updateJob(job.id, { progress, details: message });
            wins.forEach(w => w.webContents.send('pacs:jobUpdated', JobManager.getInstance().getJobs().find(j => j.id === job.id)));
        };

        try {
            for (let i = 0; i < batches.length; i++) {
                console.log(`[ImportManager] Processing batch ${i + 1}/${batches.length} (${batches[i].length} files)`);
                const results = await runBatchOnWorker(batches[i]);
                console.log(`[ImportManager] Batch ${i + 1} processed. Extracted metadata for ${results.length} files.`);

                // Persist results to SQLite in a single transaction
                const insertTransaction = db.transaction((items) => {
                    for (const item of items) {
                        // Extract folder hint to keep patients separate if IDs collide (e.g. "Anonymous")
                        // We use the two parent directories of the file as a unique hint.
                        const pID = (item.patientID || '').trim();
                        const pName = (item.patientName || '').trim();

                        // Determine if this is an anonymous/legal-blinded patient
                        // We strictly use these patterns ONLY to decide if we should split by folder
                        // (isAnonymous = true) or merge by ID (isAnonymous = false).
                        const isAnonymous =
                            !pID ||
                            pID.toLowerCase().includes('anonymous') ||
                            pID.toLowerCase().includes('annonymous') || // Handle common typos
                            pID.toLowerCase() === 'unknown' ||
                            pID === '0000000' ||
                            pID.toLowerCase().includes('blinded') ||
                            pName.toLowerCase().includes('anonymous') ||
                            pName.toLowerCase().includes('annonymous') ||
                            pName.toLowerCase() === 'unknown' ||
                            pName.toLowerCase().includes('blinded');

                        let folderHint = 'GLOBAL_MERGED'; // Default for "real" patients to merge across folders

                        if (isAnonymous) {
                            try {
                                const normalizedPath = item.filePath.replace(/\\/g, '/');
                                // Use a more granular hint for anonymous data to keep them separated by their folder structure
                                const pathParts = normalizedPath.split('/');
                                if (pathParts.length >= 3) {
                                    folderHint = pathParts.slice(-3, -1).join('/');
                                } else if (pathParts.length >= 2) {
                                    folderHint = pathParts[pathParts.length - 2];
                                }
                            } catch (e) {
                                folderHint = 'ANONYMOUS_FALLBACK';
                            }
                        }

                        // 1. Upsert Patient
                        const patientResult = db.prepare(`
                            INSERT INTO patients (patientName, patientID, patientBirthDate, patientSex, folderHint)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(patientID, folderHint) DO UPDATE SET
                                patientName = excluded.patientName,
                                patientBirthDate = excluded.patientBirthDate,
                                patientSex = excluded.patientSex
                            RETURNING id
                        `).get(pName, pID, item.patientBirthDate, item.patientSex, folderHint) as { id: number };

                        const patientId = patientResult.id;

                        // 2. Upsert Study
                        const studyResult = db.prepare(`
                            INSERT INTO studies (patientId, studyInstanceUID, studyDate, studyDescription, accessionNumber, institutionName)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(studyInstanceUID) DO UPDATE SET
                                patientId = excluded.patientId,
                                studyDate = excluded.studyDate,
                                studyDescription = excluded.studyDescription,
                                accessionNumber = excluded.accessionNumber,
                                institutionName = excluded.institutionName
                            RETURNING id
                        `).get(patientId, item.studyInstanceUID, item.studyDate, item.studyDescription, item.accessionNumber, item.institutionName) as { id: number };

                        const studyId = studyResult.id;

                        // 3. Upsert Series
                        const seriesResult = db.prepare(`
                            INSERT INTO series (studyId, seriesInstanceUID, seriesNumber, modality, seriesDescription, bodyPartExamined, protocolName, frameOfReferenceUID, numberOfFrames)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(seriesInstanceUID) DO UPDATE SET
                                studyId = excluded.studyId,
                                seriesNumber = excluded.seriesNumber,
                                modality = excluded.modality,
                                seriesDescription = excluded.seriesDescription,
                                numberOfFrames = excluded.numberOfFrames
                            RETURNING id
                        `).get(studyId, item.seriesInstanceUID, item.seriesNumber, item.modality, item.seriesDescription, item.bodyPartExamined, item.protocolName, item.frameOfReferenceUID, item.numberOfFrames) as { id: number };

                        const seriesId = seriesResult.id;

                        // 4. Upsert Instance
                        db.prepare(`
                            INSERT INTO instances (
                                seriesId, sopInstanceUID, instanceNumber, filePath, fileSize, 
                                transferSyntaxUID, rows, columns, pixelSpacing, sliceLocation,
                                imagePositionPatient, imageOrientationPatient, windowCenter, windowWidth,
                                rescaleIntercept, rescaleSlope, bitsAllocated, bitsStored, highBit, pixelRepresentation,
                                photometricInterpretation
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(sopInstanceUID) DO UPDATE SET
                                instanceNumber = excluded.instanceNumber,
                                filePath = excluded.filePath,
                                fileSize = excluded.fileSize,
                                rows = excluded.rows,
                                columns = excluded.columns,
                                bitsAllocated = excluded.bitsAllocated,
                                bitsStored = excluded.bitsStored,
                                highBit = excluded.highBit,
                                pixelRepresentation = excluded.pixelRepresentation,
                                photometricInterpretation = excluded.photometricInterpretation,
                                windowCenter = excluded.windowCenter,
                                windowWidth = excluded.windowWidth,
                                rescaleIntercept = excluded.rescaleIntercept,
                                rescaleSlope = excluded.rescaleSlope,
                                pixelSpacing = excluded.pixelSpacing,
                                imagePositionPatient = excluded.imagePositionPatient,
                                imageOrientationPatient = excluded.imageOrientationPatient,
                                sliceLocation = excluded.sliceLocation
                            RETURNING id
                        `).get(
                            seriesId, item.sopInstanceUID, item.instanceNumber, item.filePath, item.fileSize,
                            item.transferSyntaxUID, item.rows, item.columns, item.pixelSpacing, item.sliceLocation,
                            item.imagePositionPatient, item.imageOrientationPatient, item.windowCenter, item.windowWidth,
                            item.rescaleIntercept, item.rescaleSlope, item.bitsAllocated, item.bitsStored, item.highBit, item.pixelRepresentation,
                            item.photometricInterpretation
                        );
                    }
                });

                // @ts-ignore - immediate exists in better-sqlite3 but may not be in current typings
                insertTransaction.immediate(results);

                // Recalculate counts for modified series/studies in this batch
                const affectedSeriesIds = new Set(results.map((r: any) => r.seriesInstanceUID));
                const affectedStudyIds = new Set(results.map((r: any) => r.studyInstanceUID));

                const updateTransaction = db.transaction(() => {
                    for (const sUid of affectedSeriesIds) {
                        // Invalidate thumbnail cache for this series on every import/re-import
                        // to ensure it regenerates with correct metadata/dimensions.
                        db.prepare('DELETE FROM thumbnails WHERE seriesInstanceUID = ?').run(sUid);

                        db.prepare(`
                            UPDATE series SET numberOfSeriesRelatedInstances = (
                                SELECT COUNT(*) FROM instances i JOIN series s ON i.seriesId = s.id WHERE s.seriesInstanceUID = ?
                            ) WHERE seriesInstanceUID = ?
                        `).run(sUid, sUid);
                    }
                    for (const stUid of affectedStudyIds) {
                        db.prepare(`
                            UPDATE studies SET numberOfStudyRelatedInstances = (
                                SELECT COUNT(*) FROM instances i JOIN series s ON i.seriesId = s.id JOIN studies st ON s.studyId = st.id WHERE st.studyInstanceUID = ?
                            ) WHERE studyInstanceUID = ?
                        `).run(stUid, stUid);
                    }
                });
                updateTransaction();

                // Notify renderer that new data is available immediately
                const wins = BrowserWindow.getAllWindows();
                wins.forEach(w => {
                    if (!w.isDestroyed()) {
                        w.webContents.send('db:dataUpdated');
                    }
                });

                processedFiles += batches[i].length;
                const progress = Math.round((processedFiles / totalFiles) * 100);
                notifyProgress(progress, `Importing DICOM data... (${processedFiles}/${totalFiles})`);
            }

            console.log('[ImportManager] Import complete.');
            notifyProgress(100, 'Import successful.');
            JobManager.getInstance().completeJob(job.id);
        } catch (err: any) {
            console.error('[ImportManager] Import failed:', err);
            notifyProgress(100, 'Import failed.');
            JobManager.getInstance().failJob(job.id, err.message);
        } finally {
            worker.terminate();
            this.isImporting = false;
        }
    }
}
