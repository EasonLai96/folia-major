package top.izuna.foliamajor;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.RandomAccessFile;
import static org.junit.Assert.*;

// Exercises real Android Keystore and cookie erasure only in the dedicated authstoragetest package.
@RunWith(AndroidJUnit4.class)
public class YtmSessionStoreInstrumentedTest {
    private Context context() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("top.izuna.foliamajor.authstoragetest", context.getPackageName());
        return context;
    }

    @After
    public void cleanFixture() {
        YtmSessionStore.clear(context());
    }

    @Test
    public void encryptedRoundTripAndErase() {
        Context context = context();
        assertTrue(YtmSessionStore.write(context, "SAPISID=fixture-only", "Folia-test-agent"));
        YtmSessionStore.YtmSession restored = YtmSessionStore.read(context);
        assertNotNull(restored);
        assertEquals("SAPISID=fixture-only", restored.cookie);
        assertEquals("Folia-test-agent", restored.userAgent);
        assertTrue(YtmSessionStore.clear(context));
        assertNull(YtmSessionStore.read(context));
    }

    @Test
    public void injectedHeadersAreNotPersisted() {
        assertFalse(YtmSessionStore.write(context(), "SAPISID=x\r\nHeader: injected", "UA"));
        assertFalse(YtmSessionStore.write(context(), "SAPISID=x", "UA\nInjected"));
    }

    @Test
    public void erasesRootDomainAndSecureCookiesButNotOtherProviders() throws Exception {
        context(); // Never run cookie fixtures in a real signed-in preview.
        java.util.concurrent.CountDownLatch seeded = new java.util.concurrent.CountDownLatch(3);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            android.webkit.CookieManager manager = android.webkit.CookieManager.getInstance();
            manager.setCookie("https://google.com/", "__Secure-1PAPISID=fixture-google; Secure; HttpOnly; Path=/; Domain=.google.com", ok -> seeded.countDown());
            manager.setCookie("https://youtube.com/", "__Secure-3PAPISID=fixture-youtube; Secure; HttpOnly; Path=/; Domain=.youtube.com", ok -> seeded.countDown());
            manager.setCookie("https://music.douyin.com/", "folia_fixture=keep; Secure; Path=/", ok -> seeded.countDown());
        });
        assertTrue(seeded.await(10, java.util.concurrent.TimeUnit.SECONDS));
        assertTrue(android.webkit.CookieManager.getInstance().getCookie("https://google.com/").contains("fixture-google"));
        java.util.concurrent.CountDownLatch cleared = new java.util.concurrent.CountDownLatch(1);
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> YtmSignInActivity.eraseYouTubeCookies(cleared::countDown));
        assertTrue(cleared.await(10, java.util.concurrent.TimeUnit.SECONDS));
        String google = android.webkit.CookieManager.getInstance().getCookie("https://google.com/");
        String youtube = android.webkit.CookieManager.getInstance().getCookie("https://youtube.com/");
        assertTrue(google == null || !google.contains("fixture-google"));
        assertTrue(youtube == null || !youtube.contains("fixture-youtube"));
        assertTrue(android.webkit.CookieManager.getInstance().getCookie("https://music.douyin.com/").contains("folia_fixture=keep"));
    }

    @Test
    public void tamperedCiphertextIsRejected() throws Exception {
        Context context = context();
        assertTrue(YtmSessionStore.write(context, "SAPISID=fixture-only", "Folia-test-agent"));
        File file = new File(context.getNoBackupFilesDir(), "folia_ytm_session.bin");
        try (RandomAccessFile data = new RandomAccessFile(file, "rw")) {
            long last = data.length() - 1;
            data.seek(last);
            int value = data.read();
            data.seek(last);
            data.write(value ^ 1);
        }
        assertNull(YtmSessionStore.read(context));
        assertFalse(file.exists());
    }
}
