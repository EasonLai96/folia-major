package top.izuna.foliamajor.qishui;

import org.json.JSONException;
import org.json.JSONObject;

import java.security.PrivateKey;

// One car account session. The private guard key never leaves this object or the native process.
public class QishuiSession {

    public String deviceId;
    public String accessCode;
    public String openId;
    public String ticket;
    public PrivateKey guardKey;
    public String guardCert;
    public String guardTsSign;
    public long expiresAt;
    public String userId;
    public String nickname = "";
    public String avatar;
    public boolean isVip;

    public QishuiSession copyForRenewal() {
        QishuiSession value = new QishuiSession();
        value.deviceId = deviceId;
        value.accessCode = accessCode;
        value.openId = openId;
        value.ticket = ticket;
        value.guardKey = guardKey;
        value.guardCert = guardCert;
        value.guardTsSign = guardTsSign;
        value.expiresAt = expiresAt;
        value.userId = userId;
        value.nickname = nickname;
        value.avatar = avatar;
        value.isVip = isVip;
        return value;
    }

    // The account as the renderer sees it: never the ticket, guard certificate or private key.
    public JSONObject toUserJson() throws JSONException {
        JSONObject user = new JSONObject();
        user.put("id", userId);
        user.put("nickname", nickname == null ? "" : nickname);
        user.put("avatar", avatar == null ? JSONObject.NULL : avatar);
        user.put("isVip", isVip);
        return user;
    }
}
