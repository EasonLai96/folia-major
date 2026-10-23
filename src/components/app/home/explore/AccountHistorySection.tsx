import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Play, Plus, RefreshCw } from 'lucide-react';
import type { SongResult, UnifiedSong } from '../../../../types';
import type { OmniProviderId } from '../../../../types/onlineMusic';
import { omni } from '../../../../services/onlineMusic/omni';
import { DurationChip, EXPLORE_PILL, EXPLORE_SERIF, EXPLORE_TOKENS, FOCUS_RING, Hairline, Picture } from './ExploreParts';
import { faceOf } from './exploreFace';
import { createAccountHistoryModel, type AccountHistoryScope } from './accountHistory';

// src/components/app/home/explore/AccountHistorySection.tsx
// The page's own labelled section with the active provider's account listening history, next to
// the sections the app keeps under every provider (ownSections.ts, what was played here) but
// separate from them: this one holds what the account played on the provider's own apps, under
// its own heading and with its own loading, empty, error and retry states, and further entries
// through its own "more" (it is a page of history, not a shelf of the provider's recommendation
// page, and it is read through Omni's optional `listeningHistory` capability only: where the
// provider tells Omni it has none, no section is here and nothing is asked). Read-only in every
// state: nothing is added to the provider's record or taken out of it, whatever the listener does.

// How wide a row's cards are: the section's faces are the explore tab's own square ones.
const CARD_WIDTH = 'w-[162px]';
// How many placeholder places a row holds open while its further entries are read.
const GHOST_TILES = 4;

const HistoryCard: React.FC<{ song: UnifiedSong; onPlay: () => void }> = ({ song, onPlay }) => {
    const { t } = useTranslation();
    const face = faceOf({ kind: 'song', song }, t);
    return (
        <div className={`shrink-0 snap-start ${CARD_WIDTH}`} data-account-history-card>
            <button
                type="button"
                title={face.title}
                onClick={onPlay}
                className={`group block w-full text-left ${FOCUS_RING}`}
            >
                <span className="relative block h-[162px] overflow-hidden rounded-2xl bg-[var(--ex-tint)] transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_24px_40px_-24px_rgba(0,0,0,0.75)] group-focus-visible:ring-2 group-focus-visible:ring-[color:var(--text-primary)]">
                    <Picture url={face.pictureUrl} size={480} className="h-full w-full" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/30 group-hover:opacity-100 group-focus-visible:opacity-100">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-xl">
                            <Play size={18} fill="currentColor" className="translate-x-px" />
                        </span>
                    </span>
                    <DurationChip durationMs={face.durationMs} className="bottom-2 right-2 transition-opacity duration-300 group-hover:opacity-0" />
                    <Hairline />
                </span>
                <span className="mt-3 block pr-2">
                    <span className="line-clamp-2 block text-sm font-medium leading-snug">{face.title}</span>
                    {face.subtitle && <span className="mt-1 block truncate text-xs text-[color:var(--ex-soft)]">{face.subtitle}</span>}
                </span>
            </button>
        </div>
    );
};

interface AccountHistorySectionProps {
    providerId: OmniProviderId;
    /** '' where nobody is signed in: another account is another history. */
    accountId: string;
    /** What a played entry does: it plays through this section's entries as the queue. */
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
}

export const AccountHistorySection: React.FC<AccountHistorySectionProps> = ({ providerId, accountId, onPlaySong }) => {
    const { t } = useTranslation();
    const read = useCallback((cursor?: string) => omni.getListeningHistory(cursor), []);
    // One model for the life of the page: the reads it began are what it settles.
    const [model] = useState(() => createAccountHistoryModel(read));
    const snapshot = useSyncExternalStore(model.subscribe, model.snapshot);

    // The page is read for the account in view: another account or provider takes the section
    // over with a read of its own, and answers of the one before are dropped as they come.
    useEffect(() => {
        if (!omni.supportsListeningHistory(providerId) || !accountId) {
            model.clear();
            return;
        }
        const scope: AccountHistoryScope = { providerId, accountId };
        model.show(scope);
    }, [model, providerId, accountId]);
    // Gone with the page: nothing is kept of the history, and what is still on its way is dropped.
    useEffect(() => () => model.clear(), [model]);

    const played = useCallback((song: UnifiedSong) => {
        onPlaySong(song, snapshot.items.map(entry => entry as SongResult));
    }, [onPlaySong, snapshot.items]);

    // Of a provider without the capability there is no section: not even its heading.
    if (!omni.supportsListeningHistory(providerId) || !accountId) return null;

    return (
        <section data-account-history className="pt-14 pb-2" style={EXPLORE_TOKENS}>
            <div className="mb-5 flex items-center gap-2.5">
                <h2 className="-my-1 min-w-0 text-[28px] font-medium leading-10 tracking-[0.01em]" style={{ fontFamily: EXPLORE_SERIF }}>
                    {omni.getProviderLabel(providerId)} · {t('home.exploreHistory')}
                </h2>
                <span aria-hidden className="ml-1 h-px min-w-6 flex-1 bg-[var(--ex-line)]" />
                <button
                    type="button"
                    data-account-history-refresh
                    title={snapshot.errorText ?? t('home.exploreRefresh')}
                    onClick={() => model.retry()}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center ${EXPLORE_PILL}`}
                >
                    <RefreshCw size={14} />
                </button>
            </div>
            {snapshot.status === 'loading' ? (
                <div className="flex justify-center py-16" aria-busy="true"><Loader2 size={28} className="animate-spin opacity-30" /></div>
            ) : snapshot.status === 'error' ? (
                <div className="flex flex-col items-center gap-4 py-16 text-sm text-[color:var(--ex-soft)]" data-account-history-failed>
                    <span>{t('home.exploreHistoryFailed')}</span>
                    <button type="button" data-account-history-retry onClick={() => model.retry()} className={`h-8 px-4 ${EXPLORE_PILL}`}>{t('home.exploreRetry')}</button>
                </div>
            ) : snapshot.items.length === 0 ? (
                <div className="flex justify-center py-16 text-sm text-[color:var(--ex-soft)]" data-account-history-empty>
                    {t('home.exploreHistoryEmpty')}
                </div>
            ) : (
                <>
                    <div className="flex snap-x items-start gap-5 overflow-x-auto pb-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-account-history-row>
                        {snapshot.items.map(entry => (
                            <HistoryCard key={`${entry.id}`} song={entry} onPlay={() => played(entry)} />
                        ))}
                        {snapshot.loadingMore && Array.from({ length: GHOST_TILES }, (_, ghost) => (
                            <div key={`ghost-${ghost}`} className={`shrink-0 ${CARD_WIDTH}`} data-account-history-ghost>
                                <span className="block h-[162px] animate-pulse rounded-2xl bg-[var(--ex-tint-strong)]" />
                                <span className="mt-3 block h-3 w-4/5 animate-pulse rounded-full bg-[var(--ex-tint-strong)]" />
                                <span className="mt-2 block h-2.5 w-1/2 animate-pulse rounded-full bg-[var(--ex-tint)]" />
                            </div>
                        ))}
                    </div>
                    {snapshot.nextCursor !== undefined && (
                        <div className="flex items-center justify-center gap-3 py-6">
                            <button
                                type="button"
                                data-account-history-more
                                disabled={snapshot.loadingMore}
                                onClick={() => model.loadMore()}
                                className={`flex h-8 items-center gap-1.5 px-3.5 ${EXPLORE_PILL}`}
                            >
                                {snapshot.loadingMore ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                <span>{snapshot.moreFailed ? t('home.exploreRetry') : t('home.exploreMore')}</span>
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default AccountHistorySection;
