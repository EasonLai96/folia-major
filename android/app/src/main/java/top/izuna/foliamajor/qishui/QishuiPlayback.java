package top.izuna.foliamajor.qishui;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

// Plays only plaintext resources issued by the car service. No key extraction or CENC decryption.
public final class QishuiPlayback {

    private static final String[] RANKS = {"standard", "high", "lossless", "hires"};

    private static final class Candidate {
        final String url;
        final String quality;
        final double bitrate;

        Candidate(String url, String quality, double bitrate) {
            this.url = url;
            this.quality = quality;
            this.bitrate = bitrate;
        }
    }

    private QishuiPlayback() {
    }

    public static JSONObject resolveAudio(QishuiClient client, JSONObject track, String requested)
            throws QishuiException {
        JSONObject player = QishuiClient.object(track.opt("player_info"));
        if (player == null) throw new QishuiException("not-playable", "Qishui returned no player information");
        Set<String> refused = new LinkedHashSet<>();
        for (String variant : new String[]{"full", "preview"}) {
            JSONObject variantInfo = QishuiClient.object(player.opt(variant));
            JSONObject info = variantInfo == null ? null : QishuiClient.object(variantInfo.opt("video_model_info"));
            if (info == null) continue;
            List<Candidate> candidates = new ArrayList<>();
            boolean[] skipped = {false};
            JSONObject model = QishuiClient.object(info.opt("video_model"));
            if (model == null && info.opt("video_model") instanceof String) {
                model = parseModel(info.opt("video_model"));
            }
            if (model != null) {
                JSONArray list = QishuiClient.array(model.opt("video_list"));
                if (list != null) {
                    for (int index = 0; index < list.length(); index++) {
                        JSONObject item = QishuiClient.object(list.opt(index));
                        if (item == null || encrypted(item) || QishuiClient.nonEmpty(item.opt("main_url")) == null) {
                            continue;
                        }
                        JSONObject meta = QishuiClient.object(item.opt("video_meta"));
                        add(candidates, refused, skipped, item.opt("main_url"),
                                meta == null ? null : QishuiClient.text(meta.opt("quality")),
                                meta == null ? 0 : QishuiProtocol.number(meta.opt("bitrate")));
                    }
                }
            }
            if (candidates.isEmpty() && QishuiClient.nonEmpty(info.opt("url_player_info")) != null) {
                String playInfo = trusted(info.opt("url_player_info"), refused);
                if (playInfo != null) {
                    JSONObject data = client.get(playInfo).data;
                    JSONArray list = playInfoList(data);
                    if (list == null) throw new QishuiException("invalid-response", "Qishui PlayInfoList is missing");
                    for (int index = 0; index < list.length(); index++) {
                        JSONObject item = QishuiClient.object(list.opt(index));
                        if (item == null || encrypted(item) || QishuiClient.nonEmpty(item.opt("MainPlayUrl")) == null) {
                            continue;
                        }
                        add(candidates, refused, skipped, item.opt("MainPlayUrl"),
                                QishuiClient.text(item.opt("Quality")),
                                QishuiProtocol.number(item.opt("Bitrate")));
                    }
                } else {
                    skipped[0] = true;
                }
            }
            if (candidates.isEmpty()) {
                if (skipped[0]) {
                    report(client, refused);
                    throw new QishuiException("invalid-response", "Untrusted Qishui media host");
                }
                continue;
            }
            report(client, refused);
            List<Candidate> allowed = new ArrayList<>();
            for (Candidate candidate : candidates) {
                if (rank(candidate.quality) <= rank(requested)) allowed.add(candidate);
            }
            if (allowed.isEmpty()) allowed = candidates;
            allowed.sort(new Comparator<Candidate>() {
                @Override
                public int compare(Candidate left, Candidate right) {
                    int byQuality = Integer.compare(rank(right.quality), rank(left.quality));
                    if (byQuality != 0) return byQuality;
                    return Double.compare(right.bitrate, left.bitrate);
                }
            });
            Candidate source = allowed.get(0);
            client.info("[Qishui] Plaintext audio issued: quality=" + source.quality
                    + " preview=" + "preview".equals(variant));
            JSONObject result = new JSONObject();
            try {
                result.put("url", source.url);
                result.put("quality", source.quality);
                result.put("fetchedAt", System.currentTimeMillis());
                double expireAt = QishuiProtocol.number(info.opt("expire_at"));
                if (expireAt > System.currentTimeMillis() / 1000.0) {
                    result.put("expiresAt", (long) (expireAt * 1000));
                }
                result.put("preview", "preview".equals(variant));
                double clipStartMs = "preview".equals(variant)
                        ? previewStart(player) : 0;
                if (Double.isFinite(clipStartMs) && clipStartMs > 0) {
                    result.put("clipStartMs", (long) clipStartMs);
                }
            } catch (JSONException error) {
                throw new QishuiException("invalid-response", "Qishui audio could not be read", null, error);
            }
            return result;
        }
        throw new QishuiException("unsupported", "Qishui returned protected audio only; decryption is disabled");
    }

