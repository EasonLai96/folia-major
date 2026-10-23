package top.izuna.foliamajor.qishui;

import android.content.Context;
import android.content.SharedPreferences;

// Sessions are encrypted natively; only the non-secret device identifier uses preferences.
public class QishuiSessions {

    private final String deviceId;
    private final QishuiSessionStore store;
    private volatile QishuiSession current;
    private boolean needsValidation;
    private long revision;

    public QishuiSessions() {
        this.deviceId = QishuiProtocol.createDeviceId();
        this.store = null;
    }

    public QishuiSessions(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("folia_qishui_device", Context.MODE_PRIVATE);
        String saved = prefs.getString("deviceId", "");
        deviceId = QishuiProtocol.isDeviceId(saved) ? saved : QishuiProtocol.createDeviceId();
        prefs.edit().putString("deviceId", deviceId).apply();
        store = new QishuiSessionStore(context);
        current = store.read();
        if (current != null && !deviceId.equals(current.deviceId)) {
            store.clear();
            current = null;
        }
        needsValidation = current != null;
    }

    public synchronized boolean needsValidation() { return needsValidation; }

    public String deviceId() {
        return deviceId;
    }

    public synchronized QishuiSession get() {
        return current;
    }

    public synchronized long revision() {
        return revision;
    }

    public synchronized void set(QishuiSession value) throws QishuiException {
        if (store != null && !store.write(value)) {
            throw new QishuiException("unavailable", "Qishui session could not be securely saved");
        }
        current = value;
        needsValidation = false;
        revision++;
    }

    public synchronized void clear() throws QishuiException {
        current = null;
        needsValidation = false;
        revision++;
        if (store != null && !store.clear()) {
            throw new QishuiException("unavailable", "Qishui session could not be fully erased");
        }
    }
}
