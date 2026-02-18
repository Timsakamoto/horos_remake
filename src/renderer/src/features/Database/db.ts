import { createRxDatabase, RxDatabase, RxCollection, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBDevModePlugin, disableWarnings } from 'rxdb/plugins/dev-mode';
import { PatientSchema, PatientDocType } from './schema/patient.schema';
import { StudySchema, StudyDocType } from './schema/study.schema';
import { SeriesSchema, SeriesDocType } from './schema/series.schema';
import { ImageSchema, ImageDocType } from './schema/image.schema';
import { SmartFolderSchema, SmartFolderDocType } from './schema/smartFolder.schema';
import { ThumbnailSchema, ThumbnailDocType } from './schema/thumbnail.schema';

// Add mandatory plugins
addRxPlugin(RxDBMigrationSchemaPlugin);
addRxPlugin(RxDBUpdatePlugin);
addRxPlugin(RxDBQueryBuilderPlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBLeaderElectionPlugin);

// dev-mode plugin should only be added in development
if (process.env.NODE_ENV === 'development') {
    addRxPlugin(RxDBDevModePlugin);
    disableWarnings();
}

export type AntigravityDatabaseCollections = {
    patients: RxCollection<PatientDocType>;
    studies: RxCollection<StudyDocType>;
    series: RxCollection<SeriesDocType>;
    images: RxCollection<ImageDocType>;
    smart_folders: RxCollection<SmartFolderDocType>;
    thumbnails: RxCollection<ThumbnailDocType>;
};

export type AntigravityDatabase = RxDatabase<AntigravityDatabaseCollections>;

let dbPromise: Promise<AntigravityDatabase> | null = null;

const DB_NAME = 'antigravity_v3';

let isRetrying = false;

const _create = async (): Promise<AntigravityDatabase> => {
    console.log(`DatabaseService: Creating database (${DB_NAME})...`);

    try {
        const db = await createRxDatabase<AntigravityDatabaseCollections>({
            name: DB_NAME,
            storage: getRxStorageDexie(),
            ignoreDuplicate: true
        });

        console.log('DatabaseService: Adding collections...');

        await db.addCollections({
            patients: {
                schema: PatientSchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        patientNameNormalized: String(oldDoc.patientName || '').toLowerCase()
                    }),
                    2: (oldDoc) => oldDoc,
                    3: (oldDoc) => oldDoc,
                    4: (oldDoc) => oldDoc,
                    5: (oldDoc) => ({
                        ...oldDoc,
                        numberOfPatientRelatedInstances: 0
                    }),
                    6: (oldDoc) => oldDoc,
                    7: (oldDoc) => oldDoc,
                    8: (oldDoc) => ({
                        ...oldDoc,
                        lastImportDateTime: new Date().toISOString()
                    }),
                    9: (oldDoc) => oldDoc
                }
            },
            studies: {
                schema: StudySchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        numberOfStudyRelatedSeries: 0,
                        numberOfStudyRelatedInstances: 0,
                        studyDescriptionNormalized: (oldDoc.studyDescription || '').toLowerCase()
                    }),
                    2: (oldDoc) => oldDoc,
                    3: (oldDoc) => oldDoc,
                    4: (oldDoc) => oldDoc,
                    5: (oldDoc) => oldDoc,
                    6: (oldDoc) => oldDoc,
                    7: (oldDoc) => oldDoc,
                    8: (oldDoc) => oldDoc,
                    9: (oldDoc) => oldDoc,
                    10: (oldDoc) => oldDoc
                }
            },
            series: {
                schema: SeriesSchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        numberOfSeriesRelatedInstances: 0,
                        bodyPartExamined: '',
                        protocolName: ''
                    }),
                    2: (oldDoc) => ({
                        ...oldDoc,
                        dicomSeriesInstanceUID: oldDoc.seriesInstanceUID
                    }),
                    3: (oldDoc) => ({
                        ...oldDoc,
                        frameOfReferenceUID: undefined
                    }),
                    4: (oldDoc) => oldDoc,
                    5: (oldDoc) => oldDoc,
                    6: (oldDoc) => oldDoc,
                    7: (oldDoc) => ({
                        ...oldDoc,
                        fusionPairId: undefined
                    }),
                    8: (oldDoc) => oldDoc,
                    9: (oldDoc) => oldDoc
                }
            },
            images: {
                schema: ImageSchema,
                migrationStrategies: {
                    1: (oldDoc) => oldDoc,
                    2: (oldDoc) => ({
                        ...oldDoc,
                        fileSize: 0,
                        transferSyntaxUID: ''
                    }),
                    3: (oldDoc) => ({
                        ...oldDoc,
                        windowCenter: 40,
                        windowWidth: 400
                    }),
                    4: (oldDoc) => oldDoc,
                    5: (oldDoc) => ({
                        ...oldDoc,
                        acquisitionNumber: 0,
                        dicomSeriesInstanceUID: oldDoc.seriesInstanceUID
                    }),
                    6: (oldDoc) => ({
                        ...oldDoc,
                        echoNumber: undefined,
                        temporalPositionIdentifier: undefined,
                        imageType: '',
                        sequenceName: '',
                        diffusionBValue: undefined
                    }),
                    7: (oldDoc) => ({
                        ...oldDoc,
                        frameOfReferenceUID: undefined
                    }),
                    8: (oldDoc) => oldDoc,
                    9: (oldDoc) => oldDoc,
                    10: (oldDoc) => oldDoc,
                    11: (oldDoc) => oldDoc
                }
            },
            smart_folders: {
                schema: SmartFolderSchema
            },
            thumbnails: {
                schema: ThumbnailSchema
            }
        });

        console.log('DatabaseService: Database created');
        isRetrying = false; // Reset on success
        return db;
    } catch (err: any) {
        console.error('DatabaseService: Error in _create:', err);

        // Handle IndexedDB/Dexie corruption (UnknownError), Schema Mismatches (COL12, DB6), or general Dexie open fails
        const isSchemaError = err.message?.includes('COL12') || err.message?.includes('DB6') || err.message?.includes('schema');
        const isCorruption = err.name === 'UnknownError' ||
            err.message?.includes('backing store') ||
            err.message?.includes('DexieError');

        if (!isRetrying && (isCorruption || isSchemaError)) {
            isRetrying = true;
            console.warn(`DatabaseService: Detected ${isSchemaError ? 'Schema Mismatch' : 'Corruption'}. Attempting automatic reset and retry...`);

            try {
                localStorage.setItem('peregrine_reimport_after_reset', 'true');
                await removeDatabase();

                // Wait a bit to ensure lock file is released by Chrome/OS
                await new Promise(resolve => setTimeout(resolve, 500));

                return await _create();
            } catch (retryErr) {
                console.error('DatabaseService: Automatic reset failed:', retryErr);
                throw retryErr;
            }
        }

        throw err;
    }
};

