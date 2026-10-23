package top.izuna.foliamajor.qishui;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

// Account reads and writes the car client exposes through the Luna platform.
public final class QishuiLibrary {

    private static final int MAX_BATCH = 100;
    private static final int PAGE_SIZE = 100;
    private static final int PAGE_LIMIT = 500;

    private final QishuiClient client;

    public QishuiLibrary(QishuiClient client) {
        this.client = client;
    }

    public JSONObject likedSongs() throws QishuiException {
        Playlist liked = likedPlaylist();
        if (liked == null) throw new QishuiException("invalid-response", "Qishui liked playlist was not found");
        Set<String> ids = new LinkedHashSet<>();
        String cursor = "";
        boolean whole = false;
        Set<String> seen = new LinkedHashSet<>();
        for (int count = 0; count < PAGE_LIMIT; count++) {
            seen.add(cursor);
            JSONObject body = new JSONObject();
            try {
                body.put("playlist_id", liked.id);
                body.put("owner_id", liked.ownerId);
                body.put("count", PAGE_SIZE);
                body.put("cursor", cursor);
                body.put("type", 1);
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui liked tracks could not be prepared", null, error);
            }
            JSONObject data = client.platform(QishuiProtocol.PREFIX + "/playlist/detail/", body, null).data;
            JSONArray media = requiredList(data, new String[]{"media_entities", "media_list"}, "liked playlist tracks");
            for (int index = 0; index < media.length(); index++) {
                JSONObject item = QishuiClient.object(media.opt(index));
                if (item == null) continue;
                String id = QishuiCatalog.publicTrack(item).optString("id", "");
                if (!id.isEmpty()) ids.add(id);
            }
            if (!QishuiClient.isTrue(data.opt("has_more"))) {
                whole = true;
                break;
            }
            String next = cursorText(data.opt("next_cursor"));
            if (next.isEmpty() || seen.contains(next)) {
                throw new QishuiException("invalid-response", "Liked playlist cursor did not advance");
            }
            cursor = next;
        }
        JSONObject result = new JSONObject();
        try {
            JSONArray values = new JSONArray();
            for (String id : ids) values.put(id);
            result.put("ids", values);
            result.put("whole", whole);
            result.put("total", ids.size());
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui liked tracks could not be read", null, error);
        }
        return result;
    }

    private static final class Playlist {
        final String id;
        final String ownerId;

        Playlist(String id, String ownerId) {
            this.id = id;
            this.ownerId = ownerId;
        }
    }

