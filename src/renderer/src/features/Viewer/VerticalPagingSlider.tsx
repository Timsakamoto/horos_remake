import React from 'react';

interface Props {
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
}

export const VerticalPagingSlider = ({ min, max, value, onChange }: Props) => {
    // Prevent rendering if there's only one slice or invalid range
    if (max <= min) return null;

    const percentage = ((value - min) / (max - min)) * 100;

    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = Math.max(0, Math.min(1, y / rect.height));
        // Inverse ratio because we want top to be min and bottom to be max (or vice versa)
        // Actually, for vertical sliders in viewers, top is usually first slice (min) and bottom is last slice (max)
        const newValue = Math.round(min + ratio * (max - min));
        onChange(newValue);
    };

    return (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 h-3/4 w-6 flex flex-col items-center group z-30">
            {/* Range Labels */}
            <div className="text-[9px] font-black text-white/30 mb-2 uppercase tracking-tighter select-none">
                {min}
            </div>

            {/* Slider Track Container */}
            <div
                className="flex-1 w-1.5 bg-white/10 rounded-full relative cursor-pointer hover:bg-white/20 transition-colors"
                onClick={handleTrackClick}
            >
                {/* Active Range (Optional, maybe just a path) */}
                <div
                    className="absolute top-0 left-0 right-0 bg-horos-accent/40 rounded-full"
                    style={{ height: `${percentage}%` }}
                />

                {/* Handle */}
                <div
                    className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-horos-accent flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 transition-transform"
                    style={{ top: `${percentage}%`, marginTop: '-8px' }}
                    draggable
                    onDrag={(e) => {
                        if (e.clientY === 0) return; // Ignore end of drag
                        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const ratio = Math.max(0, Math.min(1, y / rect.height));
                        const newValue = Math.round(min + ratio * (max - min));
                        if (newValue !== value) onChange(newValue);
                    }}
                >
                    <div className="w-1.5 h-1.5 bg-horos-accent rounded-full animate-pulse" />
                </div>
            </div>

            <div className="text-[9px] font-black text-white/30 mt-2 uppercase tracking-tighter select-none">
                {max}
            </div>

            {/* Tooltip on Hover */}
            <div className="absolute -left-12 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded border border-white/10 pointer-events-none whitespace-nowrap"
                style={{ top: `${percentage}%`, transform: 'translateY(-50%)' }}>
                Slice {value}
            </div>
        </div>
    );
};