export const getDatabase = (): Promise<AntigravityDatabase> => {
    if (!dbPromise) {
        dbPromise = _create();
    }
    return dbPromise;
};

export const removeDatabase = async () => {
    const { removeRxDatabase } = await import('rxdb');

    // 1. Try to destroy active connection
    if (dbPromise) {
        try {
            const db = await dbPromise;
            await db.destroy();
            console.log('DatabaseService: Database destroyed');
        } catch (e) {
            console.warn('DatabaseService: Error destroying database:', e);
        }
    }
    dbPromise = null;

    // 2. Try standard RxDB removal
    try {
        await removeRxDatabase(DB_NAME, getRxStorageDexie());
        console.log('DatabaseService: RxDB removal successful');
    } catch (e) {
        console.error('DatabaseService: RxDB removal failed, trying native...', e);

        // 3. NUCLEAR FALLBACK: Native IndexedDB deletion
        // This is necessary if Dexie/RxDB structures are corrupted and blocking themselves
        return new Promise<void>((resolve, reject) => {
            const req = indexedDB.deleteDatabase('dexie-db-' + DB_NAME);
            req.onsuccess = () => {
                console.log('DatabaseService: Native removal successful');
                resolve();
            };
            req.onerror = () => {
                console.error('DatabaseService: Native removal failed, trying supreme reset...');
                // 4. SUPREME FALLBACK: Main Process Storage Clear
                // This clears the backing store at the browser profile level
                // @ts-ignore
                window.electron.resetIndexedDB()
                    .then(() => {
                        console.log('DatabaseService: Supreme reset successful');
                        resolve();
                    })
                    .catch((err: any) => {
                        console.error('DatabaseService: Supreme reset failed');
                        reject(err);
                    });
            };
            req.onblocked = async () => {
                console.warn('DatabaseService: Native removal blocked by active connection. Triggering supreme reset...');
                try {
                    // @ts-ignore
                    await window.electron.resetIndexedDB();
                    console.log('DatabaseService: Supreme reset successful (after block)');
                    resolve();
                } catch (e) {
                    console.error('DatabaseService: Supreme reset failed after block', e);
                    resolve(); // Resolve anyway to allow retry
                }
            };
        });
    }
};
