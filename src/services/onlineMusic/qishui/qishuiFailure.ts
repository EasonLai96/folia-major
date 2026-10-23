import { OnlineProviderError } from '../../../types/onlineMusic';
import type { OnlineFailureDetail, OnlineFailureOperation } from '../../../types/onlineMusic';
import { QISHUI_BRIDGE_FAILED, QISHUI_NEEDS_ANDROID, QishuiRequestError } from './qishuiTransport';

// src/services/onlineMusic/qishui/qishuiFailure.ts
// What a failed Qishui audio or collection request hands to the shared failure rules.

// The native sentence when only encrypted audio came back (QishuiPlayback.resolveAudio).
const PROTECTED_ONLY = 'Qishui returned protected audio only; decryption is disabled';
// The native sentence when an account request has no session (QishuiClient.command/account).
const SIGNED_OUT = 'Sign in to Qishui first';

export const describeQishuiFailure = (
    _operation: OnlineFailureOperation,
    error: unknown,
): OnlineFailureDetail | null => {
    if (!(error instanceof OnlineProviderError) || error.providerId !== 'qishui') return null;
    if (error.message === QISHUI_NEEDS_ANDROID) return { case: 'not-configured' };
    if (error.message === QISHUI_BRIDGE_FAILED) return { case: 'local-service-stopped' };
    if (error.code === 'auth-required' && error.message === SIGNED_OUT) return { signedOut: true };
    if (error.code === 'unsupported' && error.message === PROTECTED_ONLY) return { case: 'no-audio' };
    const status = /^Qishui HTTP (\d{3})$/.exec(error.message)?.[1];
    if (status) return { httpStatus: Number(status) };
    if (error instanceof QishuiRequestError && error.upstreamCode) return { code: error.upstreamCode };
    return null;
};
