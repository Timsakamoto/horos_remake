import React, { useRef, useState, useEffect } from 'react';

interface Props {
    min: number;
    max: number;
    value: number;
    onChange: (value: number) => void;
}

export const VerticalPagingSlider = ({ min, max, value, onChange }: Props) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Prevent rendering if there's only one slice or invalid range
    if (max <= min) return null;

    // Ensure value is within bounds (prevents handle jumping outside during transitions)
    const clampedValue = Math.max(min, Math.min(max, value));
    const percentage = ((clampedValue - min) / (max - min)) * 100;


    const handlePointerMove = (e: PointerEvent) => {
        if (!isDragging || !trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = Math.max(0, Math.min(1, y / rect.height));

        // Linear mapping: Top (ratio=0) -> min, Bottom (ratio=1) -> max
        const newValue = Math.round(min + ratio * (max - min));
        if (newValue !== value) {
            onChange(newValue);
        }
    };

    const handlePointerUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        } else {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isDragging, value, min, max]);

    const containerRef = useRef<HTMLDivElement>(null);

    // native event blocking to ensure Cornerstone never sees these events
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const blocker = (e: Event) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        // Block all events that could trigger a tool start in Cornerstone
        const events = ['mousedown', 'pointerdown', 'touchstart', 'click', 'dblclick', 'contextmenu'];
        events.forEach(name => {
            el.addEventListener(name, blocker, { capture: true });
        });

        return () => {
            events.forEach(name => {
                el.removeEventListener(name, blocker, { capture: true });
            });
        };
    }, []);

    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const ratio = Math.max(0, Math.min(1, y / rect.height));
        const newValue = Math.round(min + ratio * (max - min));
        onChange(newValue);
    };

    // --- DEBUG LOG ---
    // console.log(`[SliderDebug] ${clampedValue}/${max} (${percentage.toFixed(1)}%)`);

    return (
        <div
            className="absolute right-2 top-1/2 -translate-y-1/2 h-3/4 w-6 flex flex-col items-center group z-30 select-none paging-slider-container"
        >
            {/* Range Labels */}
            <div className="text-[9px] font-black text-white/30 mb-2 uppercase tracking-tighter">
                {min}
            </div>

            {/* Slider Track Container */}
            <div
                ref={trackRef}
                className="flex-1 w-1.5 bg-white/10 rounded-full relative cursor-pointer hover:bg-white/20 transition-colors"
                onPointerDown={(e) => {
                    setIsDragging(true);
                    handleTrackClick(e);
                }}
            >
                {/* Handle */}
                <div
                    className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-peregrine-accent flex items-center justify-center cursor-grab active:cursor-grabbing hover:scale-110 z-10"
                    style={{ top: `${percentage}%`, marginTop: '-8px' }}
                >
                    <div className="w-1.5 h-1.5 bg-peregrine-accent rounded-full animate-pulse" />
                </div>
            </div>

            <div className="text-[9px] font-black text-white/30 mt-2 uppercase tracking-tighter">
                {max}
            </div>

            {/* Tooltip on Hover or Drag */}
            {(isDragging || true) && (
                <div
                    className={`absolute -left-12 transition-opacity duration-200 bg-black/80 text-white text-[10px] font-bold px-2 py-1 rounded border border-white/10 pointer-events-none whitespace-nowrap ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    style={{ top: `${percentage}%`, transform: 'translateY(-50%)' }}
                >
                    Slice {clampedValue}
                </div>
            )}
        </div>
    );
};
