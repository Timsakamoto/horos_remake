import { AntigravityDatabase } from './db';
import { parseDicombuffer } from '../../utils/dicomParser';
import { PACSClient, PACSServer } from '../PACS/pacsClient';
import { updateRecordCounts } from './cleanupService';

// Cine SOP Classes (XA, RF, US Multi-frame, Video Endoscopic, etc.)
const CINE_SOP_CLASSES = [
    '1.2.840.10008.5.1.4.1.1.12.1', '1.2.840.10008.5.1.4.1.1.12.2',
    '1.2.840.10008.5.1.4.1.1.3.1', '1.2.840.10008.5.1.4.1.1.77.1.1.1',
    '1.2.840.10008.5.1.4.1.1.77.1.2.1', '1.2.840.10008.5.1.4.1.1.77.1.4.1'
];

// Enhanced Static Classes (NOT Cine) - Enhanced MR/CT/PET
const ENHANCED_STATIC_SOP_CLASSES = [
    '1.2.840.10008.5.1.4.1.1.2.1', '1.2.840.10008.5.1.4.1.1.4.1',
    '1.2.840.10008.5.1.4.1.1.128.1'
];

const isCineData = (files: any[]): boolean => {
    // 1. Playback/Multi-frame tags (Prioritized)
    const hasCineTag = files.some(f => {
        if ((f.frameTime || 0) > 0) return true;
        if ((f.recommendedDisplayFrameRate || 0) > 0) return true;
        if ((f.cineRate || 0) > 0) return true;
        if ((f.cardiacNumberOfImages || 0) > 0) return true;
        if (CINE_SOP_CLASSES.includes(f.sopClassUID)) return true;
        if (f.numberOfFrames > 1 && !ENHANCED_STATIC_SOP_CLASSES.includes(f.sopClassUID)) return true;

        const desc = (f.seriesDescription || '').toUpperCase();
        const type = (f.imageType || '').toUpperCase();
        return desc.includes('CINE') || desc.includes('CARDIAC') || desc.includes('FLOW') || type.includes('CINE');
    });

    if (hasCineTag) return true;

    // 2. Varied Trigger Time at same location (Temporal)
    const triggerTimes = new Set(files.map(f => f.triggerTime).filter(v => v !== undefined && v !== null));
    return triggerTimes.size > 1;
};

// Robust Split Logic (Peregrine Style)
const splitSeriesIntoVolumes = (files: any[]): Map<string, any[]> => {
    // 1. Initial Priority Sort: Z-Coordinate then Time
    const sorted = [...files].sort((a, b) => {
        const az = a.imagePositionPatient ? a.imagePositionPatient[2] : 0;
        const bz = b.imagePositionPatient ? b.imagePositionPatient[2] : 0;
        if (Math.abs(az - bz) > 0.001) return az - bz;
        return (a.acquisitionTime || 0) - (b.acquisitionTime || 0);
    });

    const splitMap = new Map<string, any[]>();

    // Tracking structures for interleaved/duplicate prevention
    const volumeIndexSets: Set<string>[] = []; // Array of Sets (one per volume) containing IPP keys

    for (const img of sorted) {
        const ipp = img.imagePositionPatient || [0, 0, 0];
        // Use full IPP triplet as the key to detect identical spatial locations
        const posKey = ipp.map((n: number) => Math.floor(n * 100) / 100).join(',');

        // Multi-tier Explicit Indexing
        let explicitIndex: string | null = null;
        if (img.temporalPositionIndex !== undefined) explicitIndex = `T${img.temporalPositionIndex}`;
        else if (img.stackID !== undefined) explicitIndex = `S${img.stackID}`;
        else if (img.diffusionBValue !== undefined) explicitIndex = `B${img.diffusionBValue}`;

        if (explicitIndex) {
            // Tier 1 & 2: Explicit Metadata Splits
            if (!splitMap.has(explicitIndex)) splitMap.set(explicitIndex, []);
            splitMap.get(explicitIndex)!.push(img);

            // Generate Label
            if (img.diffusionBValue !== undefined) img._splitLabel = `b=${img.diffusionBValue}`;
            else if (img.temporalPositionIndex !== undefined) img._splitLabel = `Phase ${img.temporalPositionIndex}`;
            else img._splitLabel = explicitIndex;
        } else {
            // Tier 3: IPP Repetition (Legacy /造影フェーズ / Interleaved)
            // Bucket assignment: Find the first volume that doesn't already have this exact position
            let volIdx = -1;
            for (let i = 0; i < volumeIndexSets.length; i++) {
                if (!volumeIndexSets[i].has(posKey)) {
                    volIdx = i;
                    break;
                }
            }

            if (volIdx === -1) {
                // New bucket needed
                volIdx = volumeIndexSets.length;
                volumeIndexSets.push(new Set<string>());
            }

            volumeIndexSets[volIdx].add(posKey);
            const splitKey = `vol_${volIdx + 1}`;
            if (!splitMap.has(splitKey)) splitMap.set(splitKey, []);
            splitMap.get(splitKey)!.push(img);

            // Labeling fallback
            if (volIdx > 0) img._splitLabel = `Vol ${volIdx + 1}`;
        }
    }

    return splitMap;
};

