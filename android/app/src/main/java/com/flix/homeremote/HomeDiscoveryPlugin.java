package com.flix.homeremote;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "HomeDiscovery")
public class HomeDiscoveryPlugin extends Plugin {
    // Legacy plugin name retained for installed account vault compatibility. No discovery or hub.
    private SecretKey sessionKey() throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        String alias = "flix-home-remote-account";
        if (!keys.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()); generator.generateKey();
        }
        return (SecretKey) keys.getKey(alias, null);
    }
    @PluginMethod public void saveSession(PluginCall call) {
        try {
            String value = call.getString("value", ""); if (value.length() > 16384) { call.reject("جلسة غير صالحة"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, sessionKey());
            String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
            getContext().getSharedPreferences("account-vault", Context.MODE_PRIVATE).edit().putString("tv-secrets".equals(call.getString("key")) ? "tv-secrets" : "session", encoded).commit(); call.resolve();
        } catch (Exception error) { call.reject("تعذر حفظ الجلسة الآمن"); }
    }
    @PluginMethod public void readSession(PluginCall call) {
        try {
            String value = getContext().getSharedPreferences("account-vault", Context.MODE_PRIVATE).getString("tv-secrets".equals(call.getString("key")) ? "tv-secrets" : "session", ""); JSObject result = new JSObject();
            if (!value.isEmpty()) { String[] parts = value.split(":"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, sessionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))); result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8)); }
            call.resolve(result);
        } catch (Exception error) { call.reject("تعذرت قراءة الجلسة؛ سجّل الدخول مجددًا"); }
    }
    @PluginMethod public void clearSession(PluginCall call) { getContext().getSharedPreferences("account-vault", Context.MODE_PRIVATE).edit().remove("tv-secrets".equals(call.getString("key")) ? "tv-secrets" : "session").commit(); call.resolve(); }

}
