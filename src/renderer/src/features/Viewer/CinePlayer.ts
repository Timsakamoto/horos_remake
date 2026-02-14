import { getRenderingEngine, type Types } from '@cornerstonejs/core';

export interface CineState {
    isPlaying: boolean;
    framesPerSecond: number;
    loop: boolean;
}

const cineStates = new Map<string, CineState>();
const cineIntervals = new Map<string, any>();

export const startCine = (
    viewportId: string,
    renderingEngineId: string,
    fps: number = 24
) => {
    stopCine(viewportId);

    // Guard against zero or negative fps which would cause infinite loop or error
    const safeFps = Math.max(1, fps);

    const state: CineState = {
        isPlaying: true,
        framesPerSecond: safeFps,
        loop: true
    };
    cineStates.set(viewportId, state);

    const interval = setInterval(() => {
        const renderingEngine = getRenderingEngine(renderingEngineId);
        if (!renderingEngine) {
            stopCine(viewportId);
            return;
        }

        const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
        if (!viewport) return;

        const currentImageIdIndex = viewport.getCurrentImageIdIndex();
        const numImages = viewport.getImageIds().length;

        let nextIndex = currentImageIdIndex + 1;
        if (nextIndex >= numImages) {
            nextIndex = 0;
        }

        viewport.setImageIdIndex(nextIndex);
    }, 1000 / safeFps);

    cineIntervals.set(viewportId, interval);
};

export const stopCine = (viewportId: string) => {
    const interval = cineIntervals.get(viewportId);
    if (interval) {
        clearInterval(interval);
        cineIntervals.delete(viewportId);
    }
    cineStates.delete(viewportId);
};

export const getCineState = (viewportId: string): CineState | undefined => {
    return cineStates.get(viewportId);
};