// Prepare metadata for db
const prepareMetadata = (meta: any, filePath: string, fileSize: number, managedDir?: string | null) => {
    const rawPatientID = String(meta.patientID || 'UNKNOWN').trim();
    const rawPatientName = String(meta.patientName || 'Unknown').trim();
    const rawBirthDate = String(meta.patientBirthDate || '').trim();
    const rawInst = String(meta.institutionName || '').trim();
    const isAnonymous = !rawPatientID || rawPatientID === '0000000' || rawPatientName === 'Anonymous';
    let folderHint = '';
    if (isAnonymous) {
        // Use a more specific folder hint: the folder two levels up from the file (usually the Study or Patient folder)
        const parts = filePath.split(/[/\\]/);
        if (parts.length > 3) {
            folderHint = parts[parts.length - 3];
        } else {
            folderHint = parts[parts.length - 2] || '';
        }
    }

    const patientGlobalId = `${rawPatientID}_${rawPatientName}_${rawInst}_${rawBirthDate}${folderHint ? '_' + folderHint : ''}`.replace(/[^a-zA-Z0-9]/g, '_');

    let storedPath = filePath;
    if (managedDir && filePath.startsWith(managedDir)) {
        storedPath = filePath.slice(managedDir.length).replace(/^[/\\]+/, '');
    }

    const patient = {
        id: patientGlobalId,
        patientName: rawPatientName,
        patientID: rawPatientID,
        patientBirthDate: rawBirthDate,
        patientSex: String(meta.patientSex || '').trim(),
        institutionName: rawInst,
        patientNameNormalized: rawPatientName.toLowerCase(),
        lastImportDateTime: new Date().toISOString()
    };

    const study = {
        studyInstanceUID: String(meta.studyInstanceUID),
        studyDate: String(meta.studyDate || ''),
        studyTime: String(meta.studyTime || ''),
        studyDescription: String(meta.studyDescription || ''),
        studyID: String(meta.studyID || ''),
        patientId: patientGlobalId,
        patientAge: String(meta.patientAge || ''),
        accessionNumber: String(meta.accessionNumber || ''),
        institutionName: String(meta.institutionName || ''),
        referringPhysicianName: String(meta.referringPhysicianName || ''),
        numberOfStudyRelatedInstances: Number(meta.numberOfStudyRelatedInstances) || 0,
        modalitiesInStudy: [String(meta.modality || 'OT')],
        ImportDateTime: new Date().toISOString(),
        studyDescriptionNormalized: String(meta.studyDescription || '').toLowerCase()
    };

    // --- Smart Windowing Logic ---
    let wc = Number(meta.windowCenter);
    let ww = Number(meta.windowWidth);

    if (isNaN(wc) || isNaN(ww) || ww <= 0) {
        // Fallback for missing/invalid window tags
        if (meta.modality === 'CT') {
            wc = 40; ww = 400; // Standard Soft Tissue
        } else if (meta.modality === 'PT') {
            wc = 0; ww = 32767; // Wide for SUV
        } else {
            // CR/DX/MR/US etc. - use bitsStored to estimate range
            const bits = Number(meta.bitsStored) || 12;
            const maxVal = Math.pow(2, bits) - 1;
            ww = maxVal;
            wc = maxVal / 2;
        }
    }

    const series = {
        seriesInstanceUID: String(meta.seriesInstanceUID),
        dicomSeriesInstanceUID: String(meta.seriesInstanceUID),
        modality: String(meta.modality || ''),
        seriesDescription: String(meta.seriesDescription || ''),
        seriesNumber: Number(meta.seriesNumber) || 0,
        studyInstanceUID: String(meta.studyInstanceUID),
        frameOfReferenceUID: meta.frameOfReferenceUID ? String(meta.frameOfReferenceUID) : undefined,
        ImportDateTime: new Date().toISOString()
    };

    const image = {
        sopInstanceUID: String(meta.sopInstanceUID),
        instanceNumber: Number(meta.instanceNumber) || 0,
        numberOfFrames: Number(meta.numberOfFrames) || 1,
        sopClassUID: String(meta.sopClassUID || ''),
        filePath: storedPath,
        fileSize: fileSize,
        seriesInstanceUID: String(meta.seriesInstanceUID),
        dicomSeriesInstanceUID: String(meta.seriesInstanceUID),
        frameOfReferenceUID: meta.frameOfReferenceUID ? String(meta.frameOfReferenceUID) : undefined,

        // Metadata for splitting/Cine
        acquisitionNumber: Number(meta.acquisitionNumber) || 0,
        echoNumber: meta.echoNumber,
        imageType: Array.isArray(meta.imageType) ? meta.imageType.join('\\') : String(meta.imageType || ''),
        diffusionBValue: meta.diffusionBValue,
        acquisitionTime: meta.acquisitionTime,
        temporalPositionIndex: meta.temporalPositionIndex,
        stackID: meta.stackID,
        frameTime: meta.frameTime,
        recommendedDisplayFrameRate: meta.recommendedDisplayFrameRate,
        cineRate: meta.cineRate,
        cardiacNumberOfImages: meta.cardiacNumberOfImages,
        triggerTime: meta.triggerTime,

        imagePositionPatient: meta.imagePositionPatient ? String(meta.imagePositionPatient).split(/\\+/).map(Number).filter(n => !isNaN(n)) : undefined,
        imageOrientationPatient: meta.imageOrientationPatient ? String(meta.imageOrientationPatient).split(/\\+/).map(Number).filter(n => !isNaN(n)) : undefined,
        pixelSpacing: meta.pixelSpacing ? String(meta.pixelSpacing).split(/\\+/).map(Number).filter(n => !isNaN(n)) : undefined,
        windowCenter: wc,
        windowWidth: ww,
        rescaleIntercept: Number(meta.rescaleIntercept) || 0,
        rescaleSlope: Number(meta.rescaleSlope) || 1,
        photometricInterpretation: String(meta.photometricInterpretation || 'MONOCHROME2')
    };

    return { patient, study, series, image };
};

