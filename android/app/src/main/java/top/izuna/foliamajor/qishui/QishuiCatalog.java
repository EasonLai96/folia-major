package top.izuna.foliamajor.qishui;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

// Catalogue reads preserve opaque playlist cursors and the search endpoint's fixed batch size.
public final class QishuiCatalog {

    private static final long CURSOR_TTL_MS = 5 * 60 * 1000L;
    private static final int CURSOR_PLAYLISTS = 32;
    private static final int MAX_PAGES = 500;

    private static final class Mark {
        final String cursor;
        final Mark previous;

        Mark(String cursor, Mark previous) {
            this.cursor = cursor;
            this.previous = previous;
        }
    }

    private static final class CursorEntry {
        final long at = System.currentTimeMillis();
        final Map<Long, Mark> positions = new LinkedHashMap<>();
        JSONObject collection;
    }

    private final QishuiClient client;
    private final QishuiSessions sessions;
    private final Map<String, CursorEntry> cursors = new LinkedHashMap<>();
    private String account = "";

    // Short-lived per-account resume points are dropped after edits and account switches.
    public QishuiCatalog(QishuiClient client, QishuiSessions sessions) {
        this.client = client;
        this.sessions = sessions;
    }

    public synchronized void forgetPlaylist(String id) {
        Iterator<String> keys = cursors.keySet().iterator();
        while (keys.hasNext()) {
            String key = keys.next();
            if (id == null || key.startsWith(id + ":")) keys.remove();
        }
    }

    private synchronized CursorEntry cursorFor(String id, String ownerId) {
        String user = sessions.get() == null || sessions.get().userId == null ? "" : sessions.get().userId;
        if (!user.equals(account)) {
            cursors.clear();
            account = user;
        }
        String key = id + ":" + (ownerId == null ? "" : ownerId);
        CursorEntry entry = cursors.remove(key);
        if (entry != null && System.currentTimeMillis() - entry.at > CURSOR_TTL_MS) entry = null;
        if (entry == null) entry = new CursorEntry();
        cursors.put(key, entry);
        while (cursors.size() > CURSOR_PLAYLISTS) {
            Iterator<String> oldest = cursors.keySet().iterator();
            if (!oldest.hasNext()) break;
            oldest.next();
            oldest.remove();
        }
        return entry;
    }

    public JSONObject search(String query, int limit, long offset) throws QishuiException {
        return searchPage(query, "track", limit, offset);
    }

    public JSONObject searchPlaylists(String query, int limit, long offset) throws QishuiException {
        return searchPage(query, "playlist", limit, offset);
    }

