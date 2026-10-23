import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    android: { value: true },
    request: vi.fn(),
}));

vi.mock('../../../src/platform/runtime', () => ({
    isCapacitorAndroid: () => mocks.android.value,
}));

vi.mock('../../../src/services/onlineMusic/qishui/android/qishuiAndroid', () => ({
    requestQishuiOnAndroid: mocks.request,
}));

import {
    QISHUI_BRIDGE_FAILED, QISHUI_NEEDS_ANDROID, QishuiRequestError,
    getQishuiAvailability, getQishuiLastFailure, requestQishui,
} from '../../../src/services/onlineMusic/qishui/qishuiTransport';

describe('qishui transport', () => {
    beforeEach(() => {
        mocks.android.value = true;
        mocks.request.mockReset();
    });

    it('reports unavailable outside the Android app', async () => {
        mocks.android.value = false;
        expect(getQishuiAvailability()).toEqual({ configured: false, reason: 'runtime-unavailable' });
        await expect(requestQishui('search')).rejects.toMatchObject({
            code: 'unavailable', message: QISHUI_NEEDS_ANDROID,
        });
        expect(mocks.request).not.toHaveBeenCalled();
    });

    it('passes the operation and params through the native bridge', async () => {
        mocks.request.mockResolvedValue({ ok: true, data: { items: [] } });
        await expect(requestQishui('search', { query: 'a', limit: 20 })).resolves.toEqual({ items: [] });
        expect(mocks.request).toHaveBeenCalledWith('search', { query: 'a', limit: 20 });
    });

    it('keeps a safe native error code, stage and upstream code', async () => {
        mocks.request.mockResolvedValue({
            ok: false,
            error: {
                code: 'auth-required', message: 'Qishui rejected the request',
                upstreamCode: '28001003', stage: 'ticket',
            },
        });
        let caught: unknown;
        try {
            await requestQishui('search');
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(QishuiRequestError);
        expect(caught).toMatchObject({
            code: 'auth-required', message: 'Qishui rejected the request',
            stage: 'ticket', upstreamCode: '28001003', providerId: 'qishui',
        });
    });

    it('turns an unknown native code into an invalid response', async () => {
        mocks.request.mockResolvedValue({
            ok: false, error: { code: 'something-else', message: 'Qishui failed' },
        });
        await expect(requestQishui('search')).rejects.toMatchObject({
            code: 'invalid-response', message: 'Qishui failed',
        });
    });

    it('records only a login operation failure for diagnostics', async () => {
        mocks.request.mockResolvedValueOnce({ ok: true, data: { key: 'k' } });
        await requestQishui('login_qr_key');
        expect(getQishuiLastFailure()).toBeNull();
        mocks.request.mockResolvedValueOnce({
            ok: false,
            error: { code: 'unavailable', message: 'Qishui checked badly', stage: 'account' },
        });
        await expect(requestQishui('login_qr_check', { key: 'k' })).rejects.toBeInstanceOf(QishuiRequestError);
        expect(getQishuiLastFailure()).toMatchObject({ stage: 'account', code: 'unavailable' });
    });

    it('reports a bridge rejection as a native request failure', async () => {
        mocks.request.mockRejectedValue(new Error('plugin missing'));
        await expect(requestQishui('search')).rejects.toMatchObject({
            code: 'network', message: QISHUI_BRIDGE_FAILED,
        });
    });
});
