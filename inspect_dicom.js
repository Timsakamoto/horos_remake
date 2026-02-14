try {
    const fs = require('fs');
    const dcmjs = require('dcmjs');

    const filePath = '/Volumes/PRO-G40/horos_remake/HorosData/DICOM/12345678_ANDO_KOJI_19570901_M/1.3.6.1.4.1.19291.2.1.1.11049153145180183778756490502/1.3.6.1.4.1.19291.2.1.2.11049153145180183778756490563/1.3.6.1.4.1.19291.2.1.3.11049153145180183778756490564.dcm';
    if (!fs.existsSync(filePath)) {
        console.log('File does not exist:', filePath);
        process.exit(1);
    }
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const dicomDict = dcmjs.data.DicomMessage.readFile(arrayBuffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
    
    console.log('Specific Character Set:', dataset.SpecificCharacterSet);
    console.log('Patient Name:', JSON.stringify(dataset.PatientName, null, 2));
} catch (e) {
    console.error('ERROR_TRAP:', e.message);
    console.error(e.stack);
}
