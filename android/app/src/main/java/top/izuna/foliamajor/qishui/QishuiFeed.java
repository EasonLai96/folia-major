package top.izuna.foliamajor.qishui;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

// Separate recommendation queues keep scene switches and exploration from consuming each other's stream.
public final class QishuiFeed {

    public static final class Options {
        public Object scene;
        public String preference;
        public String queue = "fm";
        public boolean first;
        public int count = 20;
    }

    private static final class State {
        int count;
        long selectedAt;

        State(int count, long selectedAt) {
            this.count = count;
            this.selectedAt = selectedAt;
        }
    }

    private final QishuiClient client;
    private final Object feedLock = new Object();
    private final Object stateLock = new Object();
    private final Map<String, State> queues = new LinkedHashMap<>();
    private final Map<String, String> activeKeys = new HashMap<>();
    private int generation;
    private long total;

    public QishuiFeed(QishuiClient client) {
        this.client = client;
    }

    public void clear() {
        synchronized (stateLock) {
            generation++;
            queues.clear();
            activeKeys.clear();
            total = 0;
        }
    }

    public JSONArray modes() throws QishuiException {
        JSONObject data = client.platform(QishuiProtocol.PREFIX + "/feed/mode/", new JSONObject(), null).data;
        JSONArray blocks = QishuiClient.array(data.opt("feed_mode_block"));
        if (blocks == null) throw new QishuiException("invalid-response", "Qishui feed modes are missing");
        JSONArray result = new JSONArray();
        for (int blockIndex = 0; blockIndex < blocks.length(); blockIndex++) {
            JSONObject block = QishuiClient.object(blocks.opt(blockIndex));
            JSONArray modes = block == null ? null : QishuiClient.array(block.opt("feed_mode"));
            if (modes == null) continue;
            for (int modeIndex = 0; modeIndex < modes.length(); modeIndex++) {
                JSONObject item = QishuiClient.object(modes.opt(modeIndex));
                JSONObject entity = item == null ? null : QishuiClient.object(item.opt("entity"));
                JSONObject mode = entity == null ? null : QishuiClient.object(entity.opt("feed_mode"));
                JSONObject scene = mode == null ? null : QishuiClient.object(mode.opt("scene_mode"));
                Object rawId = scene == null ? null : scene.opt("scene_mode_id");
                if (rawId == null || rawId == JSONObject.NULL) continue;
                JSONObject value = new JSONObject();
                try {
                    value.put("id", String.valueOf(rawId));
                    value.put("name", nonNullText(mode.opt("text")));
                    value.put("group", nonNullText(block.opt("title")));
                    Object cover = mode.opt("url_info");
                    if (cover != null && cover != JSONObject.NULL) value.put("coverUrl", cover);
                } catch (JSONException error) {
                    throw new QishuiException("invalid-response", "Qishui feed modes could not be read", null, error);
                }
                result.put(value);
            }
        }
        return result;
    }

    public JSONObject songs(Options options) throws QishuiException {
        if (options == null) options = new Options();
        if (options.preference != null && !options.preference.matches("[a-z][a-z_]{0,31}")) {
            throw new QishuiException("invalid-response", "Invalid preference");
        }
        String scene = options.scene == null ? null : String.valueOf(options.scene);
        if (options.scene != null && options.preference != null && !options.preference.isEmpty()) {
            throw new QishuiException("invalid-response", "Scene and preference are mutually exclusive");
        }
        if (scene != null && (!scene.matches("\\d+") || !isSafeInteger(scene))) {
            throw new QishuiException("invalid-response", "Invalid scene");
        }
        String queue = "explore".equals(options.queue) ? "explore" : "fm";
        String key = queue + ":" + (scene != null ? scene
                : options.preference != null && !options.preference.isEmpty() ? options.preference : "default");
        synchronized (feedLock) {
            int mine;
            State state;
            long requestTotal;
            synchronized (stateLock) {
                mine = generation;
                if (queues.size() > 100) queues.clear();
                State previous = queues.get(key);
                String active = activeKeys.get(queue);
                state = options.first || previous == null || !key.equals(active)
                        ? new State(0, System.currentTimeMillis()) : previous;
                requestTotal = ++total;
            }
            JSONObject body = new JSONObject();
            try {
                body.put("played_media", new JSONArray());
                body.put("is_first_request", state.count == 0);
                body.put("with_client_cache", state.count != 0);
                body.put("is_did_first_request", false);
                body.put("count", options.count);
                JSONObject preference = new JSONObject();
                preference.put("scene_mode_id", scene == null ? JSONObject.NULL : (long) QishuiProtocol.number(scene));
                preference.put("scene_mode_select_time", scene == null ? JSONObject.NULL : state.selectedAt);
                preference.put("preference_mode", options.preference == null || options.preference.isEmpty()
                        ? JSONObject.NULL : options.preference);
                preference.put("total_request_count", requestTotal);
                preference.put("preference_mode_request_count", state.count + 1);
                preference.put("current_mode_request_count", state.count + 1);
                body.put("feed_preference", preference);
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui feed could not be prepared", null, error);
            }
            JSONObject data = client.platform(QishuiProtocol.PREFIX + "/feed/song-tab/", body, null).data;
            JSONArray raw = QishuiClient.array(data.opt("items"));
            if (raw == null) throw new QishuiException("invalid-response", "Qishui feed items are missing");
            JSONArray items = new JSONArray();
            for (int index = 0; index < raw.length(); index++) {
                JSONObject item = QishuiClient.object(raw.opt(index));
                if (item == null) continue;
                String type = QishuiClient.nonEmpty(item.opt("type"));
                if (type != null && !"track".equals(type)) continue;
                items.put(QishuiCatalog.publicTrack(item));
            }
            synchronized (stateLock) {
                if (mine != generation) throw new QishuiException("unavailable", "Qishui account changed");
                activeKeys.put(queue, key);
                state.count++;
                queues.put(key, state);
            }
            JSONObject result = new JSONObject();
            try {
                result.put("items", items);
                result.put("hasMore", QishuiClient.isTrue(data.opt("has_more")));
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui feed could not be read", null, error);
            }
            return result;
        }
    }

    private static String nonNullText(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        return String.valueOf(value);
    }

    private static boolean isSafeInteger(String value) {
        try {
            long parsed = Long.parseLong(value);
            return Math.abs(parsed) <= 9007199254740991L;
        } catch (NumberFormatException error) {
            return false;
        }
    }
}
