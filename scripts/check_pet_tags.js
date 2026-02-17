
const fs = require('fs');
const dicomParser = require('dicom-parser');

const filePath = '/Volumes/PRO-G40/horos_remake/PeregrineData/0000032387/1.2.392.200036.9142.10000302.1020028001.1.201804181552.324861/1.2.392.200036.9142.10002202.1020028991.2.20180424111051.54916/1.2.392.200036.9142.10002202.1020028991.3.20180424111051.63259.dcm';

try {
    const fileBuffer = fs.readFileSync(filePath);
    const byteArray = new Uint8Array(fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength));
    const dataSet = dicomParser.parseDicom(byteArray);

    const getTag = (tag) => {
        const element = dataSet.elements[tag];
        if (element) {
            return dataSet.string(tag);
        }
        return undefined;
    };

    // Helper to get float
    const getFloat = (tag) => {
        const val = getTag(tag);
        return val ? parseFloat(val) : undefined;
    }

    console.log('--- DICOM TAGS (dicom-parser) ---');
    console.log('Modality (0008,0060):', getTag('x00080060'));
    console.log('WindowCenter (0028,1050):', getTag('x00281050'));
    console.log('WindowWidth (0028,1051):', getTag('x00281051'));
    console.log('RescaleIntercept (0028,1052):', getTag('x00281052'));
    console.log('RescaleSlope (0028,1053):', getTag('x00281053'));
    console.log('TransferSyntaxUID (0002,0010):', getTag('x00020010'));
    console.log('BitsAllocated (0028,0100):', dataSet.uint16('x00280100'));
    console.log('BitsStored (0028,0101):', dataSet.uint16('x00280101'));
    console.log('PixelRepresentation (0028,0103):', dataSet.uint16('x00280103'));

    console.log('--- PIXEL DATA STATS ---');
    const pixelDataElement = dataSet.elements['x7fe00010'];

    if (pixelDataElement) {
        // Simple raw read (assuming uncompressed for now, or we'll see garbage but at least range)
        // If transfer syntax is compressed, this raw read is invalid for range check without decode.
        const ts = getTag('x00020010');
        const isCompressed = !['1.2.840.10008.1.2', '1.2.840.10008.1.2.1', '1.2.840.10008.1.2.2'].includes(ts);

        if (isCompressed) {
            console.log('Data is COMPRESSED. Cannot read raw min/max easily in script.');
        } else {
            const bitsAllocated = dataSet.uint16('x00280100');
            const offset = pixelDataElement.dataOffset;
            const length = pixelDataElement.length;

            if (bitsAllocated === 16) {
                const pixelBuffer = byteArray.buffer.slice(offset, offset + length);
                const pixelData = new Int16Array(pixelBuffer);

                let min = Infinity;
                let max = -Infinity;
                for (let i = 0; i < pixelData.length; i++) {
                    const val = pixelData[i];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                console.log(`Raw Min: ${min}, Raw Max: ${max}`);

                const slope = getFloat('x00281053') || 1;
                const intercept = getFloat('x00281052') || 0;
                console.log(`Rescaled Min: ${min * slope + intercept}`);
                console.log(`Rescaled Max: ${max * slope + intercept}`);

            } else {
                console.log(`Skipping stats for bitsAllocated=${bitsAllocated}`);
            }
        }
    }

} catch (e) {
    console.error('Error:', e);
}
