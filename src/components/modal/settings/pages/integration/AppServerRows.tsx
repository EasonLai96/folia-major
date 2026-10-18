import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isCapacitorAndroid } from '../../../../../platform/runtime';
import { getStoredAppServerBase, setAppServerBase, testAppServer } from '../../../../../services/appServer';
import { Button, Row, Status, TextField } from '../../kit';
import { O } from './options';

// src/components/modal/settings/pages/integration/AppServerRows.tsx
// 连接与集成页上 Android App 独有的一行：Folia 服务器地址。测试通过才保存，保存后重新载入，
// 让各平台按新地址重新连接。浏览器和桌面版不画这一行。

type TestState = 'idle' | 'testing' | 'ok' | 'failed';

export const AppServerRows: React.FC = () => {
    const { t } = useTranslation();
    const [url, setUrl] = useState(getStoredAppServerBase);
    const [state, setState] = useState<TestState>(() => (getStoredAppServerBase() ? 'ok' : 'idle'));

    if (!isCapacitorAndroid()) return null;

    // 测一次地址；连得上就保存并重新载入。
    const testAndSave = async () => {
        // 清空：回到默认公共服务器。
        if (!url.trim()) {
            setAppServerBase('');
            window.setTimeout(() => window.location.reload(), 300);
            return;
        }
        setState('testing');
        const ok = await testAppServer(url);
        setState(ok ? 'ok' : 'failed');
        if (!ok) return;
        setAppServerBase(url);
        window.setTimeout(() => window.location.reload(), 600);
    };

    const status = state === 'failed'
        ? <Status tone="error">{t('options.appServerFailed')}</Status>
        : state === 'ok'
            ? <Status tone="ok">{t('options.appServerOk')}</Status>
            : <Status>{t('options.appServerNotSet')}</Status>;

    return (
        <>
            <Row option={O.appServer} hint={t('options.appServerDesc')}>
                {status}
            </Row>
            <Row sub label={t('options.appServerUrl')}>
                <TextField type="url" value={url} onChange={setUrl} placeholder="https://folia.example.com" />
                <Button onClick={() => void testAndSave()} disabled={state === 'testing' || (!url.trim() && !getStoredAppServerBase())}>
                    {t('options.appServerTest')}
                </Button>
            </Row>
        </>
    );
};

export default AppServerRows;
