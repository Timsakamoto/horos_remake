const fs = require('fs');
const path = require('path');
const dcmjs = require('dcmjs');

const rootDir = '/Volumes/PRO-G40/horos_remake/PeregrineData/DICOM/0000000_Anonymous__M';

function findSeries701(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const fullPath = path.join(dir, f);
        if (fs.statSync(fullPath).isDirectory()) {
            findSeries701(fullPath);
        } else if (f.endsWith('.dcm')) {
            try {
                const buffer = fs.readFileSync(fullPath);
                // Read header + some data
                const headerBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + Math.min(buffer.byteLength, 50000));
                let dicomDict;
                try {
                    dicomDict = dcmjs.data.DicomMessage.readFile(headerBuffer, { ignoreHeader: true });
                } catch (e) { continue; }

                const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);

                if (dataset.SeriesNumber === 701) {
                    console.log(`FOUND Series 701 File: ${fullPath}`);
                    console.log('   Series Description:', dataset.SeriesDescription);
                    console.log('   Modality:', dataset.Modality);
                    console.log('   DiffusionBValue (0018,9087):', dataset.DiffusionBValue);

                    // Check functional groups
                    if (dataset.SharedFunctionalGroupsSequence) console.log('   Has SharedFuncGroups');
                    if (dataset.PerFrameFunctionalGroupsSequence) console.log('   Has PerFrameFuncGroups');

                    // Don't exit immediately, find at least one b=0 and one b=1000 if possible?
                    // Or just report one and let me inspect manually.
                    if (dataset.DiffusionBValue > 0) {
                        console.log('   >>> FOUND Non-Zero B-Value in 701!');
                        process.exit(0);
                    }
                }
            } catch (e) { }
        }
    }
}

console.log(`Searching for Series 701 in ${rootDir}...`);
findSeries701(rootDir);
