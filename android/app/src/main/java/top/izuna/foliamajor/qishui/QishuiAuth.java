package top.izuna.foliamajor.qishui;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

// QR authorization, Keystore-persisted credential renewal and sign-out for the car protocol.
public final class QishuiAuth {

    private static final long QR_TTL_MS = 5 * 60 * 1000L;
    private static final long RENEW_WINDOW_MS = 60 * 60 * 1000L;
    private static final String[] QR_STATES = {"new", "scanned", "confirmed", "expired", "refused"};

    private interface Step<T> {
        T run() throws Exception;
    }

    private static final class Pending {
        final String token;
        final String qr;
        final long expires;
        CompletableFuture<JSONObject> task;

        Pending(String token, String qr, long expires) {
            this.token = token;
            this.qr = qr;
            this.expires = expires;
        }
    }

    private static final class User {
        final String id;
        final String nickname;
        final String avatar;
        final boolean vip;

        User(String id, String nickname, String avatar, boolean vip) {
            this.id = id;
            this.nickname = nickname;
            this.avatar = avatar;
            this.vip = vip;
        }

        JSONObject toJson() throws QishuiException {
            try {
                JSONObject value = new JSONObject();
                value.put("id", id);
                value.put("nickname", nickname);
                value.put("avatar", avatar == null ? JSONObject.NULL : avatar);
                value.put("isVip", vip);
                return value;
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui account could not be read", null, error);
            }
        }
    }

    private final QishuiClient client;
    private final QishuiSessions sessions;
    private final QishuiFeed feed;
    private final Map<String, Pending> pending = new ConcurrentHashMap<>();
    private int generation;

    public QishuiAuth(QishuiClient client, QishuiSessions sessions, QishuiFeed feed) {
        this.client = client;
        this.sessions = sessions;
        this.feed = feed;
    }

    public JSONObject start() throws QishuiException {
        final int mine;
        synchronized (this) {
            clean();
            pending.clear();
            mine = ++generation;
        }
        Map<String, String> params = QishuiProtocol.qrParams();
        QishuiClient.Response response = client.get(client.oauthUrl(QishuiProtocol.OPEN_DOUYIN,
                "/oauth/get_qrcode/", params));
        JSONObject data = QishuiClient.object(response.data.opt("data"));
        String token = data == null ? null : QishuiClient.nonEmpty(data.opt("token"));
        String qrcode = data == null ? null : QishuiClient.nonEmpty(data.opt("qrcode"));
        if (token == null || qrcode == null) {
            throw new QishuiException("invalid-response", "QR code is missing");
        }
        String key = QishuiProtocol.randomHex(16);
        synchronized (this) {
            if (mine != generation) throw new QishuiException("unavailable", "Sign-in was cancelled");
            pending.put(key, new Pending(token, "data:image/png;base64," + qrcode,
                    System.currentTimeMillis() + QR_TTL_MS));
        }
        client.info("[Qishui] Sign-in QR created");
        JSONObject result = new JSONObject();
        try {
            result.put("key", key);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui sign-in response could not be read", null, error);
        }
        return result;
    }

    public synchronized JSONObject qr(String key) throws QishuiException {
        clean();
        Pending value = pending.get(key);
        if (value == null) throw new QishuiException("unavailable", "QR session expired");
        JSONObject result = new JSONObject();
        try {
            result.put("imageUrl", value.qr);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui sign-in response could not be read", null, error);
        }
        return result;
    }

    public JSONObject check(String key) throws QishuiException {
        Pending value;
        CompletableFuture<JSONObject> task;
        boolean owner = false;
        synchronized (this) {
            clean();
            value = pending.get(key);
            if (value == null) return state("expired");
            if (value.task == null) {
                value.task = new CompletableFuture<>();
                owner = true;
            }
            task = value.task;
        }
        if (!owner) {
            try {
                return task.get();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new QishuiException("unavailable", "Sign-in check was interrupted", null, error);
            } catch (ExecutionException error) {
                Throwable cause = error.getCause();
                if (cause instanceof QishuiException) throw (QishuiException) cause;
                throw new QishuiException("invalid-response", "Qishui sign-in response could not be read", null, cause);
            }
        }
        try {
            JSONObject result = checkNow(key, value);
            task.complete(result);
            return result;
        } catch (Throwable error) {
            task.completeExceptionally(error);
            if (error instanceof QishuiException) throw (QishuiException) error;
            throw new QishuiException("invalid-response", "Qishui sign-in response could not be read", null, error);
        } finally {
            synchronized (this) {
                if (value.task == task) value.task = null;
            }
        }
    }

