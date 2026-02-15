import { useState } from 'react';
import { LayoutGrid } from 'lucide-react';

interface Props {
    currentLayout: { rows: number; cols: number };
    onChange: (rows: number, cols: number) => void;
}

export const GridSelector = ({ currentLayout, onChange }: Props) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoverLayout, setHoverLayout] = useState<{ rows: number; cols: number } | null>(null);

    const maxRows = 3;
    const maxCols = 4;

    const rows = Array.from({ length: maxRows }, (_, i) => i + 1);
    const cols = Array.from({ length: maxCols }, (_, i) => i + 1);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    flex flex-col items-center justify-center min-w-[52px] h-[52px] rounded-lg transition-all duration-200 gap-1
                    ${isOpen
                        ? 'bg-peregrine-accent/15 border border-peregrine-accent/30 text-peregrine-accent shadow-[0_0_15px_rgba(37,99,235,0.15)]'
                        : 'text-gray-400 hover:bg-black/5 hover:text-gray-900 group'
                    }
                `}
                title="Viewport Layout"
            >
                <LayoutGrid size={18} className={isOpen ? 'text-peregrine-accent' : 'group-hover:text-gray-900 transition-colors'} />
                <span className="text-[8px] font-black uppercase tracking-tighter">
                    {currentLayout.cols}x{currentLayout.rows}
                </span>
            </button>

            {isOpen && (
                <>
                    {/* Backdrop to close */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Popover */}
                    <div className="absolute top-full left-0 mt-2 z-50 bg-[#fdfdfd] border border-[#d1d1d6] rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] p-4 min-w-[180px] animate-in fade-in zoom-in duration-200 origin-top-left">
                        <div className="mb-3 px-1">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Select Layout</span>
                            <div className="text-[9px] font-bold text-peregrine-accent mt-0.5">
                                {hoverLayout
                                    ? `${hoverLayout.cols} Columns × ${hoverLayout.rows} Rows`
                                    : `${currentLayout.cols} Columns × ${currentLayout.rows} Rows`
                                }
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            {rows.map(r => (
                                <div key={r} className="flex gap-1.5">
                                    {cols.map(c => {
                                        const isActive = c <= currentLayout.cols && r <= currentLayout.rows;
                                        const isHovered = hoverLayout && c <= hoverLayout.cols && r <= hoverLayout.rows;

                                        return (
                                            <div
                                                key={c}
                                                onMouseEnter={() => setHoverLayout({ rows: r, cols: c })}
                                                onMouseLeave={() => setHoverLayout(null)}
                                                onClick={() => {
                                                    onChange(r, c);
                                                    setIsOpen(false);
                                                }}
                                                className={`
                                                    w-8 h-6 rounded-md border-2 transition-all duration-100 cursor-pointer
                                                    ${isHovered
                                                        ? 'bg-peregrine-accent border-peregrine-accent scale-105 shadow-[0_0_8px_rgba(37,99,235,0.4)]'
                                                        : isActive
                                                            ? 'bg-peregrine-accent/40 border-peregrine-accent/60'
                                                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                                                    }
                                                `}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-[9px] font-bold text-gray-400">
                            <span>Max 4×3</span>
                            <span className="text-peregrine-accent/50 uppercase tracking-tighter">Peregrine Grid</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