export const importFiles = async (
    db: AntigravityDatabase,
    filePaths: string[],
    copyToDatabase: boolean = false,
    onProgress?: (progress: number, message: string) => void,
    customManagedDir?: string | null
) => {
    onProgress?.(0, 'Initializing import...');
    const allFilePaths: string[] = [];
    let managedDir: string | null = customManagedDir || null;

    if (copyToDatabase && !managedDir) {
        // @ts-ignore
        const userData = await window.electron.getPath('userData');
        // @ts-ignore
        managedDir = await window.electron.join(userData, 'PeregrineData', 'DICOM');
    }

    // Always resolve files recursively to ensure all DICOMs are found
    for (const path of filePaths) {
        try {
            // @ts-ignore
            const s = await window.electron.stat(path);
            if (s && s.isDirectory) {
                // @ts-ignore
                const files = await window.electron.readdirRecursive(path);
                if (files && files.length > 0) allFilePaths.push(...files);
            } else {
                allFilePaths.push(path);
            }
        } catch (e) {
            allFilePaths.push(path);
        }
    }

    const totalFiles = allFilePaths.length;
    const patientsMap = new Map<string, any>();
    const studiesMap = new Map<string, any>();
    const tempGroupMap = new Map<string, any>();

    const batchSize = 100;
    for (let i = 0; i < totalFiles; i += batchSize) {
        const batch = allFilePaths.slice(i, i + batchSize);
        onProgress?.(10 + Math.round((i / totalFiles) * 70), `Processing DICOM files... (${i}/${totalFiles})`);

        await Promise.all(batch.map(async (filePath) => {
            try {
                // @ts-ignore
                const buffer = await window.electron.readFile(filePath);
                if (!buffer) return;
                const meta = parseDicombuffer(buffer);
                if (!meta) return;

                let finalPath = filePath;
                if (copyToDatabase && managedDir) {
                    // @ts-ignore
                    const dest = await window.electron.join(managedDir, meta.patientID, meta.studyInstanceUID, meta.seriesInstanceUID, `${meta.sopInstanceUID}.dcm`);
                    // @ts-ignore
                    await window.electron.ensureDir(await window.electron.dirname(dest));
                    // @ts-ignore
                    if (await window.electron.copyFile(filePath, dest)) finalPath = dest;
                }

                const { patient, study, series, image } = prepareMetadata(meta, finalPath, buffer.byteLength, managedDir);
                patientsMap.set(patient.id, patient);
                studiesMap.set(study.studyInstanceUID, study);

                if (!tempGroupMap.has(series.dicomSeriesInstanceUID)) {
                    tempGroupMap.set(series.dicomSeriesInstanceUID, { template: series, images: [] });
                }
                tempGroupMap.get(series.dicomSeriesInstanceUID).images.push(image);
            } catch (e) {
                console.warn(`Failed to process file: ${filePath}`, e);
            }
        }));
    }

    // Apply Splitting
    const finalSeries: any[] = [];
    const finalImages: any[] = [];

    for (const [origUID, group] of tempGroupMap) {
        if (isCineData(group.images)) {
            // Cine -> Single series
            group.template.numberOfSeriesRelatedInstances = group.images.length;
            finalSeries.push(group.template);
            finalImages.push(...group.images);
        } else {
            // Volume Split
            const splitMap = splitSeriesIntoVolumes(group.images);
            if (splitMap.size <= 1) {
                group.template.numberOfSeriesRelatedInstances = group.images.length;
                finalSeries.push(group.template);
                finalImages.push(...group.images);
            } else {
                for (const [splitKey, imgs] of splitMap) {
                    if (imgs.length === 0) continue; // Skip empty volumes

                    const first = imgs[0];
                    const suffix = first._splitLabel ? ` (${first._splitLabel})` : '';
                    const newUID = `${origUID}_${splitKey}`;

                    finalSeries.push({
                        ...group.template,
                        seriesInstanceUID: newUID,
                        seriesDescription: (group.template.seriesDescription + suffix).trim(),
                        numberOfSeriesRelatedInstances: imgs.length,
                        ImportDateTime: new Date().toISOString()
                    });

                    for (const img of imgs) {
                        img.seriesInstanceUID = newUID;
                        finalImages.push(img);
                    }
                }
            }
        }
    }

    // Commit
    onProgress?.(90, 'Committing records to database...');
    try {
        // Patients & Studies are few, upsert them together
        await Promise.all(Array.from(patientsMap.values()).map(p => db.patients.upsert(p)));
        await Promise.all(Array.from(studiesMap.values()).map(s => db.studies.upsert(s)));
        await Promise.all(finalSeries.map(s => db.series.upsert(s)));

        // Images can be thousands, chunk them
        const imageBatchSize = 100;
        for (let i = 0; i < finalImages.length; i += imageBatchSize) {
            const batch = finalImages.slice(i, i + imageBatchSize);
            onProgress?.(90 + Math.floor((i / finalImages.length) * 10), `Saving images... (${i}/${finalImages.length})`);
            await Promise.all(batch.map(img => db.images.upsert(img)));
        }

        console.log(`Database save successful: ${finalImages.length} images`);
    } catch (err) {
        console.error('Database commit failed during import:', err);
        throw err;
    }

    await updateRecordCounts(db);
    onProgress?.(100, 'Import Complete');
};

