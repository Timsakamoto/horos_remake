import { Eye } from 'lucide-react';
import { useDatabase } from '../Database/DatabaseProvider';
import { Viewport } from './Viewport';
import { useEffect, useState } from 'react';

interface ImagePreviewProps {
    seriesUid: string | null;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ seriesUid }) => {
    const { db } = useDatabase();
    const [meta, setMeta] = useState<any>(null);

    useEffect(() => {
        if (!db || !seriesUid) {
            setMeta(null);
            return;
        }

        const fetchMeta = async () => {
            // Find series
            const series = await db.T_Subseries.findOne(seriesUid).exec();
            if (!series) return;

            // Find study
            const study = await db.T_Study.findOne(series.studyInstanceUID).exec();
            if (!study) return;

            // Find patient
            const patient = await db.T_Patient.findOne(study.patientId).exec();

            setMeta({
                patientName: patient?.patientName || 'Anonymous',
                patientID: patient?.patientID || 'Unknown',
                studyDate: study.studyDate,
                studyTime: study.studyTime,
                modality: series.modality,
                seriesDescription: series.seriesDescription,
                seriesNumber: series.seriesNumber,
                numImages: await db.T_FilePath.count({ selector: { seriesInstanceUID: seriesUid } }).exec()
            });
        };

        fetchMeta();
    }, [db, seriesUid]);

    return (
        <div className="flex-1 bg-black rounded-lg border border-white/5 overflow-hidden flex flex-col relative group shadow-2xl">
            {seriesUid ? (
                <>
                    {/* Rendering Area */}
                    <div className="flex-1 bg-[#050505] overflow-hidden">
                        <Viewport
                            viewportId={`preview-${seriesUid}`}
                            renderingEngineId={`preview-engine-${seriesUid}`}
                            seriesUid={seriesUid}
                            showOverlays={false}
                            autoFit={true}
                        />
                    </div>

                    {/* Corner Overlays (Peregrine Style) */}
                    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-20">
                        <div className="flex justify-between items-start">
                            {/* Top Left: Patient Info */}
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white shadow-sm">{meta?.patientName || 'Loading...'}</span>
                                <span className="text-[10px] text-white/70 font-mono shadow-sm">ID: {meta?.patientID || '...'}</span>
                            </div>
                            {/* Top Right: Study Info */}
                            <div className="flex flex-col items-end">
                                <span className="text-[11px] font-bold text-white shadow-sm">{meta?.studyDate || '----/--/--'}</span>
                                <span className="text-[10px] text-white/70 font-mono shadow-sm">{meta?.studyTime || '--:--:--'}</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-end">
                            {/* Bottom Left: Series Info */}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-peregrine-accent uppercase tracking-widest shadow-sm">
                                    Series {meta?.seriesNumber}: {meta?.seriesDescription?.slice(0, 20)}
                                </span>
                                <span className="text-[9px] text-white/50 font-bold shadow-sm">{meta?.modality} | {meta?.numImages} Imgs</span>
                            </div>
                            {/* Bottom Right: Image Specs */}
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] text-white/70 font-mono shadow-sm">512 x 512</span>
                                <span className="text-[11px] font-black text-peregrine-accent shadow-sm">PREVIEW</span>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-white/5 gap-3 border-2 border-dashed border-white/5 m-2 rounded-lg">
                    <Eye size={32} strokeWidth={1} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Select Series to Preview</span>
                </div>
            )}
        </div>
    );
};
