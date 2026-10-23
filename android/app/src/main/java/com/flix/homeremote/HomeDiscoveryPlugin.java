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
import android.app.Activity;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;

@CapacitorPlugin(name = "HomeDiscovery")
public class HomeDiscoveryPlugin extends Plugin {
    @PluginMethod public void recognizeSpeech(PluginCall call) {
        Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ar-SA");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT,"قل أمر التلفزيون");
        try { startActivityForResult(call,intent,"speechResult"); } catch(Exception error) { call.reject("الإملاء الصوتي غير متاح؛ اكتب الأمر"); }
    }
    @ActivityCallback private void speechResult(PluginCall call,ActivityResult result) {
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null){call.reject("أُلغي الإملاء الصوتي");return;}
        java.util.ArrayList<String> rows=result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        JSObject response=new JSObject();response.put("text",rows==null||rows.isEmpty()?"":rows.get(0));call.resolve(response);
    }
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
    private String vaultEntry(PluginCall call) {
        String key = call.getString("key", "");
        if ("tv-secrets".equals(key)) return "tv-secrets";
        if ("phone-adb-identity".equals(key)) return "phone-adb-identity";
        return "session";
    }
    @PluginMethod public void saveSession(PluginCall call) {
        try {
            String value = call.getString("value", ""); if (value.length() > 16384) { call.reject("جلسة غير صالحة"); return; }
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, sessionKey());
            String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
            getContext().getSharedPreferences("account-vault", Context.MODE_PRIVATE).edit().putString(vaultEntry(call), encoded).commit(); call.resolve();
        } catch (Exception error) { call.reject("تعذر حفظ الجلسة الآمن"); }
    }
    @PluginMethod public void readSession(PluginCall call) {
        try {
            String value = getContext().getSharedPreferences("account-vault", Context.MODE_PRIVATE).getString(vaultEntry(call), ""); JSObject result = new JSObject();
            if (!value.isEmpty()) { String[] parts = value.split(":"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, sessionKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))); result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8)); }
            call.resolve(result);
        } catch (Exception error) { call.reject("تعذرت قراءة الجلسة؛ سجّل الدخول مجددًا"); }
    }
    @PluginMethod public void clearSession(PluginCall call) { getContext().getSharedPreferences("account-vault", Context.MODE_PRIVATE).edit().remove(vaultEntry(call)).commit(); call.resolve(); }

}
