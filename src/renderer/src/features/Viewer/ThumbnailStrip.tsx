import { useState, useEffect } from 'react';
import { useDatabase } from '../Database/DatabaseContext';

interface SeriesSummary {
    seriesInstanceUID: string;
    seriesDescription: string;
    modality: string;
    seriesNumber: string;
    numImages: number;
}

interface Props {
    patientId: string;
    selectedSeriesUid?: string | null;
    onSelect: (seriesUid: string) => void;
}

export const ThumbnailStrip = ({ patientId, onSelect, selectedSeriesUid }: Props) => {
    const db = useDatabase();
    const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);

    useEffect(() => {
        if (!db || !patientId) return;

        const fetchSeries = async () => {
            const studies = await db.studies.find({
                selector: { patientId }
            }).exec();

            if (studies.length === 0) {
                setSeriesList([]);
                return;
            }

            const allSeries: SeriesSummary[] = [];

            for (const study of studies) {
                const seriesDocs = await db.series.find({
                    selector: { studyInstanceUID: study.studyInstanceUID },
                    sort: [{ seriesNumber: 'asc' }]
                }).exec();

                for (const s of seriesDocs) {
                    const count = await db.images.count({
                        selector: { seriesInstanceUID: s.seriesInstanceUID }
                    }).exec();

                    allSeries.push({
                        seriesInstanceUID: s.seriesInstanceUID,
                        seriesDescription: s.seriesDescription,
                        modality: s.modality,
                        seriesNumber: s.seriesNumber,
                        numImages: count
                    });
                }
            }

            setSeriesList(allSeries);

            if (!selectedSeriesUid && allSeries.length > 0) {
                onSelect(allSeries[0].seriesInstanceUID);
            }
        };

        fetchSeries();

    }, [db, patientId]);

    return (
        <div className="w-full h-full bg-[#0a0a0b] flex flex-col overflow-y-auto select-none custom-scrollbar">
            {/* Header - Perfectionist Alignment */}
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Series Browser</span>
                <span className="text-[10px] font-bold text-gray-600 tabular-nums">{seriesList.length}</span>
            </div>

            <div className="flex-1 px-3 py-4 space-y-4">
                {seriesList.map(series => (
                    <div
                        key={series.seriesInstanceUID}
                        onClick={() => onSelect(series.seriesInstanceUID)}
                        className={`
                            group cursor-pointer rounded-2xl p-2 transition-all duration-500 relative
                            ${selectedSeriesUid === series.seriesInstanceUID
                                ? 'bg-white/5 ring-1 ring-white/10 shadow-2xl'
                                : 'hover:bg-white/[0.02]'
                            }
                        `}
                    >
                        {/* Selected Indicator - Glow Effect */}
                        {selectedSeriesUid === series.seriesInstanceUID && (
                            <div className="absolute inset-0 bg-horos-accent/5 rounded-2xl blur-xl animate-pulse" />
                        )}

                        {/* Thumbnail Placeholder - Modern Flat Dark */}
                        <div className={`
                            aspect-square rounded-xl mb-3 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-700
                            ${selectedSeriesUid === series.seriesInstanceUID
                                ? 'bg-horos-accent shadow-[0_4px_20px_rgba(37,99,235,0.25)] scale-[1.02]'
                                : 'bg-white/[0.03] group-hover:bg-white/[0.05]'
                            }
                        `}>
                            <span className={`
                                text-[13px] font-black tracking-tighter mb-1
                                ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'}
                            `}>
                                {series.modality}
                            </span>
                            <div className={`
                                px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest
                                ${selectedSeriesUid === series.seriesInstanceUID
                                    ? 'bg-white/20 text-white'
                                    : 'bg-white/5 text-gray-600'
                                }
                            `}>
                                {series.numImages} Instances
                            </div>
                        </div>

                        <div className="px-1.5 space-y-1 relative z-10">
                            <div
                                className={`text-[11px] font-bold leading-tight truncate transition-colors duration-300
                                    ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}
                                `}
                                title={series.seriesDescription}
                            >
                                {series.seriesDescription || '(No Description)'}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className={`text-[9px] font-bold tracking-tight
                                    ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white/40' : 'text-gray-600'}
                                `}>
                                    Series {series.seriesNumber}
                                </span>
                                {selectedSeriesUid === series.seriesInstanceUID && (
                                    <div className="w-1 h-1 rounded-full bg-horos-accent shadow-[0_0_8px_rgba(37,99,235,1)]" />
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Empty State Shadow Fill */}
            <div className="flex-1" />
        </div>
    );
};