/**
 * Targeted count update for a specific study/series/patient
 */
export const updateTargetedCounts = async (db: AntigravityDatabase, studyInstanceUID: string) => {
    const studyDoc = await db.studies.findOne(studyInstanceUID).exec();
    if (!studyDoc) return;

    const seriesDocs = await db.series.find({
        selector: { studyInstanceUID }
    }).exec();

    let totalStudyInstances = 0;
    for (const s of seriesDocs) {
        const imageCount = await db.images.count({
            selector: { seriesInstanceUID: s.seriesInstanceUID }
        }).exec();

        await s.incrementalPatch({ numberOfSeriesRelatedInstances: imageCount });
        totalStudyInstances += imageCount;
    }

    const studyViewModalities = Array.from(new Set(seriesDocs.map(s => s.modality).filter(Boolean)));

    await studyDoc.incrementalPatch({
        numberOfStudyRelatedSeries: seriesDocs.length,
        numberOfStudyRelatedInstances: totalStudyInstances,
        modalitiesInStudy: studyViewModalities,
        ImportDateTime: new Date().toISOString()
    });

    // Also update patient
    const patientDoc = await db.patients.findOne(studyDoc.patientId).exec();
    if (patientDoc) {
        const allStudies = await db.studies.find({
            selector: { patientId: patientDoc.id }
        }).exec();

        const totalPatientInstances = allStudies.reduce((acc, st) => acc + (st.numberOfStudyRelatedInstances || 0), 0);
        await patientDoc.incrementalPatch({
            numberOfPatientRelatedInstances: totalPatientInstances,
            lastImportDateTime: new Date().toISOString()
        });
    }
};

