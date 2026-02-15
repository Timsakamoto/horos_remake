
const fs = require('fs');
const path = require('path');
const dcmjs = require('dcmjs');

const dir = '/Volumes/PRO-G40/horos_remake/PeregrineData/DICOM/0000000_Anonymous__M/1.2.392.200036.9142.10003502.1020012144.1.20260204115518.179';
// Need to find the series inside 179 first.
const seriesDirs = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory());
const seriesDir = path.join(dir, seriesDirs[0]);
console.log(`Scanning series: ${seriesDir}`);

const files = fs.readdirSync(seriesDir).filter(f => f.endsWith('.dcm')); // Check ALL files

console.log(`Scanning ALL ${files.length} files...`);

for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const fullPath = path.join(seriesDir, f); // CORRECTION: Use seriesDir
    const buffer = fs.readFileSync(fullPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    let dicomDict;
    try {
        dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer, { ignoreHeader: true });
    } catch (e) { continue; }

    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);

    // Check Shared Functional Groups (5200,9229)
    if (dataset.SharedFunctionalGroupsSequence) {
        console.log(`--- SharedFunctionalGroupsSequence (5200,9229) for ${f} ---`);
        console.log(JSON.stringify(dataset.SharedFunctionalGroupsSequence, null, 2));
    }

    // Check Per-Frame Functional Groups (5200,9230)
    if (dataset.PerFrameFunctionalGroupsSequence) {
        console.log(`--- PerFrameFunctionalGroupsSequence (5200,9230) for ${f} ---`);
        console.log(JSON.stringify(dataset.PerFrameFunctionalGroupsSequence, null, 2));
    }

    // Check for raw tag 0018,9087 in the dictionary if naturalize missed it?
    // dcmjs dict is mapped by tag ID.
    const diffTag = dicomDict.dict['00189087'];
    if (diffTag) {
        console.log(`--- Raw (0018,9087) Found ---`, diffTag);
    }

    process.exit(0); // Just check one file

    // Check nested 2005,140F
    if (dataset['2005140F']) {
        const seq = dataset['2005140F'];
        if (Array.isArray(seq)) {
            for (const item of seq) {
                for (const key of Object.keys(item)) {
                    // Check for B-Value related keys or just any reasonable number in private tags?
                    // Let's look for keys with "BValue" case insensitive
                    if (/BValue/i.test(key)) {
                        const val = Number(item[key]);
                        // Filter out sentinel values (approx > 100,000)
                        if (val >= 0 && val < 10000) {
                            console.log(`FOUND Valid B-Value Candidate in ${f} [${key}]:`, val);
                            if (val > 0) process.exit(0);
                        }
                    }
                }
            }
        }
    }

    // Brute force scan of ALL tags for values in range [50, 5000]
    // Traverse dataset recursively
    function scanObj(obj, path = '') {
        if (!obj) return;
        if (typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === 'number') {
                    if (val >= 50 && val <= 5000) {
                        // Likely candidate?
                        // Ignore common integers like Image Size (512), Window Width (100-4000)
                        if (val !== 512 && val !== 256 && val !== 128 && val !== 1024) {
                            console.log(`[CANDIDATE] ${f} -> ${path}.${key} = ${val}`);
                            // If exact like 1000, 800, 600, very likely
                            if (val === 1000 || val === 800 || val === 600 || val === 400) {
                                console.log("   *** HIGH PROBABILITY MATCH ***");
                            }
                        }
                    }
                } else if (typeof val === 'object') {
                    scanObj(val, `${path}.${key}`);
                }
            }
        }
    }

    scanObj(dataset, 'root');
}
console.log("Scan complete.");
