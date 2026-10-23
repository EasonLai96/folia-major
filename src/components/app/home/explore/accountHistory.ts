import type { UnifiedSong } from '../../../../types';
import type { OmniProviderId, ProviderListeningHistoryPage } from '../../../../types/onlineMusic';
import { errorMessage } from '../../../../utils/errorText';

// src/components/app/home/explore/accountHistory.ts
// The account-history section behind the explore tab: the active provider's own record of what
// its account played, read page by page through Omni (`library.getListeningHistory`, the provider
// capability `listeningHistory`). This is the account's history and not the app's own one
// (recentPlays.ts): the app's own sections stand first on the tab and are made of what was played
// here, this section is labelled its own and holds what the platform remembers. Nothing here
// writes, removes or reorders anything remotely: reads only, whatever the listener does.
// Reads are commanded by the Ui (AccountHistorySection.tsx) through this model so that a page
// coming back late never writes where it is no longer asked: each `show` begins a new round, and
// an answer of a round before is dropped. Retries re-read from the first page: a history whose
// pages were asked for apart may have changed about. Kept in memory only (the provider's own app
// is where the account sees it), and a page that failed leaves its cursor: "more" asks again.

export interface AccountHistoryScope {
    providerId: OmniProviderId;
    /** '' where nobody is signed in. */
    accountId: string;
}

export interface AccountHistorySnapshot {
    /** `idle` where no account-history read was begun (no capability, or no one signed in). */
    status: 'idle' | 'loading' | 'ready' | 'error';
    items: UnifiedSong[];
    /** The provider's token for what follows `items`, to be handed back as it came. */
    nextCursor?: string;
    /** Further entries are being read; the page shown stays as it is meanwhile. */
    loadingMore: boolean;
    /** That further read failed; "more" asks again (the cursor stays with it). */
    moreFailed: boolean;
    errorText: string | null;
}

/** What the account-history page keeps: in memory, the account looks at it in its provider's own app. */
export type AccountHistoryModel = ReturnType<typeof createAccountHistoryModel>;

/** The page reads the history tells: the first page with no request, later ones with a cursor. */
export type AccountHistoryPageReader = (cursor: string | undefined) => Promise<ProviderListeningHistoryPage>;

/** The Ui's model: the history of one scope at a time, every read of one that is overtaken dropped. */
export const createAccountHistoryModel = (read: AccountHistoryPageReader) => {
    // Which read the pending answers belong to: each exchange of scope, each retry and each
    // read begun while another one was out makes it a new round.
    let generation = 0;
    let scope: AccountHistoryScope | null = null;
    const listeners = new Set<() => void>();
    let snapshot: AccountHistorySnapshot = { status: 'idle', items: [], loadingMore: false, moreFailed: false, errorText: null };
    const emit = () => {
        for (const listener of listeners) listener();
    };
    const patch = (part: Partial<AccountHistorySnapshot>): void => {
        snapshot = { ...snapshot, ...part };
        emit();
    };
    // The read of a round: the first page, or the one at `cursor`. An answer (or an error) of a
    // round before is dropped on arrival: the scope or the page of history asked may be another.
    const readPage = (stamp: number, cursor: string | undefined, whole: boolean): void => {
        const request = read(cursor);
        request.then(page => {
            if (stamp !== generation) return;
            if (!whole) {
                patch({
                    ...(page.items.length > 0 ? { items: [...snapshot.items, ...page.items] } : {}),
                    ...(page.nextCursor ? { nextCursor: page.nextCursor } : { nextCursor: undefined }),
                    loadingMore: false,
                    moreFailed: false,
                });
                if (!page.nextCursor && page.items.length === 0) console.log('[Explore] The account history named no more entries');
                return;
            }
            patch({
                status: 'ready',
                items: page.items,
                ...(page.nextCursor ? { nextCursor: page.nextCursor } : { nextCursor: undefined }),
                loadingMore: false,
                moreFailed: false,
                errorText: null,
            });
        }).catch(error => {
            if (stamp !== generation) return;
            if (!whole) {
                console.warn('[Explore] Further entries of the account history could not be read', error);
                // The cursor stays: it is what asks again.
                patch({ loadingMore: false, moreFailed: true });
                return;
            }
            console.warn('[Explore] The account history could not be read', error);
            patch({ status: 'error', errorText: errorMessage(error), loadingMore: false, moreFailed: false });
        });
    };
    return {
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        snapshot: () => snapshot,
        /** The history of this scope, read from its first page. A read begun for another one is let go. */
        show(next: AccountHistoryScope): void {
            if (scope && next.providerId === scope.providerId && next.accountId === scope.accountId) return;
            scope = { ...next };
            generation += 1;
            patch({ status: 'loading', items: [], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: null });
            void readPage(generation, undefined, true);
        },
        /** The first page and the ones after it, again: the history may have changed about. */
        retry(): void {
            if (!scope) return;
            generation += 1;
            patch({ status: 'loading', items: [], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: null });
            void readPage(generation, undefined, true);
        },
        /** The entries that follow the ones shown, if any were named. One request at a time. */
        loadMore(): void {
            const cursor = snapshot.nextCursor;
            if (!cursor || snapshot.loadingMore || snapshot.status !== 'ready') return;
            const stamp = generation;
            patch({ loadingMore: true, moreFailed: false });
            void readPage(stamp, cursor, false);
        },
        /** Lets go of the history: another scope takes the page, and answers of this one are dropped. */
        clear(): void {
            generation += 1;
            scope = null;
            snapshot = { status: 'idle', items: [], loadingMore: false, moreFailed: false, errorText: null };
            emit();
        },
    };
};
