import { AntigravityDatabase } from '../Database/db';
import { parseDicombuffer } from '../../utils/dicomParser';
import { PACSClient } from '../PACS/pacsClient';

export const importFiles = async (db: AntigravityDatabase, filePaths: string[]) => {
    // ... existing importFiles logic (skipped for brevity)
    console.log(`ImportService: Processing ${filePaths.length} files...`);

    for (const filePath of filePaths) {
        try {
            // @ts-ignore
            const buffer = await window.electron.readFile(filePath);
            if (!buffer) continue;
            const meta = parseDicombuffer(buffer);
            if (!meta) continue;

            await importMetadata(db, meta, filePath);
        } catch (error) {
            console.error(`Error importing ${filePath}:`, error);
        }
    }
};

const importMetadata = async (db: AntigravityDatabase, meta: any, filePath: string) => {
    // 1. Insert/Update Patient
    await db.patients.upsert({
        id: meta.patientID,
        patientName: meta.patientName,
        patientID: meta.patientID,
        patientBirthDate: meta.patientBirthDate,
        patientSex: meta.patientSex
    });

    // 2. Insert/Update Study
    await db.studies.upsert({
        studyInstanceUID: meta.studyInstanceUID,
        studyDate: meta.studyDate,
        studyTime: meta.studyTime,
        accessionNumber: meta.accessionNumber,
        studyDescription: meta.studyDescription,
        modalitiesInStudy: meta.modalitiesInStudy,
        patientId: meta.patientID
    });

    // 3. Insert/Update Series
    await db.series.upsert({
        seriesInstanceUID: meta.seriesInstanceUID,
        modality: meta.modality,
        seriesDate: meta.seriesDate,
        seriesDescription: meta.seriesDescription,
        seriesNumber: meta.seriesNumber,
        studyInstanceUID: meta.studyInstanceUID
    });

    // 4. Insert Image
    await db.images.upsert({
        sopInstanceUID: meta.sopInstanceUID,
        instanceNumber: meta.instanceNumber,
        sopClassUID: meta.sopClassUID,
        filePath: filePath,
        seriesInstanceUID: meta.seriesInstanceUID
    });
};

export const importStudyFromPACS = async (db: AntigravityDatabase, serverUrl: string, studyInstanceUID: string, onProgress?: (msg: string) => void) => {
    console.log(`ImportService: Downloading study ${studyInstanceUID} from PACS...`);
    const client = new PACSClient(serverUrl);

    // @ts-ignore
    const userDataPath = await window.electron.getPath('userData');
    const storageRoot = `${userDataPath}/HorosDatabase`;

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
                    await importMetadata(db, meta, filePath);
                }
            }
        }
        console.log('ImportService: PACS Download complete.');
    } catch (error) {
        console.error('ImportService: PACS Download Error:', error);
        throw error;
    }
};
