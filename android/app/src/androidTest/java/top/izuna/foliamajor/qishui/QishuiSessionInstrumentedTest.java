package top.izuna.foliamajor.qishui;

import android.content.Context;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.security.Signature;
import static org.junit.Assert.*;

// Runs only in a dedicated fixture app; never writes over preview or production account data.
@RunWith(AndroidJUnit4.class)
public class QishuiSessionInstrumentedTest {
    private Context context() {
        Context value = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("top.izuna.foliamajor.authstoragetest", value.getPackageName());
        return value;
    }

    @After public void cleanup() { new QishuiSessionStore(context()).clear(); }

    private QishuiSession fixture() throws Exception {
        QishuiSession value = new QishuiSession();
        value.deviceId = "1234567890123456789";
        value.accessCode = "fixture-access-only";
        value.openId = "fixture-open-id";
        value.ticket = "fixture-ticket-only";
        value.guardKey = QishuiProtocol.createGuard().key;
        value.guardCert = "fixture-cert-only";
        value.guardTsSign = "fixture-sign-only";
        value.expiresAt = System.currentTimeMillis() + 3600000;
        value.userId = "fixture-account";
        value.nickname = "Fixture";
        return value;
    }

    @Test public void encryptedRoundTripAndKeyErase() throws Exception {
        QishuiSessionStore store = new QishuiSessionStore(context());
        QishuiSession source = fixture();
        assertTrue(store.write(source));
        File file = new File(context().getNoBackupFilesDir(), "folia_qishui_session.bin");
        String raw = new String(Files.readAllBytes(file.toPath()), StandardCharsets.ISO_8859_1);
        assertFalse(raw.contains(source.ticket));
        assertFalse(raw.contains(source.accessCode));
        QishuiSession restored = new QishuiSessionStore(context()).read();
        assertNotNull(restored);
        assertEquals(source.userId, restored.userId);
        assertArrayEquals(source.guardKey.getEncoded(), restored.guardKey.getEncoded());
        assertTrue(store.clear());
        assertFalse(file.exists());
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        assertFalse(keys.containsAlias("folia_qishui_session"));
        assertNull(store.read());
    }

    @Test public void coldSessionNeedsValidationAndDeviceIdIsStable() throws Exception {
        QishuiSessions first = new QishuiSessions(context());
        QishuiSession value = fixture();
        value.deviceId = first.deviceId();
        first.set(value);
        QishuiSessions cold = new QishuiSessions(context());
        assertEquals(first.deviceId(), cold.deviceId());
        assertTrue(cold.needsValidation());
        assertEquals(value.userId, cold.get().userId);
        cold.clear();
        assertNull(new QishuiSessions(context()).get());
    }

    @Test public void canonicalSigningAndMediaHosts() throws Exception {
        assertEquals(QishuiProtocol.fullPath("/search/"), QishuiProtocol.fullPath(QishuiProtocol.PREFIX + "/search/"));
        assertTrue(QishuiProtocol.isRetryableRead(QishuiProtocol.PREFIX + "/search/"));
        assertFalse(QishuiProtocol.isRetryableRead(QishuiProtocol.PREFIX + "/media/collect/"));
        assertTrue(QishuiProtocol.isMediaHost("A.B.DOUYINVOD.COM"));
        assertFalse(QishuiProtocol.isMediaHost("evil-douyinvod.com"));
        QishuiSession value = fixture();
        java.security.KeyPairGenerator generator = java.security.KeyPairGenerator.getInstance("EC");
        generator.initialize(new java.security.spec.ECGenParameterSpec("secp256r1"));
        java.security.KeyPair pair = generator.generateKeyPair();
        value.guardKey = pair.getPrivate();
        String encoded = QishuiProtocol.guardHeaders(value, QishuiProtocol.PREFIX + "/search/")
                .get("bd-ticket-guard-client-data");
        JSONObject data = new JSONObject(new String(Base64.decode(encoded, Base64.NO_WRAP), StandardCharsets.UTF_8));
        String message = "ticket=" + value.ticket + "&path=" + QishuiProtocol.PREFIX + "/search/&timestamp=" + data.getLong("timestamp");
        byte[] csrPem = Base64.decode(QishuiProtocol.createGuard().csr, Base64.NO_WRAP);
        assertTrue(new String(csrPem, StandardCharsets.UTF_8).contains("BEGIN CERTIFICATE REQUEST"));
        // An actual native EC signature, not a mocked signing bridge.
        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(pair.getPublic());
        verifier.update(message.getBytes(StandardCharsets.UTF_8));
        assertTrue(verifier.verify(Base64.decode(data.getString("req_sign"), Base64.NO_WRAP)));
        assertFalse(message.contains(QishuiProtocol.PREFIX + QishuiProtocol.PREFIX));
    }

    @Test public void rejectsNonFiniteCredentialExpiry() throws Exception {
        for (Object value : new Object[]{Double.NaN, Double.POSITIVE_INFINITY, "NaN", "Infinity", Double.MAX_VALUE}) {
            try { QishuiProtocol.credentialExpiry(value); fail("Invalid expiry accepted"); }
            catch (QishuiException expected) { assertEquals("invalid-response", expected.code()); }
        }
    }
}
