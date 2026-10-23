package top.izuna.foliamajor.qishui;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

// Allowlisted HTTPS transport for the car protocol: no redirects, no arbitrary hosts or paths.
public final class QishuiClient {

    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 25000;
    private static final int MAX_BODY_BYTES = 8 * 1024 * 1024;
    private static final Map<String, String> NO_HEADERS = Collections.emptyMap();

    public interface Log {
        void info(String line);

        void warn(String line);
    }

    public static final class Response {
        public final JSONObject data;
        public final Map<String, String> headers;

        Response(JSONObject data, Map<String, String> headers) {
            this.data = data;
            this.headers = headers;
        }
    }

    private final QishuiSessions sessions;
    private final Log log;
    private final Object tokenLock = new Object();
    private volatile String clientToken;

    public QishuiClient(QishuiSessions sessions, Log log) {
        this.sessions = sessions;
        this.log = log;
    }

    public void info(String line) {
        log.info(line);
    }

    public void warn(String line) {
        log.warn(line);
    }

    public String queryUrl(String host, String path, Map<String, String> extras, String deviceId) {
        if (!QishuiProtocol.API_HOSTS.contains(host)) {
            throw new IllegalArgumentException("Qishui host is not allowed");
        }
        String fullPath = QishuiProtocol.fullPath(path);
        Map<String, String> values = QishuiProtocol.qishuiParams(
                deviceId == null || deviceId.isEmpty() ? sessions.deviceId() : deviceId);
        if (extras != null) values.putAll(extras);
        return "https://" + host + fullPath + "?" + QishuiProtocol.encode(values);
    }

    public String oauthUrl(String host, String path, Map<String, String> params) {
        if (!QishuiProtocol.API_HOSTS.contains(host)) {
            throw new IllegalArgumentException("Qishui host is not allowed");
        }
        if (!QishuiProtocol.API_PATHS.contains(path)) {
            throw new IllegalArgumentException("Qishui path is not allowed");
        }
        return "https://" + host + path + "?" + QishuiProtocol.encode(params);
    }

    public Response get(String url) throws QishuiException {
        return http(url, null, NO_HEADERS, null);
    }

    public Response postForm(String url, Map<String, String> body, Map<String, String> headers) throws QishuiException {
        return http(url, QishuiProtocol.encode(body), headers, "application/x-www-form-urlencoded");
    }

    public Response platform(String path, JSONObject body, QishuiSession credential) throws QishuiException {
        QishuiSession account = credential != null ? credential : sessions.get();
        long revision = sessions.revision();
        String deviceId = account != null && account.deviceId != null ? account.deviceId : sessions.deviceId();
        JSONObject payload = payload(body, account);
        if (credential != null) {
            Map<String, String> headers = QishuiProtocol.guardHeaders(credential, path);
            Response response = http(queryUrl(QishuiProtocol.OPEN_DOUYIN, path, null, deviceId),
                    payload.toString(), headers, "application/json");
            return responseWithData(response);
        }
        String token = clientToken();
        for (int attempt = 0; ; attempt++) {
            if (attempt > 0 && revision != sessions.revision()) {
                throw new QishuiException("unavailable", "Qishui account changed during the request");
            }
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("access-token", token);
            try {
                Response response = http(queryUrl(QishuiProtocol.OPEN_DOUYIN, path, null, deviceId),
                        payload.toString(), headers, "application/json");
                return responseWithData(response);
            } catch (QishuiException error) {
                if (!"28001008".equals(error.upstreamCode())) throw error;
                invalidateClientToken(token);
                if (attempt > 0 || !QishuiProtocol.isRetryableRead(path)) throw error;
                token = clientToken();
            }
        }
    }

    public Response account(String path, JSONObject body) throws QishuiException {
        QishuiSession credential = sessions.get();
        if (credential == null) throw new QishuiException("auth-required", "Sign in to Qishui first");
        return platform(path, body, credential);
    }

    public JSONObject command(String path, JSONObject body) throws QishuiException {
        QishuiSession credential = sessions.get();
        if (credential == null) throw new QishuiException("auth-required", "Sign in to Qishui first");
        JSONObject payload = payload(body, credential);
        Map<String, String> headers = QishuiProtocol.guardHeaders(credential, path);
        Response response = http(queryUrl(QishuiProtocol.OPEN_DOUYIN, path, null, credential.deviceId),
                payload.toString(), headers, "application/json");
        JSONObject data = object(response.data.opt("data"));
        return data == null ? new JSONObject() : data;
    }

    private Response responseWithData(Response response) throws QishuiException {
        JSONObject data = object(response.data.opt("data"));
        if (data == null) throw new QishuiException("invalid-response", "Qishui data is missing");
        return new Response(data, response.headers);
    }

