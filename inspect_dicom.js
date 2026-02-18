const dicomParser = require('dicom-parser');
const fs = require('fs');
const path = require('path');

const storagePath = '/Volumes/PRO-G40/horos_remake/PeregrineData';

const targetFile = '/Volumes/PRO-G40/horos_remake/PeregrineData/12345678/1.3.6.1.4.1.19291.2.1.1.11049153145180183778756490502/1.3.6.1.4.1.19291.2.1.2.11049153145180183778756492227/1.3.6.1.4.1.19291.2.1.3.11049153145180183778756492228.dcm';
if (!targetFile) {
    console.log('No DICOM files found in', storagePath);
    process.exit();
}

console.log('Inspecting:', targetFile);
const buffer = fs.readFileSync(targetFile);
const dataSet = dicomParser.parseDicom(buffer);

const photometric = dataSet.string('x00280004');
const modality = dataSet.string('x00080060');
const slope = dataSet.string('x00281053');
const intercept = dataSet.string('x00281052');
const bitsAllocated = dataSet.uint16('x00280100');
const bitsStored = dataSet.uint16('x00280101');
const highBit = dataSet.uint16('x00280102');
const pixelRepresentation = dataSet.uint16('x00280103');

console.log('Modality:', modality);
console.log('Photometric Interpretation:', photometric);
console.log('Rescale Slope:', slope);
console.log('Rescale Intercept:', intercept);
console.log('Bits Allocated:', bitsAllocated);
console.log('Bits Stored:', bitsStored);
console.log('High Bit:', highBit);
console.log('Pixel Representation:', pixelRepresentation);

const pixelDataAttr = dataSet.elements['x7fe00010'];
if (pixelDataAttr) {
    const rawData = new Uint16Array(buffer.buffer, buffer.byteOffset + pixelDataAttr.dataOffset, 100);
    const mask = (1 << bitsStored) - 1;
    console.log('Sample Pixels (first 10, masked):');
    for (let i = 0; i < 10; i++) {
        console.log(`Pixel[${i}]: ${rawData[i] & mask}`);
    }

    let min = Infinity, max = -Infinity;
    const fullData = new Uint16Array(buffer.buffer, buffer.byteOffset + pixelDataAttr.dataOffset, (buffer.length - pixelDataAttr.dataOffset) / 2);
    for (let i = 0; i < fullData.length; i++) {
        const val = fullData[i] & mask;
        if (val < min) min = val;
        if (val > max) max = val;
    }
    console.log(`Range: ${min} to ${max}`);
}
