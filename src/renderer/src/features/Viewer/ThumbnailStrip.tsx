import { useEffect, useState } from 'react';
import { useDatabase } from '../Database/DatabaseProvider';

interface SeriesSummary {
    seriesInstanceUID: string;
    seriesDescription: string;
    modality: string;
    seriesNumber: number;
    numImages: number;
}

interface Props {
    patientId: string;
    onSeriesSelect: (seriesUid: string) => void;
    activeSeriesUid: string | null;
}

export const ThumbnailStrip = ({ patientId, onSeriesSelect, activeSeriesUid }: Props) => {
    const db = useDatabase();
    const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);

    useEffect(() => {
        if (!db || !patientId) return;

        const fetchSeries = async () => {
            // 1. Get Studies
            const studies = await db.studies.find({
                selector: { patientId }
            }).exec();

            if (studies.length === 0) {
                setSeriesList([]);
                return;
            }

            // 2. Get Series for all studies (flat list for now)
            // Ideally we group by study, but for now just show all series
            const allSeries: SeriesSummary[] = [];

            for (const study of studies) {
                const seriesDocs = await db.series.find({
                    selector: { studyInstanceUID: study.studyInstanceUID },
                    sort: [{ seriesNumber: 'asc' }]
                }).exec();

                for (const s of seriesDocs) {
                    // Count images
                    // This count might be expensive if many images. 
                    // Optimization: store count in series doc on import.
                    // For now, just count.
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

            // Auto-select first series if none active
            if (!activeSeriesUid && allSeries.length > 0) {
                onSeriesSelect(allSeries[0].seriesInstanceUID);
            }
        };

        fetchSeries();

    }, [db, patientId]);

    return (
        <div className="w-32 bg-black border-r border-horos-border flex flex-col overflow-y-auto">
            <div className="p-2 text-xs text-gray-500 font-bold uppercase border-b border-white/10">
                Series
            </div>
            {seriesList.map(series => (
                <div
                    key={series.seriesInstanceUID}
                    onClick={() => onSeriesSelect(series.seriesInstanceUID)}
                    className={`
                        cursor-pointer p-2 border-b border-white/10 hover:bg-white/10 transition-colors
                        ${activeSeriesUid === series.seriesInstanceUID ? 'bg-blue-900/50 border-l-4 border-l-blue-500' : ''}
                    `}
                >
                    {/* Placeholder for actual thumbnail image */}
                    <div className="aspect-square bg-gray-800 mb-1 flex items-center justify-center text-gray-600 text-xs">
                        {series.modality}
                    </div>

                    <div className="text-xs text-gray-300 font-semibold truncate" title={series.seriesDescription}>
                        {series.seriesDescription || '(No Description)'}
                    </div>
                    <div className="text-[10px] text-gray-500 flex justify-between">
                        <span>#{series.seriesNumber}</span>
                        <span>{series.numImages} imgs</span>
                    </div>
                </div>
            ))}
        </div>
    );
};