    private static JSONObject payload(JSONObject body, QishuiSession account) throws QishuiException {
        JSONObject payload = new JSONObject();
        try {
            if (body != null) {
                Iterator<String> keys = body.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    payload.put(key, body.opt(key));
                }
            }
            JSONObject common = new JSONObject();
            if (account != null && account.userId != null) common.put("user_id", account.userId);
            payload.put("common_params", common);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Invalid Qishui parameters", null, error);
        }
        return payload;
    }

    private String clientToken() throws QishuiException {
        String kept = clientToken;
        if (kept != null) return kept;
        synchronized (tokenLock) {
            if (clientToken != null) return clientToken;
            Map<String, String> extras = new LinkedHashMap<>();
            extras.put("trigger_type", "cold_start");
            Response response = get(queryUrl(QishuiProtocol.OPEN_QISHUI, QishuiProtocol.CLIENT_TOKEN_PATH, extras, null));
            Object value = response.data.opt("client_token");
            if (!(value instanceof String) || ((String) value).isEmpty()) {
                throw new QishuiException("invalid-response", "Client token is missing");
            }
            clientToken = (String) value;
            return clientToken;
        }
    }

    private void invalidateClientToken(String used) {
        synchronized (tokenLock) {
            if (used != null && used.equals(clientToken)) clientToken = null;
        }
    }

    private Response http(String url, String body, Map<String, String> headers, String contentType) throws QishuiException {
        HttpURLConnection connection = null;
        try {
            URL address = new URL(url);
            if (!"https".equalsIgnoreCase(address.getProtocol()) || address.getUserInfo() != null) {
                throw new QishuiException("invalid-response", "Invalid Qishui address");
            }
            if (address.getPort() != -1 && address.getPort() != 443) {
                throw new QishuiException("invalid-response", "Invalid Qishui address");
            }
            String host = address.getHost().toLowerCase(java.util.Locale.ROOT);
            boolean api = QishuiProtocol.API_HOSTS.contains(host);
            if (!api && !QishuiProtocol.isMediaHost(host)) {
                throw new QishuiException("invalid-response", "Untrusted Qishui host");
            }
            if (api && !QishuiProtocol.API_PATHS.contains(address.getPath())) {
                throw new QishuiException("invalid-response", "Qishui path is not allowed");
            }
            connection = (HttpURLConnection) address.openConnection();
            connection.setRequestMethod(body == null ? "GET" : "POST");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("User-Agent", QishuiProtocol.UA);
            connection.setRequestProperty("Accept", "application/json");
            for (Map.Entry<String, String> header : headers.entrySet()) {
                connection.setRequestProperty(header.getKey(), header.getValue());
            }
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", contentType == null ? "application/json" : contentType);
                try (OutputStream stream = connection.getOutputStream()) {
                    stream.write(bytes);
                }
            }
            int status = connection.getResponseCode();
            Map<String, String> responseHeaders = new LinkedHashMap<>();
            for (Map.Entry<String, java.util.List<String>> header : connection.getHeaderFields().entrySet()) {
                if (header.getKey() == null || header.getValue() == null || header.getValue().isEmpty()) continue;
                responseHeaders.put(header.getKey().toLowerCase(java.util.Locale.ROOT), header.getValue().get(0));
            }
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            String text = readLimited(stream);
            if (status < 200 || status >= 300) {
                String code = status == 429 ? "unavailable" : status == 401 || status == 403 ? "auth-required" : "network";
                throw new QishuiException(code, "Qishui HTTP " + status);
            }
            JSONObject data;
            try {
                data = new JSONObject(text);
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui response is not JSON", null, error);
            }
            return new Response(checked(data), responseHeaders);
        } catch (QishuiException error) {
            throw error;
        } catch (IOException error) {
            throw new QishuiException("network", "Qishui service could not be reached", null, error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static JSONObject checked(JSONObject data) throws QishuiException {
        Object raw = data.opt("err_no");
        if (raw == null || raw == JSONObject.NULL) {
            JSONObject nested = object(data.opt("data"));
            raw = nested == null ? null : nested.opt("error_code");
        }
        long code = (long) QishuiProtocol.number(raw);
        if (code != 0) {
            String upstream = String.valueOf(code);
            throw new QishuiException(QishuiProtocol.isAuthCode(upstream) ? "auth-required" : "unavailable",
                    "Qishui rejected the request", upstream);
        }
        return data;
    }

    private static String readLimited(InputStream stream) throws QishuiException {
        if (stream == null) return "";
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BODY_BYTES) throw new QishuiException("invalid-response", "Qishui response is too large");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException error) {
            throw new QishuiException("network", "Qishui service could not be reached", null, error);
        }
    }

    public static JSONObject object(Object value) {
        return value instanceof JSONObject ? (JSONObject) value : null;
    }

    public static org.json.JSONArray array(Object value) {
        return value instanceof org.json.JSONArray ? (org.json.JSONArray) value : null;
    }

    public static String text(Object value) {
        return value == null || value == JSONObject.NULL ? "" : String.valueOf(value);
    }

    public static String nonEmpty(Object value) {
        String text = text(value);
        return text.isEmpty() ? null : text;
    }

    public static boolean isTrue(Object value) {
        return Boolean.TRUE.equals(value);
    }

    public static long longValue(Object value, long fallback) {
        double number = QishuiProtocol.number(value);
        if (Double.isNaN(number) || Double.isInfinite(number)) return fallback;
        return (long) number;
    }

    public static int intValue(Object value, int fallback) {
        double number = QishuiProtocol.number(value);
        if (Double.isNaN(number) || Double.isInfinite(number)) return fallback;
        return (int) number;
    }

    public static JSONObject requireObject(Object value, String message) throws QishuiException {
        JSONObject object = object(value);
        if (object == null) throw new QishuiException("invalid-response", message);
        return object;
    }

    public static org.json.JSONArray requireArray(Object value, String message) throws QishuiException {
        org.json.JSONArray array = array(value);
        if (array == null) throw new QishuiException("invalid-response", message);
        return array;
    }

    public static JSONObject putNull(JSONObject object, String key) throws QishuiException {
        try {
            object.put(key, JSONObject.NULL);
            return object;
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui response could not be read", null, error);
        }
    }
}
