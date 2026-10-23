package top.izuna.foliamajor;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Log;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

// Native-only encrypted storage; each provider has a distinct Keystore key and no-backup file.
public final class NativeSessionStore {
    private static final int LIMIT = 128 * 1024;
    private final AtomicFile file;
    private final String alias;

    public NativeSessionStore(Context context, String name) {
        if (!name.matches("folia_[a-z_]+_session")) throw new IllegalArgumentException("Invalid session store");
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), name + ".bin"));
        alias = name;
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        KeyStore.Entry entry = store.getEntry(alias, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        if (!create) throw new IllegalStateException("Session key is missing");
        KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    public synchronized JSONObject read() {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return null;
        try (FileInputStream input = file.openRead()) {
            long length = input.getChannel().size();
            if (length < 29 || length > LIMIT) throw new IllegalStateException("Invalid session size");
            byte[] bytes = new byte[(int) length];
            int offset = 0;
            while (offset < bytes.length) {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count < 0) throw new IllegalStateException("Truncated session");
                offset += count;
            }
            if (bytes[0] != 1) throw new IllegalStateException("Unsupported session version");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, bytes, 1, 12));
            return new JSONObject(new String(cipher.doFinal(bytes, 13, bytes.length - 13), StandardCharsets.UTF_8));
        } catch (Exception error) {
            Log.w("FoliaSession", "An unreadable encrypted session was discarded");
            clear();
            return null;
        }
    }

    public synchronized boolean write(JSONObject value) {
        FileOutputStream output = null;
        try {
            byte[] plain = value.toString().getBytes(StandardCharsets.UTF_8);
            if (plain.length > LIMIT - 29) return false;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            byte[] iv = cipher.getIV();
            if (iv.length != 12) return false;
            byte[] encrypted = cipher.doFinal(plain);
            output = file.startWrite();
            output.write(1);
            output.write(iv);
            output.write(encrypted);
            file.finishWrite(output);
            return true;
        } catch (Exception error) {
            if (output != null) file.failWrite(output);
            Log.w("FoliaSession", "An encrypted session could not be saved");
            return false;
        }
    }

    // Delete both ciphertext and key: even a file deletion failure must not leave restorable credentials.
    public synchronized boolean clear() {
        boolean keyGone = false;
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            store.deleteEntry(alias);
            keyGone = !store.containsAlias(alias);
        } catch (Exception error) {
            Log.w("FoliaSession", "A session key could not be erased");
        }
        file.delete();
        return keyGone && !file.getBaseFile().exists();
    }
}
