import { useState, useEffect } from 'react';
import { useDatabase } from '../Database/DatabaseProvider';
import { usePACS } from '../PACS/PACSProvider';
import { useSettings } from '../Settings/SettingsContext';
import { Viewport } from './Viewport';

interface SeriesSummary {
    seriesInstanceUID: string;
    seriesDescription: string;
    modality: string;
    seriesNumber: string;
    numImages: number;
    thumbnailImageId: string | null;
    windowCenter?: number;
    windowWidth?: number;
}

interface Props {
    patientId: string;
    studyUid?: string | null;
    selectedSeriesUid?: string | null;
    onSelect: (seriesUid: string | null) => void;
    defaultCols?: number;
    fixedCols?: number;
}

export const ThumbnailStrip = ({ patientId, studyUid, onSelect, selectedSeriesUid, defaultCols = 6, fixedCols }: Props) => {
    const { db } = useDatabase();
    const { thumbnailCols: savedCols, setThumbnailCols: setSavedCols, databasePath } = useSettings();
    const [cols, setCols] = useState(fixedCols || savedCols || defaultCols);
    const [seriesList, setSeriesList] = useState<SeriesSummary[]>([]);

    // Sync instance cols with saved settings (only if NOT fixed)
    useEffect(() => {
        if (fixedCols !== undefined) {
            setCols(fixedCols);
        } else if (savedCols) {
            setCols(savedCols);
        }
    }, [savedCols, fixedCols]);

    const handleSetCols = (newCols: number) => {
        if (fixedCols !== undefined) return; // Cannot change fixed cols
        setCols(newCols);
        setSavedCols(newCols);
    };

    const { servers, sendToPacs } = usePACS();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, seriesUid: string } | null>(null);
    const [showSendModal, setShowSendModal] = useState(false);
    const [selectedSeriesForSend, setSelectedSeriesForSend] = useState<string | null>(null);

    useEffect(() => {
        if (!db || !patientId) {
            // User Request: "If no data is selected, do not display."
            // Immediately clear the list if patientId is null.
            setSeriesList([]);
            onSelect(null);
            return;
        }

        const fetchSeries = async () => {
            console.log(`ThumbnailStrip: Starting fetchSeries. patientId="${patientId}", studyUid="${studyUid}"`);

            // 1. Fetch relevant studies
            let studies: any[] = [];
            if (studyUid) {
                const s = await db.T_Study.findOne({ selector: { studyInstanceUID: studyUid } }).exec();
                if (s) studies = [s];
                else {
                    studies = await db.T_Study.find({
                        selector: { patientId },
                        sort: [{ studyDate: 'desc' }]
                    }).exec();
                }
            } else {
                studies = await db.T_Study.find({
                    selector: { patientId },
                    sort: [{ studyDate: 'desc' }]
                }).exec();
            }

            if (studies.length === 0) {
                setSeriesList([]);
                onSelect(null);
                return;
            }

            // 2. Fetch all series for all target studies at once
            const studyUids = studies.map(st => st.studyInstanceUID);
            const seriesDocs = await db.T_Subseries.find({
                selector: { studyInstanceUID: { $in: studyUids } },
                sort: [{ seriesNumber: 'asc' }]
            }).exec();

            console.log(`ThumbnailStrip: Processing ${seriesDocs.length} series in parallel...`);

            // 3. Process series in PARALLEL to avoid serial await bottlenecks
            const allSeries: SeriesSummary[] = await Promise.all(seriesDocs.map(async (s) => {
                // Fetch the middle image for the thumbnail (more representative)
                const count = s.numberOfSeriesRelatedInstances || 0;
                const middleIndex = Math.floor(count / 2);

                const firstImageResults = await db.T_FilePath.find({
                    selector: { seriesInstanceUID: s.seriesInstanceUID },
                    sort: [{ instanceNumber: 'asc' }],
                    limit: 1,
                    skip: middleIndex > 0 ? middleIndex : 0
                }).exec();
                const firstImage = firstImageResults[0];

                const parentStudy = studies.find(sd => sd.studyInstanceUID === s.studyInstanceUID);

                let thumbPath = firstImage ? firstImage.filePath : null;
                if (thumbPath && !(thumbPath.startsWith('/') || /^[a-zA-Z]:/.test(thumbPath)) && databasePath) {
                    const sep = databasePath.includes('\\') ? '\\' : '/';
                    thumbPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${thumbPath.replace(/^[\\/]/, '')}`;
                }

                // Normalize WW/WL
                let wc: number | undefined;
                let ww: number | undefined;

                if (firstImage) {
                    const normalize = (val: any) => {
                        if (Array.isArray(val)) return Number(val[0]);
                        if (typeof val === 'string' && val.includes('\\')) return Number(val.split('\\')[0]);
                        return Number(val);
                    };
                    const c = normalize(firstImage.windowCenter);
                    const w = normalize(firstImage.windowWidth);
                    if (!isNaN(c) && !isNaN(w)) {
                        wc = c;
                        ww = w;
                    }
                }

                return {
                    seriesInstanceUID: s.seriesInstanceUID,
                    seriesDescription: `${parentStudy?.studyDate || ''} - ${s.seriesDescription}`,
                    modality: s.modality,
                    seriesNumber: String(s.seriesNumber),
                    numImages: s.numberOfSeriesRelatedInstances || 0, // Using recorded count
                    thumbnailImageId: thumbPath,
                    windowCenter: wc,
                    windowWidth: ww
                } as SeriesSummary;
            }));

            // Sort by series number as Promise.all result might be in order of completion (though array map preserves order)
            // Actually it preserves order, but we can re-sort if needed.

            setSeriesList(allSeries);

            // Auto-select first series if none selected or if current selection not in list
            if (allSeries.length > 0) {
                const isSelectedInList = allSeries.some(s => s.seriesInstanceUID === selectedSeriesUid);
                if (!selectedSeriesUid || !isSelectedInList) {
                    onSelect(allSeries[0].seriesInstanceUID);
                }
            } else {
                onSelect(null);
            }
        };

        fetchSeries();

    }, [db, patientId, studyUid, databasePath]);

    return (
        <div className="w-full h-full bg-[#0a0a0b] flex flex-col select-none border-r border-white/5">
            {/* Header - Perfectionist Alignment */}
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-80">Series Browser</span>
                    <span className="text-[9px] font-bold text-gray-600 tabular-nums uppercase tracking-tighter">{seriesList.length} Items Available</span>
                </div>

                {/* Column Adjuster - Hidden if fixedCols is active */}
                {fixedCols === undefined && (
                    <div className="flex items-center gap-2.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">Cols</span>
                        <input
                            type="range"
                            min="1"
                            max="12"
                            value={cols}
                            onChange={(e) => handleSetCols(parseInt(e.target.value))}
                            className="w-16 h-0.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-peregrine-accent"
                        />
                        <span className="text-[9px] font-black text-peregrine-accent w-3 text-center">{cols}</span>
                    </div>
                )}
            </div>

            <div
                className="flex-1 px-3.5 py-5 grid gap-3.5 items-start overflow-y-auto custom-scrollbar"
                style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                }}
            >
                {seriesList.map(series => (
                    <div
                        key={series.seriesInstanceUID}
                        draggable
                        onDragStart={(e) => {
                            e.dataTransfer.setData('seriesUid', series.seriesInstanceUID);
                            e.dataTransfer.setData('text/plain', series.seriesInstanceUID); // Fallback for robustness
                        }}
                        onClick={() => onSelect(series.seriesInstanceUID)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, seriesUid: series.seriesInstanceUID });
                        }}
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
                            <div className="absolute inset-0 bg-peregrine-accent/5 rounded-xl blur-lg animate-pulse" />
                        )}

                        <div className={`
                            w-full aspect-square rounded-lg mb-1.5 flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300 border
                            ${selectedSeriesUid === series.seriesInstanceUID
                                ? 'bg-black border-peregrine-accent shadow-[0_4px_20px_rgba(37,99,235,0.3)] scale-[1.02]'
                                : 'bg-black/80 border-white/5 group-hover:border-white/20'
                            }
                        `}>
                            {series.thumbnailImageId ? (
                                <Viewport
                                    viewportId={`thumb-${series.seriesInstanceUID}`}
                                    renderingEngineId="peregrine-engine"
                                    seriesUid={series.seriesInstanceUID}
                                    initialImageId={series.thumbnailImageId}
                                    isThumbnail={true}
                                    initialWindowCenter={series.windowCenter}
                                    initialWindowWidth={series.windowWidth}
                                />
                            ) : (
                                <div className="flex flex-col items-center">
                                    <span className={`text-[${cols > 4 ? '10px' : '14px'}] font-black tracking-tighter mb-0.5 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-600'}`}>{series.modality}</span>
                                    <div className={`text-[${cols > 4 ? '7px' : '9px'}] font-bold text-gray-500`}>{series.numImages}</div>
                                </div>
                            )}

                            {/* Label Overlay - Peregrine Style Glassmorphism */}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-md px-1.5 py-1.5 flex justify-between items-center z-10 border-t border-white/10">
                                <span className={`text-[${cols > 4 ? '7px' : '9px'}] font-black uppercase tracking-tighter ${selectedSeriesUid === series.seriesInstanceUID ? 'text-peregrine-accent' : 'text-white/90'}`}>{series.modality}</span>
                                <span className={`text-[${cols > 4 ? '7px' : '9px'}] font-bold text-white/50`}>{series.numImages} Items</span>
                            </div>
                        </div>

                        {cols < 6 && (
                            <div className="w-full px-0.5 space-y-0 relative z-10 text-center">
                                <div
                                    className={`text-[${cols > 3 ? '8px' : (cols === 1 ? '12px' : '10px')}] font-black leading-tight truncate transition-colors duration-300 uppercase tracking-tighter
                                        ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-500 group-hover:text-gray-400'}
                                    `}
                                    title={series.seriesDescription}
                                >
                                    {series.seriesDescription || '(No Description)'}
                                </div>
                                <div className="flex justify-center items-center gap-1 mt-0.5">
                                    <span className={`text-[${cols > 3 ? '7px' : '9px'}] font-bold tracking-widest
                                        ${selectedSeriesUid === series.seriesInstanceUID ? 'text-peregrine-accent' : 'text-gray-600'}
                                    `}>
                                        S. {series.seriesNumber}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>


            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl py-1 min-w-[160px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onMouseLeave={() => setContextMenu(null)}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-peregrine-accent hover:text-white transition-colors flex items-center gap-2"
                        onClick={() => {
                            setSelectedSeriesForSend(contextMenu.seriesUid);
                            setShowSendModal(true);
                            setContextMenu(null);
                        }}
                    >
                        <span>Send to PACS...</span>
                    </button>
                </div>
            )}

            {/* Send Modal */}
            {showSendModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowSendModal(false)}>
                    <div className="bg-[#1e1e1e] border border-white/10 rounded-xl w-[300px] p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-bold text-sm mb-3">Send Series to PACS</h3>
                        <div className="space-y-1 mb-4">
                            {servers.map(server => (
                                <button
                                    key={server.id}
                                    onClick={async () => {
                                        if (selectedSeriesForSend && db) {
                                            // Get file paths for series
                                            const files = await db.T_FilePath.find({ selector: { seriesInstanceUID: selectedSeriesForSend } }).exec();
                                            const filePaths = files.map(f => f.filePath);
                                            sendToPacs(server, filePaths);
                                            setShowSendModal(false);
                                        }
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5 rounded-lg transition-colors flex justify-between items-center group"
                                >
                                    <span>{server.aeTitle}</span>
                                    <span className="text-[9px] text-gray-500 group-hover:text-white/50">{server.address}:{server.port}</span>
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setShowSendModal(false)}
                            className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
