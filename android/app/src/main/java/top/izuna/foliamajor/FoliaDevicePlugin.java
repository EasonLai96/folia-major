package top.izuna.foliamajor;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import androidx.core.content.ContextCompat;
import com.getcapacitor.annotation.CapacitorPlugin;

// 耳机拔出自动暂停、屏幕常亮的设备侧行为；JS 侧通过插件名 FoliaDevice 调用。
@CapacitorPlugin(name = "FoliaDevice")
public class FoliaDevicePlugin extends Plugin {

    private static final String EVENT_PAUSE_REQUESTED = "pauseRequested";
    private static final String REASON_HEADPHONES_DISCONNECTED = "headphones-disconnected";

    private volatile boolean playing = false;
    private volatile boolean requestedKeepScreenOn = false;
    private boolean foreground = true;
    private BroadcastReceiver noisyReceiver;

    // 注册耳机拔出广播；Android 13 起动态广播必须声明是否导出。
    // ACTION_AUDIO_BECOMING_NOISY 是系统广播，NOT_EXPORTED 不影响收到它，
    // ContextCompat.registerReceiver 内部只在 API 33+ 应用该标志，其余版本自动忽略。
    @Override
    public void load() {
        noisyReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) return;
                // 只请求暂停、不自动恢复：是否停歌由 WebView 里的播放逻辑决定。
                if (!playing) return;
                JSObject data = new JSObject();
                data.put("reason", REASON_HEADPHONES_DISCONNECTED);
                notifyListeners(EVENT_PAUSE_REQUESTED, data);
            }
        };
        ContextCompat.registerReceiver(
            getContext(),
            noisyReceiver,
            new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    /** 播放器把当前播放状态同步进来，决定拔出耳机时是否请求暂停。 */
    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        playing = call.getBoolean("playing", false);
        call.resolve();
    }

    /** 屏幕常亮开关；实际窗口标志在 onResume / onPause 里按活动状态重新套用。 */
    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        requestedKeepScreenOn = call.getBoolean("enabled", false);
        setWindowKeepScreenOn(requestedKeepScreenOn);
        call.resolve();
    }

    // 前台时不需要常亮窗口标志了，清掉；离开时请求的开关原样记着。
    @Override
    protected void handleOnPause() {
        foreground = false;
        setWindowKeepScreenOn(false);
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
        setWindowKeepScreenOn(requestedKeepScreenOn);
    }

    // 广播接收器随活动一起销毁，注销后置空避免二次注销。
    @Override
    protected void handleOnDestroy() {
        foreground = false;
        playing = false;
        requestedKeepScreenOn = false;
        setWindowKeepScreenOn(false);
        if (noisyReceiver != null) {
            try {
                getContext().unregisterReceiver(noisyReceiver);
            } catch (IllegalArgumentException e) {
                // 没注册上时就已销毁，无需处理
            }
            noisyReceiver = null;
        }
    }

    // 窗口标志只能在 UI 线程操作；插件调用在主线程，广播也在主线程派发，runOnUiThread 只在拿不到
    // 焦点窗口的场景兜底。
    private void setWindowKeepScreenOn(boolean keepOn) {
        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            // A delayed JS call must not turn the screen policy back on after onPause.
            if (keepOn && foreground && requestedKeepScreenOn) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }
}
