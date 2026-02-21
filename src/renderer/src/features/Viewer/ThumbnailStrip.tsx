import { useState, useEffect } from 'react';
import { useDatabase } from '../Database/DatabaseProvider';
import { useSettings } from '../Settings/SettingsContext';
import { Viewport } from './Viewport';
import { RefreshCw } from 'lucide-react';

interface SeriesSummary {
    seriesInstanceUID: string;
    seriesDescription: string;
    modality: string;
    seriesNumber: string;
    numImages: number;
    numFrames: number;
    numberOfFrames?: number;
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
    const { thumbnailMap, setCheckedItems, setShowSendModal: setGlobalShowSendModal, clearThumbnailCache } = useDatabase();
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

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, seriesUid: string } | null>(null);

    useEffect(() => {
        if (!patientId) {
            setSeriesList([]);
            onSelect(null);
            return;
        }

        const fetchSeries = async () => {
            console.log(`[ThumbnailStrip] Fetching for patientId: ${patientId}, studyUid: ${studyUid}, databasePath: ${databasePath}`);

            try {
                // 1. Fetch relevant studies
                let studies: any[] = [];
                if (studyUid) {
                    const s = await (window as any).electron.db.get(
                        'SELECT * FROM studies WHERE studyInstanceUID = ?',
                        [studyUid]
                    );
                    if (s) studies = [s];
                    else {
                        studies = await (window as any).electron.db.query(
                            'SELECT * FROM studies WHERE patientId = ? ORDER BY studyDate DESC',
                            [patientId]
                        );
                    }
                } else {
                    studies = await (window as any).electron.db.query(
                        'SELECT * FROM studies WHERE patientId = ? ORDER BY studyDate DESC',
                        [patientId]
                    );
                }

                if (studies.length === 0) {
                    setSeriesList([]);
                    onSelect(null);
                    return;
                }

                // 2. Fetch all series for all target studies at once
                const studyUids = studies.map(st => st.studyInstanceUID);
                const placeholder = studyUids.map(() => '?').join(',');
                const seriesDocsRaw = await (window as any).electron.db.query(
                    `SELECT s.* FROM series s 
                     JOIN studies st ON s.studyId = st.id 
                     WHERE st.studyInstanceUID IN (${placeholder}) 
                     ORDER BY s.seriesNumber ASC`,
                    studyUids
                );

                // Filter out empty series (SQLite stores number of instances too)
                const seriesDocs = seriesDocsRaw.filter((s: any) => (s.numberOfSeriesRelatedInstances || 0) > 0);

                // 3. Process series in PARALLEL to avoid serial await bottlenecks
                const allSeries: SeriesSummary[] = await Promise.all(seriesDocs.map(async (s: any) => {
                    const count = s.numberOfSeriesRelatedInstances || 0;
                    const middleIndex = Math.floor(count / 2);

                    // Fetch middle image for thumbnail
                    let firstImageResults = await (window as any).electron.db.query(
                        `SELECT i.* FROM instances i
                         JOIN series s_inner ON i.seriesId = s_inner.id
                         WHERE s_inner.seriesInstanceUID = ? 
                         ORDER BY i.instanceNumber ASC LIMIT 1 OFFSET ?`,
                        [s.seriesInstanceUID, middleIndex > 0 ? middleIndex : 0]
                    );

                    if (firstImageResults.length === 0 && middleIndex > 0) {
                        firstImageResults = await (window as any).electron.db.query(
                            `SELECT i.* FROM instances i
                             JOIN series s_inner ON i.seriesId = s_inner.id
                             WHERE s_inner.seriesInstanceUID = ? 
                             ORDER BY i.instanceNumber ASC LIMIT 1`,
                            [s.seriesInstanceUID]
                        );
                    }

                    const firstImage = firstImageResults[0];

                    const parentStudy = studies.find(sd => sd.studyInstanceUID === s.studyInstanceUID);

                    let thumbPath = firstImage ? firstImage.filePath : null;
                    if (thumbPath && !(thumbPath.startsWith('/') || /^[a-zA-Z]:/.test(thumbPath)) && databasePath) {
                        const sep = databasePath.includes('\\') ? '\\' : '/';
                        thumbPath = `${databasePath.replace(/[\\/]$/, '')}${sep}${thumbPath.replace(/^[\\/]/, '')}`;
                    }

                    let wc: number | undefined;
                    let ww: number | undefined;

                    if (firstImage) {
                        const normalize = (val: any) => {
                            if (typeof val === 'string' && val.includes('\\')) return Number(val.split('\\')[0]);
                            return Number(val);
                        };
                        wc = normalize(firstImage.windowCenter);
                        ww = normalize(firstImage.windowWidth);
                    }

                    const thumbId = thumbPath ? `electronfile://${thumbPath}${thumbPath.includes('?') ? '&' : '?'}seriesUid=${s.seriesInstanceUID}` : null;
                    if (!thumbId) {
                        console.warn(`[ThumbnailStrip] ⚠️ No thumbnailPath for series ${s.seriesInstanceUID} (${s.seriesDescription})`);
                    } else {
                        console.log(`[ThumbnailStrip] ✅ Thumbnail ID for ${s.seriesInstanceUID}: ${thumbId}`);
                    }

                    return {
                        seriesInstanceUID: s.seriesInstanceUID,
                        seriesDescription: `${parentStudy?.studyDate || ''} - ${s.seriesDescription}`,
                        modality: s.modality,
                        seriesNumber: String(s.seriesNumber),
                        numImages: s.numberOfSeriesRelatedInstances || 0,
                        numFrames: firstImage ? (firstImage.numberOfFrames || 1) : 1,
                        numberOfFrames: s.numberOfFrames,
                        thumbnailImageId: thumbId,
                        windowCenter: wc,
                        windowWidth: ww
                    } as SeriesSummary;
                }));

                setSeriesList(allSeries);

                if (allSeries.length > 0) {
                    // NOTE: Do NOT auto-select the first series here.
                    // This effect runs when patient/study changes, and auto-selecting
                    // would write data to the active viewport as a side effect.
                    // The user should explicitly click or drag a series to load it.
                } else {
                    onSelect(null);
                }
            } catch (err) {
                console.error('[ThumbnailStrip] Error fetching series:', err);
                setSeriesList([]);
            }
        };

        fetchSeries();

    }, [patientId, studyUid, databasePath]);

    return (
        <div className="w-full h-full bg-[#0a0a0b] flex flex-col select-none border-r border-white/5">
            {/* Header - Perfectionist Alignment */}
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-80">Series Browser</span>
                    <span className="text-[9px] font-bold text-gray-600 tabular-nums uppercase tracking-tighter">{seriesList.length} Items Available</span>
                </div>

                {/* Column Adjuster & Cache Refresh */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            clearThumbnailCache(seriesList.map(s => s.seriesInstanceUID));
                        }}
                        className="p-2 rounded-full hover:bg-white/5 transition-colors text-gray-600 hover:text-peregrine-accent"
                        title="Clear Thumbnail Cache"
                    >
                        <RefreshCw size={14} />
                    </button>

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
                            const data = JSON.stringify({ seriesUid: series.seriesInstanceUID });
                            e.dataTransfer.setData('application/json', data);
                            e.dataTransfer.setData('seriesUid', series.seriesInstanceUID);
                            e.dataTransfer.setData('text/plain', series.seriesInstanceUID);
                        }}
                        onClick={() => {
                            console.log('[ThumbnailStrip] Thumbnail clicked:', series.seriesInstanceUID);
                            onSelect(series.seriesInstanceUID);
                        }}
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
                            {(() => {
                                if (thumbnailMap[series.seriesInstanceUID]) {
                                    console.log(`[ThumbnailStrip] Rendering IMAGE from cache for ${series.seriesInstanceUID}`);
                                    return (
                                        <img
                                            src={thumbnailMap[series.seriesInstanceUID]}
                                            alt={series.seriesDescription}
                                            className="w-full h-full object-contain"
                                        />
                                    );
                                } else if (series.thumbnailImageId) {
                                    console.log(`[ThumbnailStrip] Rendering VIEWPORT for ${series.seriesInstanceUID} using ${series.thumbnailImageId}`);
                                    return (
                                        <Viewport
                                            viewportId={`thumb-${series.seriesInstanceUID}`}
                                            renderingEngineId="peregrine-engine"
                                            seriesUid={series.seriesInstanceUID}
                                            initialImageId={series.thumbnailImageId}
                                            isThumbnail={true}
                                            initialWindowCenter={series.windowCenter}
                                            initialWindowWidth={series.windowWidth}
                                        />
                                    );
                                } else {
                                    console.warn(`[ThumbnailStrip] Falling back to modality text for ${series.seriesInstanceUID}`);
                                    return (
                                        <div className="flex flex-col items-center">
                                            <span className={`text-[${cols > 4 ? '10px' : '14px'}] font-black tracking-tighter mb-0.5 ${selectedSeriesUid === series.seriesInstanceUID ? 'text-white' : 'text-gray-600'}`}>{series.modality}</span>
                                            <div className={`text-[${cols > 4 ? '7px' : '9px'}] font-bold text-gray-500`}>
                                                {series.numberOfFrames && series.numberOfFrames > 1 ? `${series.numberOfFrames} Frames` : series.numImages}
                                            </div>
                                        </div>
                                    );
                                }
                            })()}

                            {/* Label Overlay - Minimalist Gradient for maximum visibility */}
                            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                            <div className="absolute bottom-1 left-1.5 right-1.5 flex justify-between items-center z-10">
                                <span className={`text-[${cols > 4 ? '7px' : '9px'}] font-black uppercase tracking-tighter ${selectedSeriesUid === series.seriesInstanceUID ? 'text-peregrine-accent' : 'text-white/90'}`}>{series.modality}</span>
                                <span className={`text-[${cols > 4 ? '7px' : '9px'}] font-bold text-white/50`}>
                                    {series.numberOfFrames && series.numberOfFrames > 1 ? `${series.numberOfFrames} FR` : (series.numImages || 0)}

                                </span>
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
                            setCheckedItems(new Set([contextMenu.seriesUid]));
                            setGlobalShowSendModal(true);
                            setContextMenu(null);
                        }}
                    >
                        <span>Send to PACS...</span>
                    </button>
                </div>
            )}

        </div>
    );
};
