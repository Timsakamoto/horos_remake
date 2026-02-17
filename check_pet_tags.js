
const fs = require('fs');
const path = require('path');
const dicomParser = require('dicom-parser');

// Minimal DB mock or direct file scan
// We will look for files in likely directories if DB access is hard from a standalone script
// Or we can try to require the database provider... NO, that's properly hard in a standalone node script.
// Let's just scan a directory recursively for a file with Modality = PT.

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath)
    arrayOfFiles = arrayOfFiles || []

    files.forEach(function (file) {
        if (file === 'node_modules' || file.startsWith('.')) return;
        const fullPath = path.join(dirPath, "/", file);
        try {
            if (fs.statSync(fullPath).isDirectory()) {
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles)
            } else {
                if (!file.endsWith('.json') && !file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.js')) {
                    arrayOfFiles.push(fullPath)
                }
            }
        } catch (e) { }
    })

    return arrayOfFiles
}

const dbPath = '/Volumes/PRO-G40/horos_remake'; // Adjust as needed, expecting user might have data here
// Actually, let's look at where the app stores data.
// The user said "/Volumes/PRO-G40/horos_remake" is the workspace.
// Data is likely in a folder. Let's try to find a file.

console.log('Scanning for DICOM files...');

// Safe limit
let files = [];
try {
    // Try to find a known data directory or just scan root slightly
    // This might be slow if we scan the whole repo. 
    // Let's assume there is a 'data' or similar, or just pick one if possible.
    // Actually, let's use the filenames we saw in previous logs?
    // User mentioned PET/CT.

    // Let's try a smarter approach: Look for a "dicom" or "images" folder if one exists, otherwise top level.
    // For now, let's just use `fs.readdir` on the root of the workspace to see structure first? 
    // No, I'll just write a script that takes a file path as ARG or defaults to finding one.

    // I will write this to accept a path or search.
    // But since I can't pass args easily, I'll self-scan.

    // Search specifically in PeregrineData
    try {
        files = getAllFiles(path.join('/Volumes/PRO-G40/horos_remake', 'PeregrineData'), []);
    } catch (e) {
        console.log("Error scanning PeregrineData, falling back to root");
        files = getAllFiles('/Volumes/PRO-G40/horos_remake', []);
    }
} catch (e) {
    console.log("Fatal scan error:", e);
}
console.log(`Found ${files.length} files in Data dir. Checking for PET...`);

let petFile = null;

for (const f of files) {
    if (files.indexOf(f) > 5000) break; // larger limit

    try {
        const buffer = fs.readFileSync(f);
        if (buffer.length < 132) continue;

        // Skip non-DICM to speed up
        const prefix = buffer.toString('utf8', 128, 132);
        if (prefix !== 'DICM') continue;

        const dataSet = dicomParser.parseDicom(buffer);
        const modality = dataSet.string('x00080060');

        if (modality === 'PT') {
            petFile = f;
            console.log(`FOUND PET FILE!: ${f}`);

            const wc = dataSet.string('x00281050');
            const ww = dataSet.string('x00281051');
            console.log('--- TAG DUMP ---');
            console.log(`Window Center (0028,1050): ${wc}`);
            console.log(`Window Width  (0028,1051): ${ww}`);

            // Also check for sequences if Enhanced
            const sharedFG = dataSet.elements['x52009229'];
            if (sharedFG) console.log('Has SharedFunctionalGroupsSequence');

            break;
        }
    } catch (e) {
        // ignore non-dicom
    }
}

if (!petFile) {
    console.log("No PET files found in scan check.");
}
