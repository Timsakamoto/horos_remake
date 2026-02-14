import { useState, useEffect } from 'react';
import { useDatabase } from '../Database/DatabaseProvider';
import { Viewport } from './Viewport';

interface SeriesSummary {
    seriesInstanceUID: string;
    seriesDescription: string;
    modality: string;
    seriesNumber: string;
    numImages: number;
    thumbnailImageId: string | null;
}

interface Props {
    patientId: string;
    studyUid?: string | null;
    selectedSeriesUid?: string | null;
    onSelect: (seriesUid: string | null) => void;
}

export const ThumbnailStrip = ({ patientId, studyUid, onSelect, selectedSeriesUid }: Props) => {
    const { db, lastDeletionTime } = useDatabase();
    const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);
    const [cols, setCols] = useState(4);

    useEffect(() => {
        if (!db || !patientId) return;

        const fetchSeries = async () => {
            let targetStudies: string[] = [];

            if (studyUid) {
                targetStudies = [studyUid];
            } else {
                const studies = await db.T_Study.find({
                    selector: { patientId }
                }).exec();
                targetStudies = studies.map(s => s.studyInstanceUID);
            }

            if (targetStudies.length === 0) {
                setSeriesList([]);
                onSelect(null);
                return;
            }

            const allSeries: SeriesSummary[] = [];

            for (const sUid of targetStudies) {
                const seriesDocs = await db.T_Subseries.find({
                    selector: { studyInstanceUID: sUid },
                    sort: [{ seriesNumber: 'asc' }]
                }).exec();

                for (const s of seriesDocs) {
                    const count = await db.T_FilePath.count({
                        selector: { seriesInstanceUID: s.seriesInstanceUID }
                    }).exec();

                    // Fetch the middle slice instead of the first slice for a more representative thumbnail
                    const middleIndex = Math.floor(count / 2);
                    const middleImageDocs = await db.T_FilePath.find({
                        selector: { seriesInstanceUID: s.seriesInstanceUID },
                        sort: [{ instanceNumber: 'asc' }],
                        skip: middleIndex,
                        limit: 1
                    }).exec();
                    const middleImage = middleImageDocs[0];

                    allSeries.push({
                        seriesInstanceUID: s.seriesInstanceUID,
                        seriesDescription: s.seriesDescription,
                        modality: s.modality,
                        seriesNumber: String(s.seriesNumber),
                        numImages: count,
                        thumbnailImageId: middleImage ? middleImage.filePath : null
                    });
                }
            }

            setSeriesList(allSeries);

            // Auto-select first series if none selected or if current selection not in list
            if (allSeries.length > 0) {
                const isSelectedInList = allSeries.some(s => s.seriesInstanceUID === selectedSeriesUid);
                if (!selectedSeriesUid || !isSelectedInList) {
                    onSelect(allSeries[0].seriesInstanceUID);
                }
            } else {
                // If no series found (e.g. after deletion), clear selection
                onSelect(null);
            }
        };

        fetchSeries();

    }, [db, patientId, studyUid, lastDeletionTime]);

    return (
        <div className="w-full h-full bg-[#0a0a0b] flex flex-col select-none border-r border-white/5">
            {/* Header - Perfectionist Alignment */}
            <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Series Browser</span>
                    <span className="text-[9px] font-bold text-gray-600 tabular-nums">{seriesList.length} Series Loaded</span>
                </div>

                {/* Size Controls */}
                <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Size</span>
                    <input
                        type="range"
                        min="2"
                        max="6"
                        value={8 - cols}
                        onChange={(e) => setCols(8 - parseInt(e.target.value))}
                        className="w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-horos-accent"
                    />
                    <span className="text-[9px] font-black text-horos-accent w-3 text-center">{cols}</span>
                </div>
            </div>

            <div
                className="flex-1 px-3 py-4 grid gap-3 items-start overflow-y-auto"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                }}
            >
                {seriesList.map(series => (
                    <div
                        key={series.seriesInstanceUID}
                        onClick={() => onSelect(series.seriesInstanceUID)}
                        className={`
                            group cursor-pointer rounded-xl p-1.5 transition-all duration-300 relative flex flex-col items-center
                            ${selectedSeriesUid === series.seriesInstanceUID
                                ? 'bg-white/5 ring-1 ring-white/10 shadow-lg'
                                : 'hover:bg-white/[0.02]'
                            }
                        `}
                    >
                        {/* Selected Indicator - Glow Effect */}
                        {selectedSeriesUid === series.seriesInstanceUID && (
                            <div className="absolute inset-0 bg-horos-accent/5 rounded-xl blur-lg animate-pulse" />
                        )}

                        <div className={`
                            w-full aspect-square rounded-lg mb-1.5 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300 border
                            ${selectedSeriesUid === series.seriesInstanceUID
                                ? 'bg-black border-horos-accent shadow-[0_4px_20px_rgba(37,99,235,0.3)] scale-[1.02]'
                                : 'bg-black/80 border-white/5 group-hover:border-white/20'
                            }
                        `}>
                            {series.thumbnailImageId ? (
                                <Viewport
                                    viewportId={`thumb-${series.seriesInstanceUID}`}
                                    renderingEngineId={`thumb-engine-${series.seriesInstanceUID}`}
                                    seriesUid={series.seriesInstanceUID}
                                    isThumbnail={true}
                                />
                            ) : (
                                <div className="flex flex-col items-center">
                                    <span className={`text-[${cols > 4 ? '10px' : '12px'}] font-black tracking-tighter mb-0.5 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-600'}`}>{series.modality}</span>
                                    <div className="text-[7px] font-bold text-gray-500">{series.numImages}</div>
                                </div>
                            )}

                            {/* Label Overlay - Horos Style Glassmorphism */}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-md px-1.5 py-1 flex justify-between items-center z-10 border-t border-white/10">
                                <span className={`text-[7px] font-black uppercase tracking-tighter ${selectedSeriesUid === series.seriesInstanceUID ? 'text-horos-accent' : 'text-white/90'}`}>{series.modality}</span>
                                <span className="text-[7px] font-bold text-white/50">{series.numImages} Items</span>
                            </div>
                        </div>

                        {cols < 6 && (
                            <div className="w-full px-0.5 space-y-0 relative z-10 text-center">
                                <div
                                    className={`text-[${cols > 3 ? '8px' : '9px'}] font-black leading-tight truncate transition-colors duration-300 uppercase tracking-tighter
                                        ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}
                                    `}
                                    title={series.seriesDescription}
                                >
                                    {series.seriesDescription || '(No Description)'}
                                </div>
                                <div className="flex justify-center items-center gap-1 mt-0.5">
                                    <span className={`text-[7px] font-bold tracking-widest
                                        ${selectedSeriesUid === series.seriesInstanceUID ? 'text-horos-accent' : 'text-gray-600'}
                                    `}>
                                        S. {series.seriesNumber}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

        </div>
    );
};
