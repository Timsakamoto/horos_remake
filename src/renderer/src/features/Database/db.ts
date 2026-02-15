import { createRxDatabase, RxDatabase, RxCollection, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { PatientSchema, PatientDocType } from './schema/patient.schema';
import { StudySchema, StudyDocType } from './schema/study.schema';
import { SeriesSchema, SeriesDocType } from './schema/series.schema';
import { ImageSchema, ImageDocType } from './schema/image.schema';

// Add mandatory plugins
addRxPlugin(RxDBMigrationSchemaPlugin);

export type AntigravityDatabaseCollections = {
    T_Patient: RxCollection<PatientDocType>;
    T_Study: RxCollection<StudyDocType>;
    T_Subseries: RxCollection<SeriesDocType>;
    T_FilePath: RxCollection<ImageDocType>;
};

export type AntigravityDatabase = RxDatabase<AntigravityDatabaseCollections>;

let dbPromise: Promise<AntigravityDatabase> | null = null;

const _create = async (): Promise<AntigravityDatabase> => {
    console.log('DatabaseService: Creating database...');

    try {
        const db = await createRxDatabase<AntigravityDatabaseCollections>({
            name: 'antigravitydb',
            storage: getRxStorageDexie(),
            ignoreDuplicate: true
        });

        console.log('DatabaseService: Adding collections...');

        await db.addCollections({
            T_Patient: {
                schema: PatientSchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        patientNameNormalized: String(oldDoc.patientName || '').toLowerCase()
                    }),
                    2: (oldDoc) => oldDoc // No change needed for existing records, but schema version bumped
                }
            },
            T_Study: {
                schema: StudySchema,
                migrationStrategies: {
                    1: (oldDoc) => ({
                        ...oldDoc,
                        numberOfStudyRelatedSeries: 0,
                        numberOfStudyRelatedInstances: 0,
                        studyDescriptionNormalized: (oldDoc.studyDescription || '').toLowerCase()
                    })
                }
            },
            T_Subseries: {
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
                        dicomSeriesInstanceUID: oldDoc.seriesInstanceUID // Before split, they were same
                    })
                }
            },
            T_FilePath: {
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
                    })
                }
            }
        });

        console.log('DatabaseService: Database created');
        return db;
    } catch (err) {
        console.error('DatabaseService: Error in _create:', err);
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
    const DB_NAME = 'antigravitydb';
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
            req.onblocked = () => {
                console.warn('DatabaseService: Native removal blocked by active connection');
                // Even if blocked, we might want to resolve to allow reload to break the lock
                resolve();
            };
        });
    }
};