    private Playlist likedPlaylist() throws QishuiException {
        String cursor = "";
        Set<String> seen = new LinkedHashSet<>();
        for (int count = 0; count < 20; count++) {
            seen.add(cursor);
            JSONObject body = new JSONObject();
            try {
                body.put("count", PAGE_SIZE);
                body.put("cursor", cursor);
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui account playlists could not be prepared", null, error);
            }
            JSONObject data = client.account(QishuiProtocol.PREFIX + "/me/playlist/", body).data;
            JSONArray rows = requiredList(data, new String[]{"playlists", "playlist_list"}, "account playlists");
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = QishuiClient.object(rows.opt(index));
                if (row == null) continue;
                JSONObject playlist = QishuiClient.object(row.opt("playlist"));
                if (playlist == null) playlist = row;
                JSONObject base = QishuiClient.object(playlist.opt("base_info"));
                if (base == null) continue;
                if ((long) QishuiProtocol.number(base.opt("type")) == 1L
                        && QishuiClient.nonEmpty(base.opt("id")) != null) {
                    return new Playlist(String.valueOf(base.opt("id")),
                            QishuiClient.text(base.opt("owner_id")));
                }
            }
            if (!QishuiClient.isTrue(data.opt("has_more"))) return null;
            String next = cursorText(data.opt("next_cursor"));
            if (next.isEmpty() || seen.contains(next)) {
                throw new QishuiException("invalid-response", "Account playlist cursor did not advance");
            }
            cursor = next;
        }
        throw new QishuiException("invalid-response", "Account playlist page limit reached");
    }

    public JSONObject recentPlayed(int limit, long offset) throws QishuiException {
        JSONArray items = new JSONArray();
        String cursor = "";
        long consumed = 0;
        boolean hasMore = false;
        for (int count = 0; count < PAGE_LIMIT; count++) {
            JSONObject body = new JSONObject();
            try {
                body.put("count", PAGE_SIZE);
                body.put("cursor", cursor);
                body.put("media_type", "track");
                body.put("scene", "me_tab");
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui recent tracks could not be prepared", null, error);
            }
            JSONObject data = client.account(QishuiProtocol.PREFIX + "/me/recent-played/", body).data;
            JSONArray rows = QishuiClient.array(data.opt("media"));
            if (rows == null && QishuiClient.isTrue(data.opt("has_more"))) {
                throw new QishuiException("invalid-response", "Qishui recent tracks are missing");
            }
            if (rows == null) rows = new JSONArray();
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = QishuiClient.object(rows.opt(index));
                JSONObject media = row == null ? null : QishuiClient.object(row.opt("media"));
                if (media == null || QishuiClient.object(media.opt("track_entity")) == null) continue;
                JSONObject track = QishuiCatalog.publicTrack(media);
                double rawPlayedAt = QishuiProtocol.number(row.opt("play_start_timestamp"));
                double playedAt = rawPlayedAt > 1e12 ? rawPlayedAt : rawPlayedAt * 1000;
                if (consumed >= offset && items.length() < limit) {
                    try {
                        if (Double.isFinite(playedAt) && playedAt > 0) {
                            track.put("playedAt", (long) playedAt);
                        }
                    } catch (JSONException error) {
                        throw new QishuiException("invalid-response", "Qishui recent tracks could not be read", null, error);
                    }
                    items.put(track);
                }
                consumed++;
            }
            boolean upstreamMore = QishuiClient.isTrue(data.opt("has_more"));
            hasMore = consumed > offset + items.length() || upstreamMore;
            if (!upstreamMore || items.length() >= limit) break;
            String next = cursorText(data.opt("next_cursor"));
            if (next.isEmpty() || next.equals(cursor)) {
                throw new QishuiException("invalid-response", "Recent-played cursor did not advance");
            }
            cursor = next;
        }
        JSONObject result = new JSONObject();
        try {
            result.put("items", items);
            result.put("hasMore", hasMore && items.length() > 0);
            result.put("nextOffset", offset + items.length());
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui recent tracks could not be read", null, error);
        }
        return result;
    }

    public JSONObject checkTracks(JSONArray ids) throws QishuiException {
        JSONArray refs = refs(mediaIds(ids));
        JSONObject body = new JSONObject();
        try {
            body.put("media_list", refs);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui media status could not be prepared", null, error);
        }
        JSONObject data = client.platform(QishuiProtocol.PREFIX + "/media/mcheck/", body, null).data;
        JSONArray rows = QishuiClient.array(data.opt("media_status_list"));
        JSONArray statuses = new JSONArray();
        if (rows != null) {
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = QishuiClient.object(rows.opt(index));
                if (row == null) continue;
                JSONObject risk = QishuiClient.object(row.opt("risk_info"));
                Object rawRisk = risk == null ? null : risk.opt("risk_result");
                Object rawStatus = risk == null ? null : risk.opt("status");
                JSONObject value = new JSONObject();
                try {
                    value.put("id", row.opt("id") == null || row.opt("id") == JSONObject.NULL
                            ? "" : String.valueOf(row.opt("id")));
                    value.put("riskResult", rawRisk == null || rawRisk == JSONObject.NULL
                            ? -1 : (long) QishuiProtocol.number(rawRisk));
                    value.put("status", rawStatus == null || rawStatus == JSONObject.NULL
                            ? 0 : (long) QishuiProtocol.number(rawStatus));
                } catch (JSONException error) {
                    throw new QishuiException("invalid-response", "Qishui media status could not be read", null, error);
                }
                statuses.put(value);
            }
        }
        JSONObject result = new JSONObject();
        try {
            result.put("statuses", statuses);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui media status could not be read", null, error);
        }
        return result;
    }

    public void likeSong(String id, Object liked) throws QishuiException {
        String trackId = mediaId(id);
        boolean value = booleanValue(liked);
        JSONObject body = new JSONObject();
        try {
            JSONArray media = new JSONArray();
            media.put(ref(trackId));
            body.put("media", media);
            if (value) {
                body.put("scene", "");
                body.put("collect_action", 1);
                client.command(QishuiProtocol.PREFIX + "/media/collect/", body);
            } else {
                client.command(QishuiProtocol.PREFIX + "/media/cancel/collect/", body);
            }
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui track update could not be prepared", null, error);
        }
    }

    public void editPlaylist(String operation, String id, JSONArray ids) throws QishuiException {
        String playlistId = mediaId(id);
        JSONArray tracks = refs(mediaIds(ids));
        if (!"add".equals(operation) && !"remove".equals(operation)) {
            throw new QishuiException("unsupported", "Unsupported playlist operation");
        }
        String path = "add".equals(operation) ? "/playlist/append/" : "/playlist/delete/";
        JSONObject body = new JSONObject();
        try {
            body.put("playlist_id", playlistId);
            body.put("media", tracks);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui playlist update could not be prepared", null, error);
        }
        client.command(QishuiProtocol.PREFIX + path, body);
    }

    public void dislikeSong(String id, Object disliked) throws QishuiException {
        String trackId = mediaId(id);
        boolean value = booleanValue(disliked);
        JSONObject body = new JSONObject();
        try {
            body.put("item_id", trackId);
            body.put("author_ids", new JSONArray());
            body.put("dislike_item_type", "track");
            body.put("action_type", value ? 0 : 1);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui dislike could not be prepared", null, error);
        }
        client.command(QishuiProtocol.PREFIX + "/dislike/", body);
    }

    private static JSONObject ref(String id) throws JSONException {
        JSONObject value = new JSONObject();
        value.put("id", id);
        value.put("type", "track");
        return value;
    }

    private static JSONArray refs(List<String> ids) throws QishuiException {
        JSONArray values = new JSONArray();
        for (String id : ids) {
            try {
                values.put(ref(id));
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui media could not be prepared", null, error);
            }
        }
        return values;
    }

    private static List<String> mediaIds(JSONArray value) throws QishuiException {
        if (value == null || value.length() == 0) {
            throw new QishuiException("invalid-response", "Qishui media IDs are required");
        }
        if (value.length() > MAX_BATCH) {
            throw new QishuiException("unsupported", "Select at most " + MAX_BATCH + " tracks per operation");
        }
        Set<String> unique = new LinkedHashSet<>();
        for (int index = 0; index < value.length(); index++) {
            unique.add(mediaId(value.opt(index)));
        }
        return new ArrayList<>(unique);
    }

    private static String mediaId(Object value) throws QishuiException {
        if (!QishuiProtocol.isMediaId(value)) {
            throw new QishuiException("invalid-response", "Invalid Qishui media ID");
        }
        return (String) value;
    }

    private static boolean booleanValue(Object value) throws QishuiException {
        if (!(value instanceof Boolean)) throw new QishuiException("invalid-response", "Invalid Qishui boolean");
        return (Boolean) value;
    }

    private static JSONArray requiredList(JSONObject data, String[] fields, String label) throws QishuiException {
        for (String field : fields) {
            JSONArray value = QishuiClient.array(data.opt(field));
            if (value != null) return value;
        }
        throw new QishuiException("invalid-response", "Qishui " + label + " is missing");
    }

    private static String cursorText(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        return String.valueOf(value);
    }
}
