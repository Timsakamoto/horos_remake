import { Eye } from 'lucide-react';
import { Viewport } from './Viewport';
import { useEffect, useState } from 'react';

interface ImagePreviewProps {
    seriesUid: string | null;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ seriesUid }) => {
    const [meta, setMeta] = useState<any>(null);

    useEffect(() => {
        if (!seriesUid) {
            setMeta(null);
            return;
        }

        const fetchMeta = async () => {
            try {
                // Find series
                const series = await (window as any).electron.db.get('SELECT * FROM series WHERE seriesInstanceUID = ?', [seriesUid]);
                if (!series) return;

                // Find study
                const studyResult = await (window as any).electron.db.get(
                    'SELECT st.* FROM studies st JOIN series s ON s.studyId = st.id WHERE s.seriesInstanceUID = ?',
                    [seriesUid]
                );
                if (!studyResult) return;

                // Find patient
                const patient = await (window as any).electron.db.get('SELECT * FROM patients WHERE id = ?', [studyResult.patientId]);

                // Count images
                const countResult = await (window as any).electron.db.get(
                    'SELECT COUNT(i.id) as count FROM instances i JOIN series s ON i.seriesId = s.id WHERE s.seriesInstanceUID = ?',
                    [seriesUid]
                );

                setMeta({
                    patientName: patient?.patientName || 'Anonymous',
                    patientID: patient?.patientID || 'Unknown',
                    studyDate: studyResult.studyDate,
                    studyTime: studyResult.studyTime,
                    modality: series.modality,
                    seriesDescription: series.seriesDescription,
                    seriesNumber: series.seriesNumber,
                    numImages: countResult?.count || 0
                });
            } catch (err) {
                console.error('[ImagePreview] Error fetching metadata:', err);
            }
        };

        fetchMeta();
    }, [seriesUid]);

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
