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
        patientNameNormalized: rawPatientName.toLowerCase()
    };

    const study = {
        studyInstanceUID: String(meta.studyInstanceUID),
        studyDate: String(meta.studyDate || ''),
        studyDescription: String(meta.studyDescription || ''),
        patientId: patientGlobalId,
        accessionNumber: String(meta.accessionNumber || ''),
        modalitiesInStudy: [String(meta.modality || 'OT')],
        ImportDateTime: new Date().toISOString()
    };

    const series = {
        seriesInstanceUID: String(meta.seriesInstanceUID),
        dicomSeriesInstanceUID: String(meta.seriesInstanceUID),
        modality: String(meta.modality || ''),
        seriesDescription: String(meta.seriesDescription || ''),
        seriesNumber: Number(meta.seriesNumber) || 0,
        studyInstanceUID: String(meta.studyInstanceUID)
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
        windowCenter: Number(meta.windowCenter) || 40,
        windowWidth: Number(meta.windowWidth) || 400,
        rescaleIntercept: Number(meta.rescaleIntercept) || 0,
        rescaleSlope: Number(meta.rescaleSlope) || 1
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

    // Resolve files
    for (const path of filePaths) {
        try {
            // @ts-ignore
            const files = await window.electron.readdirRecursive(path);
            if (files && files.length > 0) allFilePaths.push(...files);
            else allFilePaths.push(path);
        } catch (e) { allFilePaths.push(path); }
    }

    const totalFiles = allFilePaths.length;
    const patientsMap = new Map();
    const studiesMap = new Map();
    const tempGroupMap = new Map();

    for (let i = 0; i < totalFiles; i++) {
        const filePath = allFilePaths[i];
        if (i % 20 === 0) onProgress?.(10 + Math.round((i / totalFiles) * 70), `Parsing DICOM... (${i}/${totalFiles})`);

        try {
            // @ts-ignore
            const buffer = await window.electron.readFile(filePath);
            if (!buffer) continue;
            const meta = parseDicombuffer(buffer);
            if (!meta) continue;

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
        } catch (e) { console.error(e); }
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
                    const first = imgs[0];
                    const suffix = first._splitLabel ? ` (${first._splitLabel})` : '';
                    const newUID = `${origUID}_${splitKey}`;

                    finalSeries.push({
                        ...group.template,
                        seriesInstanceUID: newUID,
                        seriesDescription: (group.template.seriesDescription + suffix).trim(),
                        numberOfSeriesRelatedInstances: imgs.length
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
    onProgress?.(90, 'Saving to database...');
    await db.T_Patient.bulkUpsert(Array.from(patientsMap.values()));
    await db.T_Study.bulkUpsert(Array.from(studiesMap.values()));
    await db.T_Subseries.bulkUpsert(finalSeries);
    await db.T_FilePath.bulkUpsert(finalImages);
    await updateRecordCounts(db);
    onProgress?.(100, 'Import Complete');
};

export const importMetadata = async (db: AntigravityDatabase, meta: any, filePath: string, fileSize: number) => {
    const { patient, study, series, image } = prepareMetadata(meta, filePath, fileSize);
    await db.T_Patient.upsert(patient);
    await db.T_Study.upsert(study);
    await db.T_Subseries.upsert(series);
    await db.T_FilePath.upsert(image);
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