    private JSONObject checkNow(String key, Pending value) throws QishuiException {
        long revision = sessions.revision();
        Map<String, String> params = QishuiProtocol.qrParams();
        params.put("token", value.token);
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        QishuiClient.Response response = client.get(client.oauthUrl(QishuiProtocol.OPEN_DOUYIN,
                "/oauth/check_qrcode/", params));
        JSONObject data = QishuiClient.object(response.data.opt("data"));
        String status = data == null ? null : QishuiClient.nonEmpty(data.opt("status"));
        if (status == null || !contains(QR_STATES, status)) {
            throw new QishuiException("invalid-response", "Invalid QR status");
        }
        if (!"confirmed".equals(status)) {
            synchronized (this) {
                if ("expired".equals(status) || "refused".equals(status)) pending.remove(key);
            }
            if ("refused".equals(status)) {
                JSONObject refused = state("error");
                try {
                    JSONObject failure = new JSONObject();
                    failure.put("case", "refused");
                    refused.put("failure", failure);
                } catch (JSONException error) {
                    throw new QishuiException("invalid-response", "Qishui sign-in response could not be read", null, error);
                }
                return refused;
            }
            return state("new".equals(status) ? "waiting" : status);
        }
        String code = QishuiClient.nonEmpty(data.opt("code"));
        if (code == null) code = QishuiClient.nonEmpty(data.opt("auth_code"));
        if (code == null) throw new QishuiException("invalid-response", "QR authorization code is missing");
        final String authCode = code;
        final QishuiSession[] credential = new QishuiSession[1];
        step("access-code", () -> {
            Map<String, String> extras = new LinkedHashMap<>();
            extras.put("auth_code", authCode);
            QishuiClient.Response access = client.get(client.queryUrl(QishuiProtocol.OPEN_QISHUI,
                    QishuiProtocol.AUTH_CODE_PATH, extras, sessions.deviceId()));
            credential[0] = readAccess(access.data);
            return null;
        });
        step("ticket", () -> {
            credential[0] = ticket(credential[0],
                    QishuiProtocol.createGuard(), sessions.deviceId());
            return null;
        });
        User user = step("account", () -> getUser(credential[0]));
        synchronized (this) {
            if (pending.get(key) != value || sessions.revision() != revision) return state("expired");
            apply(credential[0], user);
            sessions.set(credential[0]);
            pending.remove(key);
            feed.clear();
        }
        client.info("[Qishui] Sign-in confirmed; account stored");
        return state("confirmed");
    }

    public synchronized void cancel(String key) {
        pending.remove(key);
    }

    public synchronized void logout() throws QishuiException {
        generation++;
        pending.clear();
        sessions.clear();
        feed.clear();
        client.info("[Qishui] Signed out");
    }

    private final Object statusLock = new Object();

    public JSONObject status() throws QishuiException {
        synchronized (statusLock) { return statusNow(); }
    }

    private JSONObject statusNow() throws QishuiException {
        QishuiSession old = sessions.get();
        if (old == null) return null;
        long revision = sessions.revision();
        try {
            QishuiSession candidate = old.copyForRenewal();
            if (old.expiresAt < System.currentTimeMillis() + RENEW_WINDOW_MS) {
                Map<String, String> extras = new LinkedHashMap<>();
                extras.put("access_code", old.accessCode);
                QishuiClient.Response response = client.get(client.queryUrl(QishuiProtocol.OPEN_QISHUI,
                        QishuiProtocol.AUTH_REFRESH_PATH, extras, old.deviceId));
                JSONObject access = unwrapAuth(response.data);
                if (QishuiClient.nonEmpty(access.opt("open_id")) == null
                        && QishuiClient.nonEmpty(access.opt("open_uid")) == null) {
                    try {
                        access.put("open_id", old.openId);
                    } catch (JSONException error) {
                        throw new QishuiException("invalid-response", "Qishui account could not be read", null, error);
                    }
                }
                candidate = ticket(readAccess(access),
                        new QishuiProtocol.Guard(old.guardKey, null, old.guardCert), old.deviceId);
            }
            QishuiSession finalCandidate = candidate;
            User user = getUser(finalCandidate);
            if (!user.id.equals(old.userId)) {
                synchronized (this) {
                    if (revision == sessions.revision()) {
                        sessions.clear();
                        feed.clear();
                    }
                }
                throw new QishuiException("auth-required", "Qishui account identity changed");
            }
            synchronized (this) {
                if (revision != sessions.revision()) return null;
                apply(candidate, user);
                sessions.set(candidate);
            }
            return user.toJson();
        } catch (QishuiException error) {
            if ("auth-required".equals(error.code()) && error.upstreamCode() != null) {
                synchronized (this) {
                    if (revision == sessions.revision()) {
                        sessions.clear();
                        feed.clear();
                    }
                }
            }
            throw error;
        }
    }

