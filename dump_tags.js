
const dcmjs = require('dcmjs');
const fs = require('fs');

const filePath = '/Volumes/PRO-G40/horos_remake/PeregrineData/DICOM/0000000_Anonymous__M/1.2.392.200036.9142.10003502.1020012144.1.20260204115329.178/1.2.392.200036.9142.10003502.1020012144.2.20260204115329.2371/1.2.392.200036.9142.10003502.1020012144.3.20260204115329.55124.dcm';

try {
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    let dicomDict;
    try {
        dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer, { ignoreErrors: true });
    } catch (e) {
        console.log("Standard read failed, trying ignoreHeader...");
        dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer, { ignoreHeader: true });
    }

    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);

    console.log(JSON.stringify(dataset, null, 2));

} catch (e) {
    console.error('Error reading DICOM:', e);
}
