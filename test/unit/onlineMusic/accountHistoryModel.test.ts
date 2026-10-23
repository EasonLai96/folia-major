import { describe, expect, it, vi } from 'vitest';
import { createAccountHistoryModel, type AccountHistoryScope } from '@/components/app/home/explore/accountHistory';
import type { UnifiedSong } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

// A read whose answer (or error) waits until the test lets it: keeps a late answer in hand.
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    // The model of the page attaches its own handlers; this one only keeps the test runner
    // from reading a rejection no handler stands at while a round is still out.
    promise.catch(() => undefined);
    return { promise, resolve, reject };
};

const song = (mediaId: string): UnifiedSong => ({
    id: mediaId, name: mediaId, artists: [], album: { id: '', name: '' }, durationMs: 1,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId },
});
const scope = (accountId: string): AccountHistoryScope => ({ providerId: 'netease', accountId });

const flush = (): Promise<unknown> => new Promise(resolve => setTimeout(resolve));

describe('accountHistory model', () => {
    it('reads its scope from the first page on show, and only once for the scope it already holds', async () => {
        const read = vi.fn().mockReturnValueOnce(deferred<any>().promise);
        const model = createAccountHistoryModel(read);

        model.show(scope('a'));
        expect(model.snapshot()).toMatchObject({ status: 'loading', items: [] });
        expect(read).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledWith(undefined);
        await flush();
        // The same scope again asks nothing: the history in hand stands.
        model.show(scope('a'));
        expect(read).toHaveBeenCalledOnce();
    });

    it('settles the first page into ready, with the token of what follows', async () => {
        const first = deferred<any>();
        const read = vi.fn().mockReturnValueOnce(first.promise);
        const model = createAccountHistoryModel(read);
        model.show(scope('a'));

        first.resolve({ items: [song('1'), song('2')], nextCursor: 'tok-2' });
        await flush();
        expect(model.snapshot()).toEqual({ status: 'ready', items: [song('1'), song('2')], nextCursor: 'tok-2', loadingMore: false, moreFailed: false, errorText: null });
    });

    it('appends the first page with the page after it, and asks nothing where no token was named', async () => {
        const further = deferred<any>();
        const read = vi.fn()
            .mockReturnValueOnce(Promise.resolve({ items: [song('1')], nextCursor: 'tok-2' }))
            .mockReturnValueOnce(further.promise);
        const model = createAccountHistoryModel(read);
        model.show(scope('a'));
        await flush();

        model.loadMore();
        expect(model.snapshot()).toMatchObject({ loadingMore: true });
        further.resolve({ items: [song('2'), song('3')] });
        await flush();
        expect(model.snapshot()).toEqual({ status: 'ready', items: [song('1'), song('2'), song('3')], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: null });
        expect(read).toHaveBeenCalledTimes(2);
        expect(read).toHaveBeenNthCalledWith(2, 'tok-2');
        // Nothing follows where no token was named: "more" asks nothing then.
        model.loadMore();
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('keeps the page shown and its cursor over a further read that failed to come', async () => {
        const failing = deferred<any>();
        const read = vi.fn()
            .mockReturnValueOnce(Promise.resolve({ items: [song('1')], nextCursor: 'tok-2' }))
            .mockReturnValueOnce(failing.promise);
        const model = createAccountHistoryModel(read);
        model.show(scope('a'));
        await flush();
        expect(model.snapshot().status).toBe('ready');

        model.loadMore();
        failing.reject(new Error('offline'));
        await flush();
        expect(model.snapshot()).toMatchObject({ status: 'ready', items: [song('1')], nextCursor: 'tok-2', loadingMore: false, moreFailed: true });
        // "More" asks again with the cursor it kept: the load is one page at a time.
        read.mockReturnValueOnce(Promise.resolve({ items: [song('2')] }));
        model.loadMore();
        await flush();
        expect(read).toHaveBeenLastCalledWith('tok-2');
        expect(model.snapshot()).toEqual({ status: 'ready', items: [song('1'), song('2')], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: null });
    });

    it('lets the page of a round before stand: answers of a taken-over scope arrive late to nothing', async () => {
        const firstOfA = deferred<any>();
        const firstOfB = deferred<any>();
        const read = vi.fn().mockReturnValueOnce(firstOfA.promise).mockReturnValueOnce(firstOfB.promise);
        const model = createAccountHistoryModel(read);

        model.show(scope('a'));
        model.show(scope('b'));
        firstOfA.resolve({ items: [song('1')], nextCursor: 'tok-2' });
        await flush();
        // A's answer is dropped: nothing of the other account stands here.
        expect(model.snapshot()).toMatchObject({ status: 'loading', items: [] });
        firstOfB.resolve({ items: [song('9')], nextCursor: 'tok-9' });
        await flush();
        expect(model.snapshot()).toEqual({ status: 'ready', items: [song('9')], nextCursor: 'tok-9', loadingMore: false, moreFailed: false, errorText: null });
    });

    it('retries from the first page: the entries of this read alone stand on the page retaken', async () => {
        const stuck = deferred<any>();
        const read = vi.fn()
            .mockReturnValueOnce(stuck.promise)
            .mockImplementation(async (cursor?: string) => (cursor === undefined
                ? { items: [song('1')], nextCursor: 'tok-2' }
                : { items: [song('2')] }));
        const model = createAccountHistoryModel(read);
        model.show(scope('a'));
        model.retry();
        await flush();
        expect(model.snapshot()).toEqual({ status: 'ready', items: [song('1')], nextCursor: 'tok-2', loadingMore: false, moreFailed: false, errorText: null });
        expect(read).toHaveBeenLastCalledWith(undefined);

        model.loadMore();
        await flush();
        expect(model.snapshot()).toMatchObject({ status: 'ready', items: [song('1'), song('2')] });

        // Again from the first page: the history read in parts may have changed in between.
        model.retry();
        expect(model.snapshot()).toMatchObject({ status: 'loading', items: [] });
        await flush();
        expect(read).toHaveBeenLastCalledWith(undefined);
        expect(model.snapshot()).toEqual({ status: 'ready', items: [song('1')], nextCursor: 'tok-2', loadingMore: false, moreFailed: false, errorText: null });
    });

    it('marks an error of the first page on the section, and reads it through the error text', async () => {
        const failing = Promise.reject(new Error('locked'));
        void failing.catch(() => undefined);
        const read = vi.fn(() => failing);
        const model = createAccountHistoryModel(read);
        model.show(scope('a'));
        await flush();
        expect(model.snapshot()).toEqual({ status: 'error', items: [], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: 'locked' });
        // A retry is a round of its own: an answer of the round before settles nothing.
        model.retry();
        expect(model.snapshot()).toMatchObject({ status: 'loading' });
        await flush();
        expect(read).toHaveBeenLastCalledWith(undefined);
        expect(read).toHaveBeenCalledTimes(2);
        expect(model.snapshot()).toEqual({ status: 'error', items: [], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: 'locked' });
    });

    it('lets go of everything on clear: a page of this model that comes late settles nothing', async () => {
        const pending = deferred<any>();
        const read = vi.fn().mockReturnValue(pending.promise);
        const model = createAccountHistoryModel(read);
        model.show(scope('a'));
        model.clear();
        expect(model.snapshot()).toEqual({ status: 'idle', items: [], nextCursor: undefined, loadingMore: false, moreFailed: false, errorText: null });
        pending.resolve({ items: [song('1')] });
        await flush();
        expect(model.snapshot()).toMatchObject({ status: 'idle', items: [] });
        // A model let go reads again only when it is asked anew.
        expect(read).toHaveBeenCalledTimes(1);
        model.show(scope('b'));
        expect(read).toHaveBeenCalledTimes(2);
    });
});
