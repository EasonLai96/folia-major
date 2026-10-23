package top.izuna.foliamajor.qishui;

import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

// Car ticket-guard protocol constants and request builders, ported from qishui-music-api (MIT).
public final class QishuiProtocol {

    public static final String UA = "LunaOpenSDK/1.0.10";
    public static final String PREFIX = "/api/luna/v1/platform";
    public static final String CLIENT_KEY = "aw4bbxfujo741d09";
    public static final String AUTH_CODE_PATH = "/access/code/get/";
    public static final String AUTH_REFRESH_PATH = "/access/code/refresh/";
    public static final String CLIENT_TOKEN_PATH = "/client/token/get/";
    public static final String ACCOUNT_INFO_PATH = "/me/info/";
    public static final String TICKET_HOST = "open-client.douyin.com";
    public static final String TICKET_PATH = "/passport/open/get_access_ticket/";
    public static final String OPEN_DOUYIN = "open.douyin.com";
    public static final String OPEN_QISHUI = "open.qishui.com";

    public static final Set<String> API_HOSTS = unmodifiableSet(
            OPEN_DOUYIN, OPEN_QISHUI, TICKET_HOST);
    public static final Set<String> MEDIA_HOSTS = unmodifiableSet(
            "365yg.com", "douyinvod.com", "douyinscdn.com", "bytefcdn.com", "bytecdn.cn", "byteicdn.com",
            "ibytedtos.com", "pstatp.com", "snssdk.com", "bytedance.com", "bytetos.com", "volcvideo.com",
            "volccdn.com", "volces.com", "volcengineapi.com", "douyin.com", "qishui.com", "zijieapi.com", "zjcdn.com");
    public static final Set<String> API_PATHS = unmodifiableSet(
            PREFIX + "/search/",
            PREFIX + "/playlist/detail/",
            PREFIX + "/media/mget/",
            PREFIX + "/media/mcheck/",
            PREFIX + "/artist/detail/",
            PREFIX + "/artist/tracks/",
            PREFIX + "/feed/mode/",
            PREFIX + "/feed/song-tab/",
            PREFIX + "/me/info/",
            PREFIX + "/me/playlist/",
            PREFIX + "/me/collection/mixed/",
            PREFIX + "/me/recent-played/",
            PREFIX + AUTH_CODE_PATH,
            PREFIX + AUTH_REFRESH_PATH,
            PREFIX + CLIENT_TOKEN_PATH,
            PREFIX + "/media/collect/",
            PREFIX + "/media/cancel/collect/",
            PREFIX + "/playlist/append/",
            PREFIX + "/playlist/delete/",
            PREFIX + "/dislike/",
            "/oauth/get_qrcode/",
            "/oauth/check_qrcode/",
            TICKET_PATH);
    public static final Set<String> RETRYABLE_READS = unmodifiableSet(
            "/search/", "/playlist/detail/", "/media/mget/", "/media/mcheck/",
            "/artist/detail/", "/artist/tracks/", "/feed/mode/", "/feed/song-tab/");
    private static final Set<Long> AUTH_CODES = new LinkedHashSet<>(Arrays.asList(
            28001003L, 28001007L, 28001008L, 10007L));

    private static final Map<String, String> COMMON = common();
    private static final SecureRandom RANDOM = new SecureRandom();

    private QishuiProtocol() {
    }

