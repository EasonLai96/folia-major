package top.izuna.foliamajor;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

import top.izuna.foliamajor.qishui.QishuiAuth;
import top.izuna.foliamajor.qishui.QishuiCatalog;
import top.izuna.foliamajor.qishui.QishuiClient;
import top.izuna.foliamajor.qishui.QishuiFeed;
import top.izuna.foliamajor.qishui.QishuiLibrary;
import top.izuna.foliamajor.qishui.QishuiOperations;
import top.izuna.foliamajor.qishui.QishuiSessions;

// Qishui car-protocol bridge. Credentials and guard keys stay in this process, never in the WebView.
@CapacitorPlugin(name = "FoliaQishui")
public class FoliaQishuiPlugin extends Plugin {

    private static final String TAG = "FoliaQishui";

    private ExecutorService executor;
    private QishuiOperations operations;

    @Override
    public void load() {
        executor = Executors.newFixedThreadPool(3, runnable -> {
            Thread thread = new Thread(runnable, "FoliaQishui");
            thread.setDaemon(true);
            return thread;
        });
        QishuiSessions sessions = new QishuiSessions(getContext());
        QishuiClient client = new QishuiClient(sessions, new QishuiClient.Log() {
            @Override
            public void info(String line) {
                Log.i(TAG, line);
            }

            @Override
            public void warn(String line) {
                Log.w(TAG, line);
            }
        });
        QishuiFeed feed = new QishuiFeed(client);
        QishuiAuth auth = new QishuiAuth(client, sessions, feed);
        QishuiCatalog catalog = new QishuiCatalog(client, sessions);
        QishuiLibrary library = new QishuiLibrary(client);
        operations = new QishuiOperations(sessions, client, auth, catalog, library, feed);
    }

    @Override
    protected void handleOnDestroy() {
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
        operations = null;
    }

    /**
     * Runs one allowlisted Qishui operation off the UI thread.
     * Always resolves with `{ ok, data }` or `{ ok: false, error }`; native failures never reject.
     */
    @PluginMethod
    public void request(PluginCall call) {
        final String operation = call.getString("operation");
        final JSONObject params;
        try {
            JSObject source = call.getObject("params");
            params = source == null ? new JSONObject() : new JSONObject(source.toString());
        } catch (JSONException error) {
            call.resolve(failure("invalid-response", "Invalid Qishui parameters"));
            return;
        }
        final ExecutorService worker = executor;
        final QishuiOperations target = operations;
        if (worker == null || target == null) {
            call.resolve(failure("unavailable", "Qishui is not available on this build"));
            return;
        }
        try {
            worker.execute(() -> {
                JSONObject result = target.request(operation, params);
                call.resolve(toJSObject(result));
            });
        } catch (RejectedExecutionException error) {
            call.resolve(failure("unavailable", "Qishui is not available on this build"));
        }
    }

    private static JSObject toJSObject(JSONObject value) {
        try {
            return new JSObject(value.toString());
        } catch (JSONException error) {
            JSObject fallback = new JSObject();
            fallback.put("ok", false);
            JSObject failure = new JSObject();
            failure.put("code", "invalid-response");
            failure.put("message", "Qishui operation failed");
            fallback.put("error", failure);
            return fallback;
        }
    }

    private static JSObject failure(String code, String message) {
        JSObject error = new JSObject();
        error.put("code", code);
        error.put("message", message);
        JSObject result = new JSObject();
        result.put("ok", false);
        result.put("error", error);
        return result;
    }
}