export const importMetadata = async (db: AntigravityDatabase, meta: any, filePath: string, fileSize: number, managedDir?: string | null) => {
    const { patient, study, series, image } = prepareMetadata(meta, filePath, fileSize, managedDir);

    await db.patients.upsert(patient);
    await db.studies.upsert(study);
    await db.series.upsert(series);
    await db.images.upsert(image);

    // Update counts and timestamps to ensure UI reflects the new/updated data
    await updateTargetedCounts(db, study.studyInstanceUID);
};

export const importStudyFromPACS = async (db: AntigravityDatabase, server: PACSServer, studyInstanceUID: string, _onProgress?: (msg: string) => void) => {
    const client = new PACSClient(server);
    // @ts-ignore
    const userDataPath = await window.electron.getPath('userData');
    try {
        const seriesList = await client.searchSeries(studyInstanceUID);
        for (const s of seriesList) {
            const seriesUID = s['0020000E'].Value[0];
            const instanceList = await client.fetchInstances(studyInstanceUID, seriesUID);
            for (const inst of instanceList) {
                const sopUID = inst['00080018'].Value[0];
                const buffer = await client.fetchInstanceBytes(studyInstanceUID, seriesUID, sopUID);
                if (!buffer) continue;
                const filePath = `${userDataPath}/PeregrineDatabase/${studyInstanceUID}/${seriesUID}/${sopUID}.dcm`;
                // @ts-ignore
                await window.electron.ensureDir(await window.electron.dirname(filePath));
                // @ts-ignore
                await window.electron.writeFile(filePath, new Uint8Array(buffer));
                const meta = parseDicombuffer(buffer);
                if (meta) await importMetadata(db, meta, filePath, buffer.byteLength);
            }
        }
        await updateRecordCounts(db);
    } catch (e) { console.error(e); throw e; }
};
