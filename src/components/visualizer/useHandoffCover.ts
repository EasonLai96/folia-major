import { useState } from 'react';
import type { VisualizerSharedProps, VisualizerSongHandoff } from './definition';

// src/components/visualizer/useHandoffCover.ts
// The cover address the backdrop draws (VisualizerRenderer). A song's cover often comes again at
// another address (the network copy, then the cached one), and a background keyed on the address
// would change again for the same picture: mid-blend, dropping the outgoing background, or at the
// settle. So for a blend's incoming song it is the first address the hand-off gave, kept while that
// song is shown.

/** A blend's incoming song and the cover address the backdrop keeps for it. */
export interface KeptHandoffCover {
    seed: string | number;
    coverUrl: string;
}

/**
 * The cover the backdrop keeps for a blend's incoming song: the first address the hand-off gave it,
 * kept while that song is shown (`shownSeed`), and dropped once another one is.
 */
export const keepHandoffCover = (
    kept: KeptHandoffCover | null,
    songHandoff: Pick<VisualizerSongHandoff, 'seed' | 'coverUrl'> | null,
    shownSeed: string | number | undefined,
): KeptHandoffCover | null => {
    const still = kept && kept.seed === shownSeed ? kept : null;
    if (still || !songHandoff?.coverUrl) return still;
    return { seed: songHandoff.seed, coverUrl: songHandoff.coverUrl };
};

/** The cover address the backdrop draws, given the hand-off and the shown song's own seed and cover. */
export const useHandoffCover = (
    songHandoff: VisualizerSongHandoff | null,
    seed: VisualizerSharedProps['seed'],
    coverUrl: VisualizerSharedProps['coverUrl'],
): VisualizerSharedProps['coverUrl'] => {
    const [kept, setKept] = useState<KeptHandoffCover | null>(null);
    const next = keepHandoffCover(kept, songHandoff, songHandoff ? songHandoff.seed : seed);
    if (next !== kept) setKept(next);
    return next?.coverUrl ?? (songHandoff ? songHandoff.coverUrl : coverUrl);
};