    private QishuiSession readAccess(JSONObject root) throws QishuiException {
        JSONObject access = unwrapAuth(root);
        String accessCode = QishuiClient.nonEmpty(access.opt("access_code"));
        if (accessCode == null) throw new QishuiException("invalid-response", "Access code is missing");
        String openId = QishuiClient.nonEmpty(access.opt("open_id"));
        if (openId == null) openId = QishuiClient.nonEmpty(access.opt("open_uid"));
        QishuiSession value = new QishuiSession();
        value.accessCode = accessCode;
        value.openId = openId == null ? "" : openId;
        value.expiresAt = QishuiProtocol.credentialExpiry(access.opt("expires_time"));
        return value;
    }

    private QishuiSession ticket(QishuiSession access, QishuiProtocol.Guard guard, String deviceId) throws QishuiException {
        if (access.accessCode == null || access.accessCode.isEmpty()) {
            throw new QishuiException("invalid-response", "Access code is missing");
        }
        Map<String, String> params = new LinkedHashMap<>();
        params.put("aid", "1128");
        params.put("client_key", QishuiProtocol.CLIENT_KEY);
        params.put("device_platform", "android");
        Map<String, String> body = new LinkedHashMap<>();
        body.put("access_code", access.accessCode);
        body.put("open_id", access.openId == null ? "" : access.openId);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("bd-ticket-guard-version", "1");
        if (guard.csr != null) headers.put("bd-ticket-guard-client-csr", guard.csr);
        else headers.put("bd-ticket-guard-client-cert", guard.cert);
        QishuiClient.Response response = client.postForm(client.oauthUrl(QishuiProtocol.TICKET_HOST,
                QishuiProtocol.TICKET_PATH, params), body, headers);
        QishuiProtocol.GuardData guardData = QishuiProtocol.readGuard(
                response.headers.get("bd-ticket-guard-server-data"));
        QishuiSession value = new QishuiSession();
        value.deviceId = deviceId;
        value.accessCode = access.accessCode;
        value.openId = access.openId == null ? "" : access.openId;
        value.expiresAt = access.expiresAt;
        value.guardKey = guard.key;
        value.ticket = guardData.ticket;
        value.guardTsSign = guardData.tsSign;
        value.guardCert = guardData.cert;
        return value;
    }

    private User getUser(QishuiSession credential) throws QishuiException {
        JSONObject data = client.platform(QishuiProtocol.ACCOUNT_INFO_PATH, new JSONObject(), credential).data;
        JSONObject user = QishuiClient.object(data.opt("my_info"));
        if (user == null || !QishuiProtocol.isAccountId(user.opt("id"))) {
            throw new QishuiException("invalid-response", "Qishui did not identify the account");
        }
        String avatar = QishuiClient.nonEmpty(user.opt("medium_avatar_url"));
        if (avatar == null) avatar = QishuiClient.nonEmpty(user.opt("avatar_url"));
        if (avatar == null) avatar = QishuiClient.nonEmpty(user.opt("thumb_avatar_url"));
        return new User(String.valueOf(user.opt("id")), QishuiClient.text(user.opt("nickname")),
                avatar, QishuiClient.isTrue(user.opt("is_vip")));
    }

    private static void apply(QishuiSession credential, User user) {
        credential.userId = user.id;
        credential.nickname = user.nickname;
        credential.avatar = user.avatar;
        credential.isVip = user.vip;
    }

    private static JSONObject unwrapAuth(JSONObject root) {
        JSONObject data = QishuiClient.object(root.opt("data"));
        return data == null ? root : data;
    }

    private static JSONObject state(String value) {
        JSONObject result = new JSONObject();
        try {
            result.put("state", value);
        } catch (JSONException ignored) {
            // A String value cannot fail to be put.
        }
        return result;
    }

    private static <T> T step(String stage, Step<T> step) throws QishuiException {
        try {
            return step.run();
        } catch (QishuiException error) {
            throw error.withStage(stage);
        } catch (Exception error) {
            throw new QishuiException("invalid-response", "Qishui sign-in response could not be read", null, error)
                    .withStage(stage);
        }
    }

    private static boolean contains(String[] values, String value) {
        for (String item : values) if (item.equals(value)) return true;
        return false;
    }

    private void clean() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<String, Pending>> iterator = pending.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, Pending> entry = iterator.next();
            if (entry.getValue().expires <= now) iterator.remove();
        }
    }
}
