package top.izuna.foliamajor;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int NOTIFICATION_PERMISSION_REQUEST = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 整个应用沉浸：从屏幕边缘滑出的状态栏、导航条只临时浮出来，过几秒自己收回；
        // 默认行为是滑一下就一直留着，沉浸效果也就没了。
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        fitContentToVisibleBars();
        hideSystemBars();
        // 通知栏、锁屏、灵动岛上的播放控制都是一条媒体通知；Android 13 起要用户同意才能显示。
        // 只在第一次问；拒绝之后音乐照常播放，只是系统面板上没有控制。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    // 切到后台再回来、关掉系统弹窗之后，部分系统（MIUI）会把系统栏放回来，拿回焦点时再收一次。
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** 收起状态栏和导航条，整个应用铺满屏幕。 */
    private void hideSystemBars() {
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .hide(WindowInsetsCompat.Type.systemBars());
    }

    /**
     * 页面避开看得见的系统栏，收起时铺满整个屏幕（连镜头挖孔那一条也画）。
     * Capacitor 自带的处理（capacitor.config 里 SystemBars.insetsHandling 已关掉）始终按挖孔高度留边，
     * 播放页收起状态栏后顶上会剩一条空白。
     */
    private void fitContentToVisibleBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, insets) -> {
            // 收起的系统栏在这里是 0；挖孔只在状态栏显示时才避开。
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets cutout = insets.isVisible(WindowInsetsCompat.Type.statusBars())
                ? insets.getInsets(WindowInsetsCompat.Type.displayCutout())
                : Insets.NONE;
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(
                Math.max(bars.left, cutout.left),
                Math.max(bars.top, cutout.top),
                Math.max(bars.right, cutout.right),
                Math.max(Math.max(bars.bottom, cutout.bottom), keyboard.bottom)
            );
            // 子视图（WebView）不再收到这些边距，页面里的 env(safe-area-inset-*) 为 0，不会重复留边。
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
