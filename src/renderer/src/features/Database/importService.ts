import { AntigravityDatabase } from './db';
import { parseDicombuffer } from '../../utils/dicomParser';
import { PACSClient, PACSServer } from '../PACS/pacsClient';
import { updateRecordCounts } from './cleanupService';

export const importFiles = async (
    db: AntigravityDatabase,
    filePaths: string[],
    copyToDatabase: boolean = false,
    onProgress?: (progress: number, message: string) => void,
    customManagedDir?: string | null
) => {
    console.log(`ImportService: Processing ${filePaths.length} entries (copy=${copyToDatabase})...`);
    onProgress?.(0, 'Initializing import...');

    const allFilePaths: string[] = [];
    let managedDir: string | null = customManagedDir || null;

    // Batched data collection
    const patientsMap = new Map<string, any>();
    const studiesMap = new Map<string, any>();
    const seriesMap = new Map<string, any>();
    const images: any[] = [];

    if (copyToDatabase && !managedDir) {
        // @ts-ignore
        const userData = await window.electron.getPath('userData');
        // @ts-ignore
        managedDir = await window.electron.join(userData, 'PeregrineData', 'DICOM');
    }

    if (managedDir) {
        console.log(`ImportService: Using managedDir: ${managedDir}`);
        // @ts-ignore
        await window.electron.ensureDir(managedDir);
    }

    // 1. Resolve all directories into file paths
    onProgress?.(5, 'Scanning directories...');
    for (let i = 0; i < filePaths.length; i++) {
        const path = filePaths[i];
        try {
            // @ts-ignore
            const files = await window.electron.readdirRecursive(path);
            if (files && files.length > 0) {
                allFilePaths.push(...files);
            } else {
                allFilePaths.push(path);
            }
        } catch (e) {
            allFilePaths.push(path);
        }
    }

    console.log(`ImportService: Normalized to ${allFilePaths.length} files.`);
    const totalFiles = allFilePaths.length;
    let importedCount = 0;
    let skipped = 0;

    for (let i = 0; i < totalFiles; i++) {
        const filePath = allFilePaths[i];
        const progress = 10 + Math.round((i / totalFiles) * 80);
        const fileName = filePath.split(/[/\\]/).pop();
        onProgress?.(progress, `Processing ${fileName}... (${importedCount} ready)`);

        console.log(`ImportService: Starting processing for file: ${filePath}`);

        try {
            // Read first to get metadata for path generation
            // @ts-ignore
            const buffer = await window.electron.readFile(filePath);
            if (!buffer) {
                skipped++;
                console.warn(`ImportService: Skipped empty or unreadable file: ${filePath}`);
                continue;
            }

            const meta = parseDicombuffer(buffer);
            if (!meta) {
                skipped++;
                console.warn(`ImportService: Skipped non-DICOM file or failed to parse: ${filePath}`);
                continue;
            }

            let finalPath = filePath;

            if (copyToDatabase && managedDir) {
                const rawPatientID = String(meta.patientID || 'UNKNOWN');
                const rawPatientName = String(meta.patientName || 'Unknown');
                const rawBirthDate = String(meta.patientBirthDate || '');
                const rawSex = String(meta.patientSex || '');
                const patientGlobalId = `${rawPatientID}_${rawPatientName}_${rawBirthDate}_${rawSex}`
                    .replace(/[^a-zA-Z0-9]/g, '_');

                const safeStudy = String(meta.studyInstanceUID).replace(/[^a-zA-Z0-9.-]/g, '_');
                const safeSeries = String(meta.seriesInstanceUID).replace(/[^a-zA-Z0-9.-]/g, '_');
                const safeSOP = String(meta.sopInstanceUID).replace(/[^a-zA-Z0-9.-]/g, '_');

                // @ts-ignore
                const patientDir = await window.electron.join(managedDir, patientGlobalId);
                // @ts-ignore
                const studyDir = await window.electron.join(patientDir, safeStudy);
                // @ts-ignore
                const seriesDir = await window.electron.join(studyDir, safeSeries);
                // @ts-ignore
                await window.electron.ensureDir(seriesDir);
                // @ts-ignore
                const dest = await window.electron.join(seriesDir, `${safeSOP}.dcm`);

                // @ts-ignore
                const success = await window.electron.copyFile(filePath, dest);
                if (success) finalPath = dest;
            }

            // Collect Metadata in Memory
            const { patient, study, series, image } = prepareMetadata(meta, finalPath, Number(buffer.byteLength) || 0, managedDir);

            patientsMap.set(patient.id, patient);
            studiesMap.set(study.studyInstanceUID, study);
            seriesMap.set(series.seriesInstanceUID, series);
            images.push(image);

            importedCount++;
        } catch (error) {
            console.error(`ImportService: Error processing ${filePath}:`, error);
            skipped++;
        }
    }

    // 2. Final Batch Commit
    if (importedCount > 0) {
        onProgress?.(92, `Committing ${importedCount} images to database...`);
        console.log(`ImportService: Committing batches (P:${patientsMap.size}, St:${studiesMap.size}, Se:${seriesMap.size}, Im:${images.length})`);

        try {
            await db.T_Patient.bulkUpsert(Array.from(patientsMap.values()));
            await db.T_Study.bulkUpsert(Array.from(studiesMap.values()));
            await db.T_Subseries.bulkUpsert(Array.from(seriesMap.values()));
            await db.T_FilePath.bulkUpsert(images);
        } catch (err) {
            console.error('ImportService: Bulk Commit Failed:', err);
            throw err;
        }
    }

    // Update record counts after import
    onProgress?.(96, 'Updating database statistics...');
    try {
        await updateRecordCounts(db);
    } catch (e) {
        console.error('ImportService: Failed to update record counts:', e);
    }

    onProgress?.(100, `Import complete: ${importedCount} imported, ${skipped} skipped`);
    console.log(`ImportService: Complete. ${importedCount} imported, ${skipped} skipped.`);
};

