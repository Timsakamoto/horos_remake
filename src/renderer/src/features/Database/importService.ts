import { AntigravityDatabase } from '../Database/db';
import { parseDicombuffer } from '../../utils/dicomParser';

export const importFiles = async (db: AntigravityDatabase, filePaths: string[]) => {
    console.log(`ImportService: Processing ${filePaths.length} files...`);

    for (const filePath of filePaths) {
        try {
            // Read file from Main process (via exposed API)
            // @ts-ignore
            const buffer = await window.electron.readFile(filePath);

            if (!buffer) {
                console.warn(`Skipping ${filePath}: Read failed`);
                continue;
            }

            const meta = parseDicombuffer(buffer);
            if (!meta) {
                console.warn(`Skipping ${filePath}: Not a valid DICOM`);
                continue;
            }

            // 1. Insert/Update Patient
            await db.patients.upsert({
                id: meta.patientID, // Simplified PK
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

        } catch (error) {
            console.error(`Error importing ${filePath}:`, error);
        }
    }
    console.log('ImportService: Import complete.');
};
