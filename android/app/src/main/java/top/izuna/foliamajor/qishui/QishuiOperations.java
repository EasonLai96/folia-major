package top.izuna.foliamajor.qishui;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

// Public operations never accept an arbitrary host, token, raw request or signing key.
public final class QishuiOperations {

    public static final Set<String> OPERATIONS = java.util.Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(
            "login_status", "logout", "login_qr_key", "login_qr_create", "login_qr_check", "login_qr_cancel",
            "search", "search_playlists", "song_detail", "audio", "lyrics", "user_playlists", "playlist_detail",
            "playlist_tracks", "artist_detail", "artist_songs", "feed", "feed_modes",
            "liked_songs", "like_song", "playlist_add_tracks", "playlist_remove_tracks", "recent_played",
            "check_tracks", "dislike_song")));

    private static final Set<String> QUALITIES = new LinkedHashSet<>(
            Arrays.asList("standard", "high", "lossless", "hires"));
    private static final Set<String> ID_OPERATIONS = new LinkedHashSet<>(Arrays.asList(
            "song_detail", "audio", "lyrics", "playlist_detail", "playlist_tracks", "artist_detail", "artist_songs"));
    private static final Set<String> ACCOUNT_SWITCH_EXEMPT = new LinkedHashSet<>(Arrays.asList(
            "logout", "login_status", "login_qr_check"));

    private final QishuiSessions sessions;
    private final QishuiClient client;
    private final QishuiAuth auth;
    private final QishuiCatalog catalog;
    private final QishuiLibrary library;
    private final QishuiFeed feed;

    public QishuiOperations(QishuiSessions sessions, QishuiClient client, QishuiAuth auth,
                            QishuiCatalog catalog, QishuiLibrary library, QishuiFeed feed) {
        this.sessions = sessions;
        this.client = client;
        this.auth = auth;
        this.catalog = catalog;
        this.library = library;
        this.feed = feed;
    }

    public JSONObject request(String operation, JSONObject raw) {
        try {
            if (operation == null || !OPERATIONS.contains(operation)) {
                throw new QishuiException("unsupported", "Unsupported Qishui operation");
            }
            if (raw == null) throw new QishuiException("invalid-response", "Invalid Qishui parameters");
            int limit = limit(raw.opt("limit"));
            long offset = offset(raw.opt("offset"));
            String id = null;
            if (ID_OPERATIONS.contains(operation)) id = idOf(raw.opt("id"));
            Object ownerRaw = raw.opt("ownerId");
            String ownerId = "";
            if (truthy(ownerRaw)) {
                if (!QishuiProtocol.isAccountId(ownerRaw)) {
                    throw new QishuiException("invalid-response", "Invalid Qishui owner ID");
                }
                ownerId = (String) ownerRaw;
            }
            String query = null;
            if (operation.startsWith("search")) {
                Object value = raw.opt("query");
                if (!(value instanceof String) || ((String) value).length() > 500) {
                    throw new QishuiException("invalid-response", "Invalid Qishui search");
                }
                query = ((String) value).trim();
            }
            String key = null;
            if (operation.startsWith("login_qr_") && !"login_qr_key".equals(operation)) {
                Object value = raw.opt("key");
                if (!(value instanceof String) || !((String) value).matches("[a-f0-9]{32}")) {
                    throw new QishuiException("invalid-response", "Invalid QR key");
                }
                key = (String) value;
            }
            if (!operation.startsWith("login_") && !"logout".equals(operation) && sessions.needsValidation()) {
                auth.status();
            }
            String userBefore = currentUser();
            Object data;
            switch (operation) {
                case "login_qr_key":
                    data = auth.start();
                    break;
                case "login_qr_create":
                    data = auth.qr(key);
                    break;
                case "login_qr_check":
                    data = auth.check(key);
                    if (data instanceof JSONObject && "confirmed".equals(((JSONObject) data).optString("state", ""))) {
                        feed.clear();
                    }
                    break;
                case "login_qr_cancel":
                    auth.cancel(key);
                    data = JSONObject.NULL;
                    break;
                case "login_status":
                    data = auth.status();
                    break;
                case "logout":
                    auth.logout();
                    feed.clear();
                    data = JSONObject.NULL;
                    break;
                case "song_detail":
                    data = QishuiCatalog.publicTrack(catalog.track(id));
                    break;
                case "lyrics": {
                    JSONObject track = catalog.track(id);
                    JSONObject display = QishuiClient.object(track.opt("display_info"));
                    JSONObject lyric = display == null ? null : QishuiClient.object(display.opt("lyric_info"));
                    data = lyric == null ? new JSONObject() : lyric;
                    break;
                }
                case "audio": {
                    Object quality = raw.opt("quality");
                    if (!(quality instanceof String) || !QUALITIES.contains(quality)) {
                        throw new QishuiException("invalid-response", "Invalid Qishui audio quality");
                    }
                    data = QishuiPlayback.resolveAudio(client, catalog.track(id), (String) quality);
                    break;
                }
                case "playlist_detail":
                case "playlist_tracks": {
                    JSONObject page = catalog.playlistTracks(id, ownerId, limit, offset);
                    if ("playlist_detail".equals(operation)) {
                        Object collection = page.opt("collection");
                        data = collection == null || collection == JSONObject.NULL ? JSONObject.NULL : collection;
                    } else {
                        data = page;
                    }
                    break;
                }
                case "feed_modes":
                    data = feed.modes();
                    break;
                case "feed": {
                    Object preferenceRaw = raw.opt("preference");
                    if (preferenceRaw != null && preferenceRaw != JSONObject.NULL && !(preferenceRaw instanceof String)) {
                        throw new QishuiException("invalid-response", "Invalid preference");
                    }
                    QishuiFeed.Options options = new QishuiFeed.Options();
                    options.scene = raw.opt("scene");
                    if (options.scene == JSONObject.NULL) options.scene = null;
                    options.preference = preferenceRaw == null || preferenceRaw == JSONObject.NULL
                            ? null : (String) preferenceRaw;
                    options.queue = "explore".equals(raw.opt("queue")) ? "explore" : "fm";
                    options.first = QishuiClient.isTrue(raw.opt("first"));
                    options.count = limit;
                    data = feed.songs(options);
                    break;
                }
                case "liked_songs":
                    data = library.likedSongs();
                    break;
                case "like_song":
                    try {
                        library.likeSong(idOf(raw.opt("id")), raw.opt("liked"));
                    } finally {
                        catalog.forgetPlaylist(null);
                    }
                    data = JSONObject.NULL;
                    break;
                case "playlist_add_tracks":
                case "playlist_remove_tracks": {
                    String playlistId = idOf(raw.opt("id"));
                    JSONArray ids = QishuiClient.array(raw.opt("ids"));
                    try {
                        library.editPlaylist("playlist_add_tracks".equals(operation) ? "add" : "remove",
                                playlistId, ids);
                    } finally {
                        catalog.forgetPlaylist(playlistId);
                    }
                    data = JSONObject.NULL;
                    break;
                }
                case "recent_played":
                    data = library.recentPlayed(limit, offset);
                    break;
                case "check_tracks":
                    data = library.checkTracks(QishuiClient.array(raw.opt("ids")));
                    break;
                case "dislike_song": {
                    Object disliked = raw.opt("disliked");
                    if (!(disliked instanceof Boolean)) {
                        throw new QishuiException("invalid-response", "Invalid Qishui dislike");
                    }
                    library.dislikeSong(idOf(raw.opt("id")), disliked);
                    data = JSONObject.NULL;
                    break;
                }
                default: {
                    if (operation.startsWith("search") && query.isEmpty()) {
                        JSONObject empty = new JSONObject();
                        try {
                            empty.put("items", new JSONArray());
                            empty.put("hasMore", false);
                            empty.put("nextOffset", offset);
                        } catch (JSONException error) {
                            throw new QishuiException("invalid-response", "Qishui response could not be read", null, error);
                        }
                        data = empty;
                    } else if ("search".equals(operation)) {
                        data = catalog.search(query, limit, offset);
                    } else if ("search_playlists".equals(operation)) {
                        data = catalog.searchPlaylists(query, limit, offset);
                    } else if ("user_playlists".equals(operation)) {
                        data = catalog.userPlaylists(limit, offset);
                    } else if ("artist_detail".equals(operation)) {
                        data = catalog.artistDetail(id);
                    } else if ("artist_songs".equals(operation)) {
                        data = catalog.artistSongs(id, limit, offset);
                    } else {
                        throw new QishuiException("unsupported", "Unsupported Qishui operation");
                    }
                    break;
                }
            }
            if (!ACCOUNT_SWITCH_EXEMPT.contains(operation) && !equalsNullable(userBefore, currentUser())) {
                throw new QishuiException("unavailable", "Qishui account changed during the request");
            }
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("data", data == null ? JSONObject.NULL : data);
            return result;
        } catch (QishuiException error) {
            if (operation != null && operation.startsWith("login")) {
                StringBuilder detail = new StringBuilder();
                for (String value : new String[]{error.code(), error.stage(), error.upstreamCode()}) {
                    if (value == null || value.isEmpty()) continue;
                    if (detail.length() > 0) detail.append(' ');
                    detail.append(value);
                }
                client.warn("[Qishui] Sign-in operation failed: " + detail);
            }
            JSONObject result = new JSONObject();
            try {
                result.put("ok", false);
                JSONObject failure = new JSONObject();
                failure.put("code", error.code());
                failure.put("message", error.getMessage());
                if (error.upstreamCode() != null) failure.put("upstreamCode", error.upstreamCode());
                if (error.stage() != null) failure.put("stage", error.stage());
                result.put("error", failure);
            } catch (JSONException ignored) {
                // A JSONObject cannot fail to hold strings.
            }
            return result;
        } catch (Throwable error) {
            JSONObject result = new JSONObject();
            try {
                result.put("ok", false);
                JSONObject failure = new JSONObject();
                failure.put("code", "invalid-response");
                failure.put("message", "Qishui operation failed");
                result.put("error", failure);
            } catch (JSONException ignored) {
                // A JSONObject cannot fail to hold strings.
            }
            return result;
        }
    }

    private String currentUser() {
        QishuiSession value = sessions.get();
        return value == null ? null : value.userId;
    }

    private static boolean equalsNullable(String left, String right) {
        return left == null ? right == null : left.equals(right);
    }

    private static int limit(Object raw) throws QishuiException {
        if (raw == null || raw == JSONObject.NULL) return 30;
        double value = QishuiProtocol.number(raw);
        double limited = Math.min(value, 100);
        if (Double.isNaN(limited) || Double.isInfinite(limited) || limited != Math.rint(limited)
                || limited < 1) {
            throw new QishuiException("invalid-response", "Invalid Qishui page");
        }
        return (int) limited;
    }

    private static long offset(Object raw) throws QishuiException {
        if (raw == null || raw == JSONObject.NULL) return 0;
        if (!(raw instanceof Number)) throw new QishuiException("invalid-response", "Invalid Qishui page");
        double value = ((Number) raw).doubleValue();
        if (Double.isNaN(value) || Double.isInfinite(value) || value != Math.rint(value)
                || value < 0 || value > 50000 || Math.abs(value) > 9007199254740991.0) {
            throw new QishuiException("invalid-response", "Invalid Qishui page");
        }
        return (long) value;
    }

    private static String idOf(Object value) throws QishuiException {
        if (!QishuiProtocol.isMediaId(value)) {
            throw new QishuiException("invalid-response", "Invalid Qishui media ID");
        }
        return (String) value;
    }

    private static boolean truthy(Object value) {
        if (value == null || value == JSONObject.NULL) return false;
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof Number) return ((Number) value).doubleValue() != 0;
        if (value instanceof String) return !((String) value).isEmpty();
        return true;
    }
}