const prepareMetadata = (
    meta: any,
    filePath: string,
    fileSize: number,
    managedDir?: string | null
) => {
    // 1. Generate a robust composite patient key
    const rawPatientID = String(meta.patientID || 'UNKNOWN').trim();
    const rawPatientName = String(meta.patientName || 'Unknown').trim();
    const rawBirthDate = String(meta.patientBirthDate || '').trim();
    const rawSex = String(meta.patientSex || '').trim();
    const rawIssuer = String(meta.issuerOfPatientID || '').trim();
    const rawInst = String(meta.institutionName || '').trim();

    // Determine if this is a "generic" patient ID that shouldn't be used for global grouping
    // Peregrine/OsiriX usually separates these if other metadata or sources differ.
    const isGenericID = /^(0+|anonymous|unknown|none|no_id|unknownid)$/i.test(rawPatientID) || !rawPatientID;

    let patientGlobalId: string;
    if (isGenericID) {
        // For generic/anonymous IDs, include institution and potentially more fields to avoid collisions.
        // This addresses the user's issue where different "Anonymous" patients were merged.
        patientGlobalId = `GEN_${rawPatientID}_${rawPatientName}_${rawInst}_${rawBirthDate}`
    } else {
        // For standard IDs, include Issuer (if any) to qualify the ID.
        patientGlobalId = `${rawPatientID}_${rawIssuer}_${rawPatientName}_${rawBirthDate}`;
    }

    patientGlobalId = patientGlobalId.replace(/[^a-zA-Z0-9]/g, '_');

    // Store relative path if it's within the managed directory
    let storedPath = filePath;
    if (managedDir && filePath.startsWith(managedDir)) {
        storedPath = filePath.slice(managedDir.length).replace(/^[/\\]+/, '');
    }

    const patient = {
        id: patientGlobalId,
        patientName: rawPatientName,
        patientID: rawPatientID,
        patientBirthDate: rawBirthDate,
        patientSex: rawSex,
        issuerOfPatientID: rawIssuer,
        institutionName: rawInst,
        patientNameNormalized: rawPatientName.toLowerCase()
    };

    const study = {
        studyInstanceUID: String(meta.studyInstanceUID),
        studyDate: String(meta.studyDate || ''),
        studyTime: String(meta.studyTime || ''),
        accessionNumber: String(meta.accessionNumber || ''),
        studyDescription: String(meta.studyDescription || ''),
        studyID: String(meta.studyID || ''),
        modalitiesInStudy: Array.isArray(meta.modalitiesInStudy) ? meta.modalitiesInStudy.map(String) : [String(meta.modality || 'OT')],
        numberOfStudyRelatedSeries: 0,
        numberOfStudyRelatedInstances: 0,
        patientAge: String(meta.patientAge || ''),
        institutionName: String(meta.institutionName || ''),
        referringPhysicianName: String(meta.referringPhysicianName || ''),
        ImportDateTime: new Date().toISOString(),
        patientId: patientGlobalId,
        status: ((meta.isRemote || !filePath) ? 'pending' : 'local') as 'pending' | 'local',
        isRemote: !!meta.isRemote,
        studyDescriptionNormalized: String(meta.studyDescription || '').toLowerCase()
    };

    const series = {
        seriesInstanceUID: String(meta.seriesInstanceUID),
        modality: String(meta.modality || ''),
        seriesDate: String(meta.seriesDate || ''),
        seriesDescription: String(meta.seriesDescription || ''),
        seriesNumber: Number(meta.seriesNumber) || 0,
        numberOfSeriesRelatedInstances: 0,
        bodyPartExamined: String(meta.bodyPartExamined || ''),
        protocolName: String(meta.protocolName || ''),
        studyInstanceUID: String(meta.studyInstanceUID)
    };

    const image = {
        sopInstanceUID: String(meta.sopInstanceUID),
        instanceNumber: Number(meta.instanceNumber) || 0,
        numberOfFrames: Number(meta.numberOfFrames) || 1,
        sopClassUID: String(meta.sopClassUID || ''),
        filePath: storedPath,
        fileSize: fileSize,
        transferSyntaxUID: String(meta.transferSyntaxUID || ''),
        seriesInstanceUID: String(meta.seriesInstanceUID),
        windowCenter: Number(meta.windowCenter) || 40,
        windowWidth: Number(meta.windowWidth) || 400,
        rescaleIntercept: Number(meta.rescaleIntercept) || 0,
        rescaleSlope: Number(meta.rescaleSlope) || 1,
        imagePositionPatient: meta.imagePositionPatient ? String(meta.imagePositionPatient).split(/\\+/).map(Number).filter(n => !isNaN(n)) : undefined,
        imageOrientationPatient: meta.imageOrientationPatient ? String(meta.imageOrientationPatient).split(/\\+/).map(Number).filter(n => !isNaN(n)) : undefined,
        pixelSpacing: meta.pixelSpacing ? String(meta.pixelSpacing).split(/\\+/).map(Number).filter(n => !isNaN(n)) : undefined,
        sliceThickness: Number(meta.sliceThickness) || undefined
    };

    // --- ★ 32-BIT FLOAT UPGRADE (Peregrine Style) ---
    // Patch the metadata so that loaders/viewers treat it as 32-bit float if it's a cross-sectional modality
    const canPatch = ['CT', 'MR', 'PT', 'NM'].includes(series.modality);
    const intercept = image.rescaleIntercept;
    const slope = image.rescaleSlope;
    // Photometric Interpretation check: only for Grayscale
    const photo = String(meta.photometricInterpretation || '');
    const willPatch = !photo.includes('RGB') && (canPatch || intercept !== 0 || slope !== 1);

    if (willPatch) {
        // We lift the raw values to Physical (HU/etc) units at import/metadata level
        // so that the Viewer can treat them as normalized 32-bit floats.
        image.windowCenter = (image.windowCenter * slope) + intercept;
        image.windowWidth = image.windowWidth * slope;
        image.rescaleIntercept = 0;
        image.rescaleSlope = 1;
    }

    return { patient, study, series, image };
};

