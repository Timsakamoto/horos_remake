import React from 'react';

interface OverlayProps {
    metadata: {
        patientName?: string;
        patientID?: string;
        patientBirthDate?: string;
        patientSex?: string;
        studyDate?: string;
        studyTime?: string;
        studyDescription?: string;
        seriesDescription?: string;
        modality?: string;
        manufacturer?: string;
        institutionName?: string;
        instanceNumber?: number;
        totalInstances?: number;
        windowWidth?: number;
        windowCenter?: number;
        pixelSpacing?: [number, number];
        sliceThickness?: number;
        kvp?: string;
        ma?: string;
    };
}

export const OverlayManager: React.FC<OverlayProps> = ({ metadata }) => {
    return (
        <div className="absolute inset-0 pointer-events-none select-none text-[11px] font-medium text-white/90 font-mono shadow-sm">
            {/* Top Left: Patient / Study Info */}
            <div className="absolute top-4 left-4 flex flex-col gap-0.5">
                <div className="text-peregrine-accent font-black tracking-wider uppercase text-[12px]">{metadata.patientName || 'Anonymous'}</div>
                {metadata.patientID && metadata.patientID !== '0000000' && metadata.patientID !== 'Unknown' && (
                    <div>{metadata.patientID}</div>
                )}
                <div>{metadata.patientBirthDate || ''} {metadata.patientSex || ''}</div>
                {/* <div className="mt-1 opacity-70">{metadata.institutionName || ''}</div> */}
            </div>

            {/* Top Right: Study / Series Info */}
            <div className="absolute top-4 right-4 flex flex-col items-end gap-0.5 text-right font-bold">
                <div className="text-gray-300">{metadata.studyDescription || ''}</div>
                <div>{metadata.studyDate || ''}</div>
                <div>{metadata.studyTime || ''}</div>
                <div className="mt-1 text-peregrine-accent/80">{metadata.modality || ''} - {metadata.seriesDescription || ''}</div>
            </div>

            {/* Bottom Left: Imaging Parameters */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-0.5 opacity-80">
                {metadata.kvp && <div>kVp: {metadata.kvp}</div>}
                {metadata.ma && <div>mA: {metadata.ma}</div>}
                {metadata.sliceThickness && <div>Thickness: {metadata.sliceThickness} mm</div>}
                {metadata.pixelSpacing && Array.isArray(metadata.pixelSpacing) && metadata.pixelSpacing.length >= 2 && (
                    <div>Spacing: {Number(metadata.pixelSpacing[0] || 0).toFixed(2)} / {Number(metadata.pixelSpacing[1] || 0).toFixed(2)} mm</div>
                )}
                <div className="mt-1">WW: {Math.round(Number(metadata.windowWidth) || 0)} / WC: {Math.round(Number(metadata.windowCenter) || 0)}</div>
            </div>

            {/* Bottom Right: Instance Info */}
            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-0.5 text-right font-black">
                <div className="text-[14px]">
                    Im: {metadata.instanceNumber || 0} / {metadata.totalInstances || 0}
                </div>
            </div>

            {/* Orientation Markers (Optional but good for 3D/MPR) */}
            <div className="absolute top-1/2 left-2 -translate-y-1/2 opacity-30 text-[10px]">R</div>
            <div className="absolute top-1/2 right-2 -translate-y-1/2 opacity-30 text-[10px]">L</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 opacity-30 text-[10px]">S</div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-30 text-[10px]">I</div>
        </div>
    );
};
