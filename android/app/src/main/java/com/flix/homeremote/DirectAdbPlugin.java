package com.flix.homeremote;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.Base64;
import java.io.*;
import java.security.*;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.*;
import java.math.BigInteger;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.*;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import io.github.muntashirakon.adb.*;

/** Android 11+ pairing/TLS runs on the phone. The pairing code is never persisted. */
@CapacitorPlugin(name="DirectAdb")
public class DirectAdbPlugin extends Plugin {
 private final ExecutorService work=Executors.newCachedThreadPool();
 private final ScheduledExecutorService timeouts=Executors.newSingleThreadScheduledExecutor();
 private final Set<AdbConnection> live=ConcurrentHashMap.newKeySet();
 private record Identity(PrivateKey privateKey,java.security.cert.Certificate certificate) {}
 private Identity identity(PluginCall call) throws Exception {
  byte[] raw=Base64.decode(call.getString("key",""),Base64.DEFAULT);
  RSAPrivateCrtKey privateKey=(RSAPrivateCrtKey)KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(raw));
  PublicKey pub=KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(privateKey.getModulus(),privateKey.getPublicExponent()));
  X500Name name=new X500Name("CN=FLIX Home Remote");Date start=new Date(System.currentTimeMillis()-86400000L),end=new Date(System.currentTimeMillis()+315360000000L);
  var cert=new JcaX509v3CertificateBuilder(name,BigInteger.ONE,start,end,name,pub).build(new JcaContentSignerBuilder("SHA256withRSA").build(privateKey));
  return new Identity(privateKey,new JcaX509CertificateConverter().getCertificate(cert));
 }
 private String host(PluginCall call) throws Exception {String host=call.getString("host","");int port=call.getInt("port",0);if(!DirectLanPlugin.local(host)||port<1024||port>65535)throw new Exception("Invalid TV endpoint");return host;}
 @PluginMethod public void pair(PluginCall call){work.execute(()->{try{
  String host=host(call),code=call.getString("code","");if(!code.matches("[0-9]{6}"))throw new Exception("Enter six digit TV code");
  Identity pair=identity(call);
  try(PairingConnectionCtx pairing=new PairingConnectionCtx(host,call.getInt("port",0),code.getBytes(StandardCharsets.UTF_8),pair.privateKey(),pair.certificate(),"FLIX@phone")){
   ScheduledFuture<?> timer=timeouts.schedule(()->{try{pairing.close();}catch(Exception ignored){}},40,TimeUnit.SECONDS);
   try{pairing.start();call.resolve();}finally{timer.cancel(false);}
  }
 }catch(Exception e){call.reject("TV pairing failed: verify the current code, pairing port and Wi-Fi");}});}
 private AdbConnection connect(PluginCall call) throws Exception {
  String host=host(call);Identity pair=identity(call);
  AdbConnection adb=new AdbConnection.Builder(host,call.getInt("port",5555)).setApi(30).setPrivateKey(pair.privateKey()).setCertificate(pair.certificate()).setDeviceName("FLIX@phone").build();
  live.add(adb);try{if(!adb.connect(20,TimeUnit.SECONDS,true))throw new IOException("TV authorization required");return adb;}catch(Exception e){live.remove(adb);adb.close();throw e;}
 }
 private byte[] drain(AdbStream stream,int limit) throws Exception {ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=stream.read(b,0,b.length))!=-1){if(out.size()+n>limit)throw new IOException("TV response too large");out.write(b,0,n);}return out.toByteArray();}
 @PluginMethod public void shell(PluginCall call){work.execute(()->{AdbConnection adb=null;ScheduledFuture<?> timer=null;try{
  String command=call.getString("command","");if(command.length()>8192||command.indexOf('\0')>=0)throw new Exception("Invalid command");adb=connect(call);final AdbConnection active=adb;timer=timeouts.schedule(()->{try{active.close();}catch(Exception ignored){}},30,TimeUnit.SECONDS);
  try(AdbStream stream=adb.open("shell:"+command)){String output=new String(drain(stream,1048576),StandardCharsets.UTF_8);call.resolve(new JSObject().put("output",output));}
 }catch(Exception e){call.reject("ADB TLS: "+e.getMessage());}finally{if(timer!=null)timer.cancel(false);if(adb!=null){live.remove(adb);try{adb.close();}catch(Exception ignored){}}}});}
 private void sync(AdbStream stream,String id,int value,byte[] data) throws Exception {ByteBuffer header=ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);header.put(id.getBytes(StandardCharsets.US_ASCII)).putInt(value);stream.write(header.array(),0,8);if(data!=null)stream.write(data,0,data.length);}
 @PluginMethod public void install(PluginCall call){work.execute(()->{AdbConnection adb=null;ScheduledFuture<?> timer=null;String remote="";try{
  String id=call.getString("id","");if(!id.matches("[a-f0-9-]{36}"))throw new Exception("Invalid package");File file=new File(new java.net.URI(call.getString("uri","")));File expected=new File(getContext().getFilesDir(),"packages/"+id);if(!file.getCanonicalFile().equals(expected.getCanonicalFile())||file.length()<4||file.length()>67108864)throw new Exception("Invalid private package path");
  MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=new FileInputStream(file)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}StringBuilder encoded=new StringBuilder();for(byte b:digest.digest())encoded.append(String.format(java.util.Locale.ROOT,"%02x",b));String hash=encoded.toString();if(!hash.equals(call.getString("sha256","")))throw new Exception("Package hash changed");
  adb=connect(call);final AdbConnection active=adb;timer=timeouts.schedule(()->{try{active.close();}catch(Exception ignored){}},180,TimeUnit.SECONDS);remote="/data/local/tmp/flix-"+id+".apk";
  try(AdbStream stream=adb.open("sync:");InputStream input=new FileInputStream(file)){
   byte[] name=(remote+",33188").getBytes(StandardCharsets.UTF_8);sync(stream,"SEND",name.length,name);byte[] b=new byte[65536];int n;while((n=input.read(b))!=-1)sync(stream,"DATA",n,Arrays.copyOf(b,n));sync(stream,"DONE",(int)(System.currentTimeMillis()/1000),null);
   DataInputStream result=new DataInputStream(stream.openInputStream());byte[] header=new byte[8];result.readFully(header);if(!new String(header,0,4,StandardCharsets.US_ASCII).equals("OKAY"))throw new IOException("TV rejected APK transfer");sync(stream,"QUIT",0,null);
  }
  try(AdbStream shell=adb.open("shell:pm install -r "+remote)){String output=new String(drain(shell,131072),StandardCharsets.UTF_8);if(!java.util.regex.Pattern.compile("(?m)^Success\\r?$").matcher(output).find())throw new Exception(output);call.resolve(new JSObject().put("output",output));}
 }catch(Exception e){call.reject("APK installation: "+e.getMessage());}finally{if(timer!=null)timer.cancel(false);if(adb!=null){try{if(!remote.isEmpty()){try(AdbStream clean=adb.open("shell:rm -f "+remote)){drain(clean,4096);}}}catch(Exception ignored){}live.remove(adb);try{adb.close();}catch(Exception ignored){}}}});}
 @Override protected void handleOnDestroy(){for(AdbConnection adb:live)try{adb.close();}catch(Exception ignored){}live.clear();work.shutdownNow();timeouts.shutdownNow();}
}