    private JSONObject searchPage(String query, String type, int limit, long offset) throws QishuiException {
        JSONArray items = new JSONArray();
        String searchId = UUID.randomUUID().toString();
        long cursor = offset;
        boolean more = false;
        while (items.length() < limit) {
            JSONObject body = new JSONObject();
            try {
                body.put("q", query);
                body.put("cursor", String.valueOf(cursor));
                body.put("search_id", searchId);
                body.put("from_search_id", searchId);
                body.put("search_method", "input");
                body.put("search_type", type);
                body.put("search_scene", "normal");
                body.put("scene_name", "search");
                body.put("ab_param", "");
                body.put("last_viewed_media", new JSONObject());
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui search could not be prepared", null, error);
            }
            JSONObject data = client.platform(QishuiProtocol.PREFIX + "/search/", body, null).data;
            JSONArray groups = array(data.opt("result_groups"), "search groups");
            JSONObject group = null;
            for (int index = 0; index < groups.length(); index++) {
                JSONObject candidate = QishuiClient.object(groups.opt(index));
                if (candidate != null && (type + "s").equals(QishuiClient.text(candidate.opt("id")))) {
                    group = candidate;
                    break;
                }
            }
            if (group == null && groups.length() > 0) group = QishuiClient.object(groups.opt(0));
            if (group == null) break;
            JSONArray rows = array(group.opt("data"), "search items");
            List<JSONObject> batch = new ArrayList<>();
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = QishuiClient.object(rows.opt(index));
                JSONObject entity = row == null ? null : QishuiClient.object(row.opt("entity"));
                JSONObject value = entity == null ? null : QishuiClient.object(entity.opt(type));
                if (value != null) batch.add(value);
            }
            int remaining = limit - items.length();
            for (int index = 0; index < batch.size() && index < remaining; index++) {
                JSONObject value = batch.get(index);
                items.put(type.equals("track") ? publicTrack(value) : value);
            }
            more = batch.size() > remaining || QishuiClient.isTrue(group.opt("has_more"));
            if (batch.isEmpty() || !more || items.length() == limit) break;
            long next = safeLong(group.opt("next_cursor"));
            if (next <= cursor) throw new QishuiException("invalid-response", "Search cursor did not advance");
            cursor = next;
        }
        JSONObject result = new JSONObject();
        try {
            result.put("items", items);
            result.put("hasMore", more && items.length() > 0);
            result.put("nextOffset", offset + items.length());
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui search response could not be read", null, error);
        }
        return result;
    }

    public JSONObject track(String id) throws QishuiException {
        JSONObject body = new JSONObject();
        try {
            JSONArray mediaList = new JSONArray();
            JSONObject media = new JSONObject();
            media.put("id", id);
            media.put("type", "track");
            mediaList.put(media);
            body.put("media_list", mediaList);
            body.put("card_context", new JSONObject());
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui track could not be prepared", null, error);
        }
        JSONObject data = client.platform(QishuiProtocol.PREFIX + "/media/mget/", body, null).data;
        JSONArray list = array(data.opt("media_list"), "media list");
        for (int index = 0; index < list.length(); index++) {
            JSONObject item = QishuiClient.object(list.opt(index));
            if (item == null) continue;
            JSONObject trackEntity = QishuiClient.object(item.opt("track_entity"));
            String mediaId = QishuiClient.nonEmpty(item.opt("media_id"));
            if (mediaId == null && trackEntity != null) {
                JSONObject base = QishuiClient.object(trackEntity.opt("base_info"));
                mediaId = base == null ? null : QishuiClient.nonEmpty(base.opt("id"));
            }
            if (id.equals(mediaId) && trackEntity != null) return trackEntity;
        }
        throw new QishuiException("not-playable", "Qishui did not return the track");
    }

    public JSONObject playlistTracks(String id, String ownerId, int limit, long offset) throws QishuiException {
        CursorEntry marks = cursorFor(id, ownerId);
        try {
            return playlistPage(id, ownerId, limit, offset, marks);
        } catch (QishuiException error) {
            forgetPlaylist(id);
            throw error;
        }
    }

    private JSONObject playlistPage(String id, String ownerId, int limit, long offset, CursorEntry marks)
            throws QishuiException {
        synchronized (marks) {
            Mark lineage = new Mark("0", null);
            long consumed = 0;
            for (Map.Entry<Long, Mark> mark : marks.positions.entrySet()) {
                long position = mark.getKey();
                if (position <= offset && position > consumed) {
                    consumed = position;
                    lineage = mark.getValue();
                }
            }
            String cursor = lineage.cursor;
            Set<String> seen = new LinkedHashSet<>();
            for (Mark ancestor = lineage; ancestor != null; ancestor = ancestor.previous) {
                seen.add(ancestor.cursor);
            }
            JSONArray items = new JSONArray();
            JSONObject collection = consumed > 0 ? marks.collection : null;
            boolean hasMore = false;
            int pages = 0;
            while (items.length() < limit && pages < MAX_PAGES) {
                pages++;
                seen.add(cursor);
                JSONObject body = new JSONObject();
                try {
                    body.put("playlist_id", id);
                    body.put("owner_id", ownerId == null ? "" : ownerId);
                    body.put("count", 100);
                    body.put("cursor", cursor);
                    body.put("type", JSONObject.NULL);
                } catch (JSONException error) {
                    throw new QishuiException("invalid-response", "Qishui playlist could not be prepared", null, error);
                }
                JSONObject data = client.platform(QishuiProtocol.PREFIX + "/playlist/detail/", body, null).data;
                if (collection == null) collection = QishuiClient.object(data.opt("playlist"));
                if ("0".equals(cursor)) marks.collection = QishuiClient.object(data.opt("playlist"));
                JSONArray batch = array(data.opt("media_entities"), "playlist tracks");
                long start = Math.max(0, offset - consumed);
                int remaining = limit - items.length();
                for (long index = start; index < batch.length() && index < start + remaining; index++) {
                    JSONObject raw = QishuiClient.object(batch.opt((int) index));
                    if (raw != null) items.put(publicTrack(raw));
                }
                consumed += batch.length();
                String next = cursorText(data.opt("next_cursor"));
                boolean upstreamMore = QishuiClient.isTrue(data.opt("has_more"));
                boolean unused = consumed > offset + items.length();
                hasMore = unused || upstreamMore;
                if (upstreamMore && seen.contains(next)) {
                    throw new QishuiException("invalid-response", "Playlist cursor did not advance");
                }
                if (upstreamMore && batch.length() > 0 && !next.isEmpty()) {
                    lineage = new Mark(next, lineage);
                    marks.positions.put(consumed, lineage);
                }
                if (!upstreamMore || items.length() == limit) break;
                if (batch.length() == 0 || next.isEmpty() || seen.contains(next)) {
                    throw new QishuiException("invalid-response", "Playlist cursor did not advance");
                }
                cursor = next;
            }
            if (pages >= MAX_PAGES && items.length() < limit && hasMore) {
                throw new QishuiException("invalid-response", "Playlist page limit reached");
            }
            JSONObject result = new JSONObject();
            try {
                result.put("items", items);
                result.put("collection", collection == null ? JSONObject.NULL : collection);
                result.put("hasMore", hasMore && items.length() > 0);
                result.put("nextOffset", offset + items.length());
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui playlist response could not be read", null, error);
            }
            return result;
        }
    }

    public JSONObject userPlaylists(int limit, long offset) throws QishuiException {
        List<JSONObject> items = new ArrayList<>();
        String[][] paths = {{"/me/playlist/", "playlists"}, {"/me/collection/mixed/", "mixed_collections"}};
        for (int index = 0; index < paths.length; index++) {
            String path = paths[index][0];
            String field = paths[index][1];
            boolean owned = index == 0;
            String cursor = "";
            Set<String> seen = new LinkedHashSet<>();
            for (int page = 0; page < MAX_PAGES; page++) {
                seen.add(cursor);
                JSONObject body = new JSONObject();
                try {
                    body.put("count", 100);
                    body.put("cursor", cursor);
                    JSONArray types = new JSONArray();
                    types.put("playlist");
                    body.put("item_types", types);
                } catch (JSONException error) {
                    throw new QishuiException("invalid-response", "Qishui account playlists could not be prepared", null, error);
                }
                JSONObject data = client.account(QishuiProtocol.PREFIX + path, body).data;
                Object raw = data.opt(field);
                if (raw == null || raw == JSONObject.NULL) {
                    raw = "/me/playlist/".equals(path) ? data.opt("playlist_list") : null;
                }
                JSONArray rows = array(raw, field);
                for (int rowIndex = 0; rowIndex < rows.length(); rowIndex++) {
                    JSONObject row = QishuiClient.object(rows.opt(rowIndex));
                    if (row == null) continue;
                    JSONObject playlist = QishuiClient.object(row.opt("playlist"));
                    if (playlist == null) playlist = row;
                    JSONObject base = QishuiClient.object(playlist.opt("base_info"));
                    if (base == null || QishuiClient.nonEmpty(base.opt("id")) == null) continue;
                    try {
                        playlist.put("isOwned", owned);
                    } catch (JSONException error) {
                        throw new QishuiException("invalid-response", "Qishui account playlists could not be read", null, error);
                    }
                    items.add(playlist);
                }
                if (!QishuiClient.isTrue(data.opt("has_more"))) break;
                String next = cursorText(data.opt("next_cursor"));
                if (next.isEmpty() || seen.contains(next) || rows.length() == 0 || page == MAX_PAGES - 1) {
                    throw new QishuiException("invalid-response", "Account playlist cursor did not advance");
                }
                cursor = next;
            }
        }
        Map<String, JSONObject> unique = new LinkedHashMap<>();
        for (JSONObject item : items) {
            JSONObject base = QishuiClient.object(item.opt("base_info"));
            unique.put(QishuiClient.text(base == null ? null : base.opt("id")), item);
        }
        List<JSONObject> values = new ArrayList<>(unique.values());
        JSONArray sliced = new JSONArray();
        long end = Math.min((long) values.size(), offset + limit);
        for (long index = offset; index < end; index++) sliced.put(values.get((int) index));
        JSONObject result = new JSONObject();
        try {
            result.put("items", sliced);
            result.put("total", values.size());
            result.put("nextOffset", offset + Math.min(limit, Math.max(0, values.size() - offset)));
            result.put("hasMore", offset + limit < values.size());
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui account playlists could not be read", null, error);
        }
        return result;
    }

    public JSONObject artistDetail(String id) throws QishuiException {
        JSONObject body = new JSONObject();
        try {
            body.put("artist_id", id);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui artist could not be prepared", null, error);
        }
        JSONObject data = client.platform(QishuiProtocol.PREFIX + "/artist/detail/", body, null).data;
        JSONObject artist = QishuiClient.object(data.opt("artist_info"));
        if (artist == null) throw new QishuiException("invalid-response", "Qishui artist is missing");
        return artist;
    }

    public JSONObject artistSongs(String id, int limit, long offset) throws QishuiException {
        JSONObject body = new JSONObject();
        try {
            body.put("artist_id", id);
            body.put("count", 50);
            body.put("cursor", "0");
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui artist tracks could not be prepared", null, error);
        }
        JSONObject data = client.platform(QishuiProtocol.PREFIX + "/artist/tracks/", body, null).data;
        JSONArray raw = array(data.opt("tracks"), "artist tracks");
        List<JSONObject> tracks = new ArrayList<>();
        for (int index = 0; index < raw.length(); index++) {
            JSONObject value = QishuiClient.object(raw.opt(index));
            if (value != null) tracks.add(publicTrack(value));
        }
        JSONArray items = new JSONArray();
        long end = Math.min((long) tracks.size(), offset + limit);
        for (long index = offset; index < end; index++) items.put(tracks.get((int) index));
        JSONObject result = new JSONObject();
        try {
            result.put("items", items);
            result.put("total", tracks.size());
            result.put("nextOffset", Math.min(offset + limit, tracks.size()));
            result.put("hasMore", offset + limit < tracks.size());
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui artist tracks could not be read", null, error);
        }
        return result;
    }

    public static JSONObject publicTrack(JSONObject raw) throws QishuiException {
        if (raw == null) throw new QishuiException("invalid-response", "Qishui track identity is missing");
        JSONObject track = QishuiClient.object(raw.opt("track_entity"));
        if (track == null) {
            JSONObject entity = QishuiClient.object(raw.opt("entity"));
            JSONObject media = entity == null ? null : QishuiClient.object(entity.opt("media"));
            if (media != null) track = QishuiClient.object(media.opt("track_entity"));
            if (track == null && entity != null) track = QishuiClient.object(entity.opt("track"));
        }
        if (track == null) track = QishuiClient.object(raw.opt("track"));
        if (track == null) track = raw;
        JSONObject base = QishuiClient.object(track.opt("base_info"));
        String id = base == null ? null : QishuiClient.nonEmpty(base.opt("id"));
        if (id == null) id = QishuiClient.nonEmpty(track.opt("id"));
        if (id == null) throw new QishuiException("invalid-response", "Qishui track identity is missing");
        JSONObject value = new JSONObject();
        try {
            value.put("id", id);
            putIfPresent(value, "base_info", track.opt("base_info"));
            putIfPresent(value, "related_info", track.opt("related_info"));
            putIfPresent(value, "display_info", track.opt("display_info"));
            putIfPresent(value, "commerce_info", track.opt("commerce_info"));
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Qishui track could not be read", null, error);
        }
        return value;
    }

    private static void putIfPresent(JSONObject target, String key, Object value) throws JSONException {
        if (value != null && value != JSONObject.NULL) target.put(key, value);
    }

    private static JSONArray array(Object value, String field) throws QishuiException {
        JSONArray array = QishuiClient.array(value);
        if (array == null) throw new QishuiException("invalid-response", "Qishui " + field + " is missing");
        return array;
    }

    private static long safeLong(Object value) throws QishuiException {
        double number = QishuiProtocol.number(value);
        if (Double.isNaN(number) || Double.isInfinite(number) || number != Math.rint(number)
                || Math.abs(number) > 9007199254740991.0) {
            throw new QishuiException("invalid-response", "Search cursor did not advance");
        }
        return (long) number;
    }

    private static String cursorText(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        return String.valueOf(value);
    }
}