// Legacy single-file import (unused internally now but kept for minor updates if needed)
export const importMetadata = async (
    db: AntigravityDatabase,
    meta: any,
    filePath: string,
    fileSize: number,
    managedDir?: string | null
) => {
    const { patient, study, series, image } = prepareMetadata(meta, filePath, fileSize, managedDir);
    await db.T_Patient.upsert(patient);
    await db.T_Study.upsert(study);
    await db.T_Subseries.upsert(series);
    await db.T_FilePath.upsert(image);
};

export const importStudyFromPACS = async (
    db: AntigravityDatabase,
    server: PACSServer,
    studyInstanceUID: string,
    onProgress?: (msg: string) => void
) => {
    console.log(`ImportService: Downloading study ${studyInstanceUID} from PACS ${server.name}...`);
    const client = new PACSClient(server);

    // @ts-ignore
    const userDataPath = await window.electron.getPath('userData');
    const storageRoot = `${userDataPath}/PeregrineDatabase`;

    try {
        onProgress?.('Fetching Series List...');
        const seriesList = await client.searchSeries(studyInstanceUID);

        for (const seriesObj of seriesList) {
            const seriesInstanceUID = seriesObj['0020000E'].Value[0];
            onProgress?.(`Fetching Instances for series ${seriesInstanceUID.substring(0, 8)}...`);

            const instanceList = await client.fetchInstances(studyInstanceUID, seriesInstanceUID);

            for (const instanceObj of instanceList) {
                const sopInstanceUID = instanceObj['00080018'].Value[0];
                const instanceNumber = instanceObj['00200013']?.Value?.[0] || '0';

                onProgress?.(`Downloading Instance ${instanceNumber}...`);

                const buffer = await client.fetchInstanceBytes(studyInstanceUID, seriesInstanceUID, sopInstanceUID);
                if (!buffer) continue;

                const fileName = `${sopInstanceUID}.dcm`;
                const filePath = `${storageRoot}/${studyInstanceUID}/${seriesInstanceUID}/${fileName}`;

                // Write to local FS
                // @ts-ignore
                await window.electron.writeFile(filePath, new Uint8Array(buffer));

                // Parse and Import to RxDB
                const meta = parseDicombuffer(buffer);
                if (meta) {
                    await importMetadata(db, meta, filePath, buffer.byteLength || 0);
                }
            }
        }

        // Update counts after PACS import
        await updateRecordCounts(db);

        console.log('ImportService: PACS Download complete.');
    } catch (error) {
        console.error('ImportService: PACS Download Error:', error);
        throw error;
    }
};