    private static Set<String> unmodifiableSet(String... values) {
        return Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(values)));
    }

    private static Map<String, String> common() {
        Map<String, String> value = new LinkedHashMap<>();
        value.put("aid", "765213");
        value.put("app_id", "765213");
        value.put("app_name", "byte_autoservice_lite");
        value.put("version_code", "100010");
        value.put("version_name", "1.0.10");
        value.put("channel", "bydSong");
        value.put("sdk_aid", "753999");
        value.put("caller_name", "luna_open_sdk");
        value.put("sdk_version_code", "100000100");
        value.put("sdk_version_name", "0.0.1");
        value.put("sdk_channel", "Test");
        value.put("vehicle_type", "BYD");
        value.put("device_brand", "BYD");
        value.put("device_type", "BYD");
        value.put("device_platform", "android");
        value.put("resolution", "1920x1080");
        value.put("os_version", "13");
        value.put("ac", "wifi");
        return Collections.unmodifiableMap(value);
    }

    public static Map<String, String> qishuiParams(String deviceId) {
        Map<String, String> value = new LinkedHashMap<>(COMMON);
        value.put("device_id", deviceId);
        value.put("did", deviceId);
        value.put("iid", deviceId);
        value.put("vehicle_id", "qishui-" + deviceId);
        value.put("_timestamp", String.valueOf(System.currentTimeMillis() / 1000L));
        value.put("_nonce", String.valueOf(RANDOM.nextInt(65536)));
        return value;
    }

    public static Map<String, String> qrParams() {
        Map<String, String> value = new LinkedHashMap<>();
        value.put("aid", "1128");
        value.put("client_key", CLIENT_KEY);
        value.put("scope", "user_info,luna.openapi.platform.interaction,luna.openapi.platform.me_tab,luna.commerce.openapi_platform.vip_info");
        value.put("state", "");
        value.put("next", "");
        value.put("jump_type", "native");
        value.put("optional_scope_check", "");
        value.put("optional_scope_uncheck", "");
        value.put("customize_params", "{\"source\":\"pc_auth\",\"not_skip_confirm\":\"true\"}");
        value.put("source_from", "native");
        value.put("device_platform", "android");
        value.put("app_identity", md5Hex("com.luna.music.car"));
        value.put("signature", "cf9024ea72d9c71813238b13ea107a3d");
        return value;
    }

    public static String encode(Map<String, String> values) {
        StringBuilder result = new StringBuilder();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (result.length() > 0) result.append('&');
            result.append(urlEncode(entry.getKey())).append('=').append(urlEncode(entry.getValue()));
        }
        return result.toString();
    }

    private static String urlEncode(String value) {
        try {
            return java.net.URLEncoder.encode(value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException error) {
            throw new IllegalStateException(error);
        }
    }

    public static String canonicalPath(String path) {
        if (path == null) throw new IllegalArgumentException("Qishui path is not allowed");
        return path.startsWith(PREFIX) ? path : PREFIX + path;
    }

    public static String fullPath(String path) {
        String value = canonicalPath(path);
        if (!API_PATHS.contains(value)) {
            throw new IllegalArgumentException("Qishui path is not allowed");
        }
        return value;
    }

    public static boolean isRetryableRead(String path) {
        String value = canonicalPath(path);
        return RETRYABLE_READS.contains(value.substring(PREFIX.length()));
    }

    public static boolean isAuthCode(String upstreamCode) {
        if (upstreamCode == null) return false;
        try {
            return AUTH_CODES.contains(Long.parseLong(upstreamCode));
        } catch (NumberFormatException error) {
            return false;
        }
    }

    public static boolean isAccountId(Object value) {
        if (!(value instanceof String)) return false;
        String text = (String) value;
        if (text.isEmpty() || text.length() > 512) return false;
        for (int index = 0; index < text.length(); index++) {
            char character = text.charAt(index);
            if (character < 0x20 || character == 0x7f || Character.isWhitespace(character) || Character.isSpaceChar(character)) {
                return false;
            }
        }
        return true;
    }

    public static boolean isMediaId(Object value) {
        return value instanceof String && ((String) value).matches("[0-9]{1,30}");
    }

    public static boolean isDeviceId(String value) {
        return value != null && value.matches("[0-9]{19}");
    }

    public static String createDeviceId() {
        StringBuilder value = new StringBuilder(19);
        value.append((char) ('1' + RANDOM.nextInt(9)));
        for (int index = 0; index < 18; index++) value.append((char) ('0' + RANDOM.nextInt(10)));
        return value.toString();
    }

    public static String randomHex(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        StringBuilder text = new StringBuilder(bytes * 2);
        for (byte item : value) text.append(String.format("%02x", item & 0xff));
        return text.toString();
    }

    public static String md5Hex(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] value = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(value.length * 2);
            for (byte item : value) result.append(String.format("%02x", item & 0xff));
            return result.toString();
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException(error);
        }
    }

    public static Guard createGuard() throws QishuiException {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
            KeyPair pair = generator.generateKeyPair();
            byte[] subject = der(0x30,
                    derRdn(3, "bd-ticket-guard"),
                    derRdn(11, ""),
                    derRdn(10, ""));
            byte[] info = der(0x30,
                    der(0x02, new byte[]{0}),
                    subject,
                    pair.getPublic().getEncoded(),
                    der(0xa0));
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(pair.getPrivate());
            signer.update(info);
            byte[] signature = signer.sign();
            byte[] algorithm = der(0x30, der(0x06, hex("2a8648ce3d040302")));
            byte[] bitString = der(0x03, concat(new byte[]{0}, signature));
            byte[] request = der(0x30, info, algorithm, bitString);
            String pem = "-----BEGIN CERTIFICATE REQUEST-----\n"
                    + wrapBase64(base64(request))
                    + "\n-----END CERTIFICATE REQUEST-----\n";
            String csr = base64(pem.getBytes(StandardCharsets.UTF_8));
            return new Guard(pair.getPrivate(), csr, null);
        } catch (GeneralSecurityException error) {
            throw new QishuiException("invalid-response", "Qishui authorization could not be prepared", null, error);
        }
    }

    private static byte[] derRdn(int oid, String value) {
        byte[] oidValue = new byte[]{0x55, 0x04, (byte) oid};
        return der(0x31, der(0x30,
                der(0x06, oidValue),
                der(0x0c, value.getBytes(StandardCharsets.UTF_8))));
    }

    private static byte[] der(int tag, byte[]... values) {
        byte[] value = concat(values);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(tag);
        int length = value.length;
        if (length < 128) {
            out.write(length);
        } else if (length < 256) {
            out.write(0x81);
            out.write(length);
        } else {
            out.write(0x82);
            out.write((length >> 8) & 0xff);
            out.write(length & 0xff);
        }
        out.write(value, 0, value.length);
        return out.toByteArray();
    }

    private static byte[] concat(byte[]... values) {
        int length = 0;
        for (byte[] value : values) length += value.length;
        byte[] result = new byte[length];
        int offset = 0;
        for (byte[] value : values) {
            System.arraycopy(value, 0, result, offset, value.length);
            offset += value.length;
        }
        return result;
    }

    private static byte[] hex(String value) {
        return new BigInteger(value, 16).toByteArray();
    }

    private static String wrapBase64(String value) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < value.length(); index += 64) {
            if (result.length() > 0) result.append('\n');
            result.append(value, index, Math.min(value.length(), index + 64));
        }
        return result.toString();
    }

    public static String base64(byte[] value) {
        return Base64.encodeToString(value, Base64.NO_WRAP);
    }

    public static Map<String, String> guardHeaders(QishuiSession credential, String path) throws QishuiException {
        if (credential == null || credential.ticket == null || credential.guardCert == null
                || credential.guardTsSign == null || credential.guardKey == null
                || credential.ticket.length() > 16384 || credential.guardCert.length() > 16384
                || credential.guardTsSign.length() > 16384) {
            throw new QishuiException("invalid-response", "invalid guard credential");
        }
        long timestamp = System.currentTimeMillis() / 1000L;
        String content = "ticket=" + credential.ticket + "&path=" + fullPath(path) + "&timestamp=" + timestamp;
        String requestSign;
        try {
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(credential.guardKey);
            signer.update(content.getBytes(StandardCharsets.UTF_8));
            requestSign = base64(signer.sign());
        } catch (GeneralSecurityException error) {
            throw new QishuiException("invalid-response", "invalid guard key", null, error);
        }
        JSONObject data = new JSONObject();
        try {
            data.put("ts_sign", credential.guardTsSign);
            data.put("req_content", "ticket,path,timestamp");
            data.put("req_sign", requestSign);
            data.put("timestamp", timestamp);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "invalid guard credential", null, error);
        }
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("access-token", credential.ticket);
        headers.put("bd-ticket-guard-version", "1");
        headers.put("bd-ticket-guard-client-cert", credential.guardCert);
        headers.put("bd-ticket-guard-client-data", base64(data.toString().getBytes(StandardCharsets.UTF_8)));
        return headers;
    }

    public static GuardData readGuard(Object raw) throws QishuiException {
        if (!(raw instanceof String) || ((String) raw).isEmpty() || ((String) raw).length() > 65536) {
            throw new QishuiException("invalid-response", "invalid guard response");
        }
        try {
            JSONObject data = new JSONObject(new String(Base64.decode((String) raw, Base64.DEFAULT), StandardCharsets.UTF_8));
            Object ticket = data.opt("ticket");
            Object tsSign = data.opt("ts_sign");
            Object clientCert = data.opt("client_cert");
            if (!bounded(ticket) || !bounded(tsSign) || !bounded(clientCert)) {
                throw new QishuiException("invalid-response", "invalid guard response");
            }
            String cert = (String) clientCert;
            if (cert.contains("-----BEGIN")) {
                cert = base64(cert.getBytes(StandardCharsets.UTF_8));
            }
            return new GuardData((String) ticket, (String) tsSign, cert);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "invalid guard response", null, error);
        } catch (IllegalArgumentException error) {
            throw new QishuiException("invalid-response", "invalid guard response", null, error);
        }
    }

    private static boolean bounded(Object value) {
        return value instanceof String && !((String) value).isEmpty() && ((String) value).length() <= 16384;
    }

    public static boolean isMediaHost(String raw) {
        String host = raw == null ? "" : raw.toLowerCase(Locale.ROOT);
        for (String candidate : MEDIA_HOSTS) {
            if (host.equals(candidate) || host.endsWith("." + candidate)) return true;
        }
        return false;
    }

    public static String mediaUrl(Object raw) throws QishuiException {
        if (!(raw instanceof String)) throw new QishuiException("invalid-response", "Invalid Qishui media URL");
        try {
            java.net.URL url = new java.net.URL((String) raw);
            String protocol = url.getProtocol();
            String host = url.getHost();
            int port = url.getPort();
            boolean allowedHost = isMediaHost(host);
            if (!"https".equalsIgnoreCase(protocol) || url.getUserInfo() != null
                    || (port != -1 && port != 443) || !allowedHost) {
                throw new QishuiException("invalid-response", "Untrusted Qishui media host");
            }
            return url.toExternalForm();
        } catch (java.net.MalformedURLException error) {
            throw new QishuiException("invalid-response", "Invalid Qishui media URL", null, error);
        }
    }

    public static String mediaHost(Object raw) {
        try {
            String host = new java.net.URL(String.valueOf(raw)).getHost();
            return host == null || host.isEmpty() ? "unknown host" : host;
        } catch (java.net.MalformedURLException error) {
            return "invalid URL";
        }
    }

    public static long credentialExpiry(Object raw) throws QishuiException {
        double value = number(raw);
        long now = System.currentTimeMillis();
        if (!Double.isFinite(value) || value >= Long.MAX_VALUE) {
            throw new QishuiException("invalid-response", "invalid credential expiry");
        }
        long expires;
        if (value > 1e12) expires = (long) value;
        else if (value > 1e9) expires = (long) (value * 1000);
        else if (value > 0) expires = now + (long) (value * 1000);
        else expires = now + 6 * 3600000L;
        if (expires <= now) throw new QishuiException("invalid-response", "invalid credential expiry");
        return expires;
    }

    public static double number(Object value) {
        if (value instanceof Number) return ((Number) value).doubleValue();
        if (value instanceof String) {
            try {
                return Double.parseDouble((String) value);
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        if (value instanceof Boolean) return ((Boolean) value) ? 1 : 0;
        return 0;
    }

    public static final class Guard {
        public final PrivateKey key;
        public final String csr;
        public final String cert;

        Guard(PrivateKey key, String csr, String cert) {
            this.key = key;
            this.csr = csr;
            this.cert = cert;
        }
    }

    public static final class GuardData {
        public final String ticket;
        public final String tsSign;
        public final String cert;

        GuardData(String ticket, String tsSign, String cert) {
            this.ticket = ticket;
            this.tsSign = tsSign;
            this.cert = cert;
        }
    }
}
