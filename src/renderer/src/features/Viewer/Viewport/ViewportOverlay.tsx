import { OverlayManager } from '../OverlayManager';
import { VerticalPagingSlider } from '../VerticalPagingSlider';

interface ViewportOverlayProps {
    isThumbnail?: boolean;
    isActive?: boolean;
    seriesUid: string | null;
    metadata: any;
    showOverlays?: boolean;
    status: string;
    onSliceChange: (sliceIndex: number) => void;
}

export const ViewportOverlay = ({
    isThumbnail = false,
    isActive = false,
    seriesUid,
    metadata,
    showOverlays = true,
    status,
    onSliceChange
}: ViewportOverlayProps) => {
    return (
        <>
            {/* Active Highlight & Label */}
            {isActive && (
                <div className="absolute inset-0 pointer-events-none border border-peregrine-accent z-20 shadow-[inset_0_0_10px_rgba(37,99,235,0.2)]">
                    <div className="absolute top-0 right-0 bg-peregrine-accent text-white text-[8px] font-black px-1.5 py-0.5 uppercase tracking-widest shadow-lg">
                        Active
                    </div>
                </div>
            )}

            {/* Vertical Paging Slider for multi-slice datasets (CT/MRI) */}
            {!isThumbnail && metadata?.totalInstances > 1 && (
                <VerticalPagingSlider
                    min={1}
                    max={metadata.totalInstances}
                    value={metadata.instanceNumber || 1}
                    onChange={onSliceChange}
                />
            )}

            {!isThumbnail && !seriesUid && (
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center pointer-events-none">
                    <div className="flex flex-col items-center gap-4 text-white/20">
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                            <span className="text-xl">+</span>
                        </div>
                        <p className="text-[11px] font-medium leading-relaxed tracking-wide">
                            表示するシリーズをクリック<br />orドラッグ&ドロップしてください
                        </p>
                    </div>
                </div>
            )}

            {!isThumbnail && showOverlays && seriesUid && <OverlayManager metadata={metadata} />}

            {status && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-peregrine-accent border-t-transparent rounded-full animate-spin" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{status}</span>
                    </div>
                </div>
            )}
        </>
    );
};
