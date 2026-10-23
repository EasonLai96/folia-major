package top.izuna.foliamajor.qishui;

import android.content.Context;
import android.util.Base64;
import org.json.JSONObject;
import java.security.KeyFactory;
import java.security.spec.PKCS8EncodedKeySpec;
import top.izuna.foliamajor.NativeSessionStore;

// All account credentials, including the guard private key, are sealed under an app-only Keystore key.
final class QishuiSessionStore {
    private final NativeSessionStore encrypted;

    QishuiSessionStore(Context context) {
        encrypted = new NativeSessionStore(context, "folia_qishui_session");
    }

    QishuiSession read() {
        JSONObject data = encrypted.read();
        if (data == null) return null;
        try {
            QishuiSession value = new QishuiSession();
            if (data.getInt("version") != 1) throw new IllegalArgumentException("Session version");
            value.deviceId = data.getString("deviceId");
            value.accessCode = required(data, "accessCode");
            value.openId = data.getString("openId");
            value.ticket = required(data, "ticket");
            value.guardCert = required(data, "guardCert");
            value.guardTsSign = required(data, "guardTsSign");
            value.guardKey = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(
                    Base64.decode(required(data, "guardKey"), Base64.NO_WRAP)));
            value.expiresAt = data.getLong("expiresAt");
            value.userId = required(data, "userId");
            value.nickname = data.optString("nickname", "");
            value.avatar = data.optString("avatar", "");
            value.isVip = data.optBoolean("isVip", false);
            if (!QishuiProtocol.isDeviceId(value.deviceId) || !QishuiProtocol.isAccountId(value.userId)
                    || value.expiresAt <= 0) throw new IllegalArgumentException("Invalid session");
            return value;
        } catch (Exception error) {
            encrypted.clear();
            return null;
        }
    }

    boolean write(QishuiSession value) {
        try {
            JSONObject data = new JSONObject();
            data.put("version", 1);
            data.put("deviceId", value.deviceId);
            data.put("accessCode", value.accessCode);
            data.put("openId", value.openId);
            data.put("ticket", value.ticket);
            data.put("guardCert", value.guardCert);
            data.put("guardTsSign", value.guardTsSign);
            data.put("guardKey", Base64.encodeToString(value.guardKey.getEncoded(), Base64.NO_WRAP));
            data.put("expiresAt", value.expiresAt);
            data.put("userId", value.userId);
            data.put("nickname", value.nickname);
            data.put("avatar", value.avatar);
            data.put("isVip", value.isVip);
            return encrypted.write(data);
        } catch (Exception error) {
            return false;
        }
    }

    boolean clear() { return encrypted.clear(); }

    private static String required(JSONObject data, String key) throws Exception {
        String value = data.getString(key);
        if (value.isEmpty() || value.length() > 16384) throw new IllegalArgumentException("Invalid field");
        return value;
    }
}
