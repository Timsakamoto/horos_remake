import { parentPort } from 'node:worker_threads';
import fs from 'node:fs';
import * as dicomParser from 'dicom-parser';
import { extractMetadata } from './dicomMetadataUtils';

const processDICOM = (buffer: Buffer, filePath: string) => {
    try {
        const uint8Array = new Uint8Array(buffer);
        const dataSet = dicomParser.parseDicom(uint8Array);
        return extractMetadata(dataSet, filePath);
    } catch (e) {
        return null;
    }
};

// Process files passed to the worker
const port = parentPort;
if (port) {
    port.on('message', async (filePaths: string[]) => {
        const results = [];
        for (const path of filePaths) {
            try {
                const buffer = fs.readFileSync(path);
                const meta = processDICOM(buffer, path);
                if (meta) {
                    results.push({
                        ...meta,
                        fileSize: buffer.byteLength
                    });
                }
            } catch (err) {
                // Skip failed files
            }
        }
        port.postMessage(results);
    });
}
