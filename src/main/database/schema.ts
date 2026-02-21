import { SQLiteManager } from './SQLiteManager';

export const initSchema = () => {
    const db = SQLiteManager.getInstance().getDB();

    db.exec(`
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientName TEXT,
            patientID TEXT,
            patientBirthDate TEXT,
            patientSex TEXT,
            folderHint TEXT,
            UNIQUE(patientID, folderHint)
        );

        CREATE TABLE IF NOT EXISTS studies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientId INTEGER REFERENCES patients(id) ON DELETE CASCADE,
            studyInstanceUID TEXT UNIQUE,
            studyDate TEXT,
            studyDescription TEXT,
            accessionNumber TEXT,
            institutionName TEXT,
            modalitiesInStudy TEXT,
            numberOfStudyRelatedInstances INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studyId INTEGER REFERENCES studies(id) ON DELETE CASCADE,
            seriesInstanceUID TEXT UNIQUE,
            seriesNumber TEXT,
            modality TEXT,
            seriesDescription TEXT,
            numberOfSeriesRelatedInstances INTEGER DEFAULT 0,
            bodyPartExamined TEXT,
            protocolName TEXT,
            frameOfReferenceUID TEXT,
            numberOfFrames INTEGER
        );

        CREATE TABLE IF NOT EXISTS instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seriesId INTEGER REFERENCES series(id) ON DELETE CASCADE,
            sopInstanceUID TEXT UNIQUE,
            instanceNumber INTEGER,
            filePath TEXT,
            fileSize INTEGER,
            transferSyntaxUID TEXT,
            rows INTEGER,
            columns INTEGER,
            pixelSpacing TEXT,
            sliceLocation REAL,
            imagePositionPatient TEXT,
            imageOrientationPatient TEXT,
            windowCenter REAL,
            windowWidth REAL,
            rescaleIntercept REAL,
            rescaleSlope REAL,
            bitsAllocated INTEGER,
            bitsStored INTEGER,
            highBit INTEGER,
            pixelRepresentation INTEGER,
            photometricInterpretation TEXT
        );

        CREATE TABLE IF NOT EXISTS smart_folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            query TEXT NOT NULL, -- JSON string of filters
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS thumbnails (
            id TEXT PRIMARY KEY,
            seriesInstanceUID TEXT REFERENCES series(seriesInstanceUID) ON DELETE CASCADE,
            data BLOB,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );

        -- Indices for fast searching and joining
        CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patientName);
        CREATE INDEX IF NOT EXISTS idx_studies_patientId ON studies(patientId);
        CREATE INDEX IF NOT EXISTS idx_series_studyId ON series(studyId);
        CREATE INDEX IF NOT EXISTS idx_instances_seriesId ON instances(seriesId);
    `);

    // Migration: Add institutionName to studies if it doesn't exist
    try {
        const columns = db.prepare("PRAGMA table_info(studies)").all();
        if (!columns.some((c: any) => c.name === 'institutionName')) {
            console.log('[SQLiteManager] Migrating: Adding institutionName to studies table');
            db.exec("ALTER TABLE studies ADD COLUMN institutionName TEXT");
        }

        // Ensure count columns have DEFAULT 0 or are present in old DBs
        if (!columns.some((c: any) => c.name === 'numberOfStudyRelatedInstances')) {
            db.exec("ALTER TABLE studies ADD COLUMN numberOfStudyRelatedInstances INTEGER DEFAULT 0");
        }

        const seriesColumns = db.prepare("PRAGMA table_info(series)").all();
        if (!seriesColumns.some((c: any) => c.name === 'numberOfSeriesRelatedInstances')) {
            db.exec("ALTER TABLE series ADD COLUMN numberOfSeriesRelatedInstances INTEGER DEFAULT 0");
        }

        const instanceColumns = db.prepare("PRAGMA table_info(instances)").all();
        if (!instanceColumns.some((c: any) => c.name === 'photometricInterpretation')) {
            console.log('[SQLiteManager] Migrating: Adding photometricInterpretation to instances table');
            db.exec("ALTER TABLE instances ADD COLUMN photometricInterpretation TEXT");
        }

        // Migration: Ensure UNIQUE(patientID, folderHint) constraint exists
        const patientsTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='patients'").get() as { sql: string };
        const hasCompositeUnique = patientsTableInfo?.sql.includes('UNIQUE') && patientsTableInfo?.sql.includes('patientID') && patientsTableInfo?.sql.includes('folderHint');
        const hasFolderHint = patientsTableInfo?.sql.includes('folderHint');

        if (!hasCompositeUnique || !hasFolderHint) {
            console.log('[SQLiteManager] Migrating patients table: rebuilding schema for composite UNIQUE constraint and folderHint');

            // To safely migrate a table with foreign keys in SQLite:
            // 1. Turn off foreign keys
            // 2. Start transaction
            // 3. Rename old table
            // 4. Create new table
            // 5. Copy data
            // 6. Drop old table
            // 7. RECREATE all tables that have foreign keys to this table!

            // Cleanup any previous failed attempts
            db.exec(`
                DROP TABLE IF EXISTS patients_old;
                DROP TABLE IF EXISTS studies_old;
                DROP TABLE IF EXISTS series_old;
                DROP TABLE IF EXISTS instances_old;
                DROP TABLE IF EXISTS thumbnails_old;
            `);

            // Check if thumbnails exists before renaming
            const hasThumbnails = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='thumbnails'").get();

            db.exec(`
                PRAGMA foreign_keys = OFF;
                BEGIN TRANSACTION;
                
                -- Backup tables
                ALTER TABLE patients RENAME TO patients_old;
                ALTER TABLE studies RENAME TO studies_old;
                ALTER TABLE series RENAME TO series_old;
                ALTER TABLE instances RENAME TO instances_old;
                ${hasThumbnails ? 'ALTER TABLE thumbnails RENAME TO thumbnails_old;' : ''}

                -- Recreate patients with correct schema
                CREATE TABLE patients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patientName TEXT,
                    patientID TEXT,
                    patientBirthDate TEXT,
                    patientSex TEXT,
                    folderHint TEXT,
                    UNIQUE(patientID, folderHint)
                );
                INSERT INTO patients (id, patientName, patientID, patientBirthDate, patientSex)
                SELECT id, patientName, patientID, patientBirthDate, patientSex FROM patients_old;

                -- Recreate studies with reference to NEW patients
                CREATE TABLE studies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patientId INTEGER REFERENCES patients(id) ON DELETE CASCADE,
                    studyInstanceUID TEXT UNIQUE,
                    studyDate TEXT,
                    studyDescription TEXT,
                    accessionNumber TEXT,
                    institutionName TEXT,
                    modalitiesInStudy TEXT,
                    numberOfStudyRelatedInstances INTEGER DEFAULT 0
                );
                INSERT INTO studies SELECT * FROM studies_old;

                -- Recreate series with reference to NEW studies
                CREATE TABLE series (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    studyId INTEGER REFERENCES studies(id) ON DELETE CASCADE,
                    seriesInstanceUID TEXT UNIQUE,
                    seriesNumber TEXT,
                    modality TEXT,
                    seriesDescription TEXT,
                    numberOfSeriesRelatedInstances INTEGER DEFAULT 0,
                    bodyPartExamined TEXT,
                    protocolName TEXT,
                    frameOfReferenceUID TEXT,
                    numberOfFrames INTEGER
                );
                INSERT INTO series SELECT * FROM series_old;

                -- Recreate instances with reference to NEW series
                CREATE TABLE instances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seriesId INTEGER REFERENCES series(id) ON DELETE CASCADE,
                    sopInstanceUID TEXT UNIQUE,
                    instanceNumber INTEGER,
                    filePath TEXT,
                    fileSize INTEGER,
                    transferSyntaxUID TEXT,
                    rows INTEGER,
                    columns INTEGER,
                    pixelSpacing TEXT,
                    sliceLocation REAL,
                    imagePositionPatient TEXT,
                    imageOrientationPatient TEXT,
                    windowCenter REAL,
                    windowWidth REAL,
                    rescaleIntercept REAL,
                    rescaleSlope REAL,
                    bitsAllocated INTEGER,
                    bitsStored INTEGER,
                    highBit INTEGER,
                    pixelRepresentation INTEGER,
                    photometricInterpretation TEXT
                );
                INSERT INTO instances SELECT * FROM instances_old;

                -- Recreate thumbnails with reference to NEW series
                CREATE TABLE thumbnails (
                    id TEXT PRIMARY KEY,
                    seriesInstanceUID TEXT REFERENCES series(seriesInstanceUID) ON DELETE CASCADE,
                    data BLOB,
                    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
                );
                -- Restore thumbnails if they existed (best effort)
                -- PRAGMA table_info returns columns if it exists
                INSERT INTO thumbnails SELECT * FROM thumbnails_old;

                -- Cleanup
                DROP TABLE patients_old;
                DROP TABLE studies_old;
                DROP TABLE series_old;
                DROP TABLE instances_old;
                DROP TABLE IF EXISTS thumbnails_old;

                COMMIT;
                PRAGMA foreign_keys = ON;
            `);
            console.log('[SQLiteManager] Migration successful.');
        }

        // --- Recalculate counts for existing data ---
        console.log('[SQLiteManager] Migrating: Recalculating instance counts for studies and series...');

        // 1. Update Series counts
        db.exec(`
            UPDATE series SET numberOfSeriesRelatedInstances = (
                SELECT COUNT(*) FROM instances WHERE seriesId = series.id
            )
        `);

        // 2. Update Study counts
        db.exec(`
            UPDATE studies SET numberOfStudyRelatedInstances = (
                SELECT COUNT(*) FROM instances i
                JOIN series s ON i.seriesId = s.id
                WHERE s.studyId = studies.id
            )
        `);
        console.log('[SQLiteManager] Count migration complete.');

    } catch (e) {
        console.error('[SQLiteManager] Migration error:', e);
    }

    console.log('[SQLiteManager] Schema initialized.');
};