    private static JSONObject parseModel(Object raw) throws QishuiException {
        if (!(raw instanceof String)) return null;
        try {
            return new JSONObject((String) raw);
        } catch (JSONException error) {
            throw new QishuiException("invalid-response", "Invalid Qishui player model", null, error);
        }
    }

    private static void add(List<Candidate> candidates, Set<String> refused, boolean[] skipped,
                            Object raw, String quality, double bitrate) {
        String url = trusted(raw, refused);
        if (url != null) {
            candidates.add(new Candidate(url, level(quality), bitrate));
        } else {
            skipped[0] = true;
        }
    }

    private static String trusted(Object raw, Set<String> refused) {
        try {
            return QishuiProtocol.mediaUrl(raw);
        } catch (QishuiException error) {
            refused.add(QishuiProtocol.mediaHost(raw));
            return null;
        }
    }

    private static void report(QishuiClient client, Set<String> refused) {
        if (refused.isEmpty()) return;
        StringBuilder hosts = new StringBuilder();
        for (String host : refused) {
            if (hosts.length() > 0) hosts.append(", ");
            hosts.append(host);
        }
        client.warn("[Qishui] Skipped untrusted media hosts: " + hosts);
    }

    private static JSONArray playInfoList(JSONObject data) {
        JSONObject result = QishuiClient.object(data.opt("Result"));
        JSONObject inner = result == null ? null : QishuiClient.object(result.opt("Data"));
        JSONArray list = inner == null ? null : QishuiClient.array(inner.opt("PlayInfoList"));
        if (list == null) {
            JSONObject nested = QishuiClient.object(data.opt("data"));
            list = nested == null ? null : QishuiClient.array(nested.opt("PlayInfoList"));
        }
        if (list == null) list = QishuiClient.array(data.opt("PlayInfoList"));
        return list;
    }

    private static double previewStart(JSONObject player) {
        JSONObject preview = QishuiClient.object(player.opt("preview"));
        JSONObject duration = preview == null ? null : QishuiClient.object(preview.opt("duration"));
        return duration == null ? 0 : QishuiProtocol.number(duration.opt("start_ms"));
    }

    private static boolean encrypted(JSONObject item) {
        JSONObject info = QishuiClient.object(item.opt("encrypt_info"));
        if (info != null && (truthy(info.opt("encrypt")) || truthy(info.opt("spade_a")))) return true;
        if (truthy(item.opt("PlayAuth"))) return true;
        return QishuiProtocol.number(item.opt("Encrypt")) != 0;
    }

    private static boolean truthy(Object value) {
        if (value == null || value == JSONObject.NULL) return false;
        if (value instanceof Boolean) return (Boolean) value;
        if (value instanceof Number) return ((Number) value).doubleValue() != 0;
        if (value instanceof String) return !((String) value).isEmpty() && !"false".equals(value);
        return true;
    }

    private static String level(String quality) {
        if ("medium".equals(quality)) return "standard";
        if ("higher".equals(quality) || "highest".equals(quality)) return "high";
        if ("lossless".equals(quality)) return "lossless";
        if ("hi_res".equals(quality)) return "hires";
        return "standard";
    }

    private static int rank(String quality) {
        for (int index = 0; index < RANKS.length; index++) {
            if (RANKS[index].equals(quality)) return index;
        }
        return -1;
    }
}
