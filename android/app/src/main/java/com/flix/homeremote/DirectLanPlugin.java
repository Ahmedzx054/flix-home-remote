package com.flix.homeremote;

import android.content.Context;
import android.net.nsd.*;
import android.net.wifi.WifiManager;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import java.security.cert.X509Certificate;
import okhttp3.*;

/** LAN transport lives in the phone. No HTTP bridge, ADB server or desktop process. */
@CapacitorPlugin(name="DirectLan")
public class DirectLanPlugin extends Plugin {
    private final ExecutorService work = Executors.newCachedThreadPool();
    private final Map<String, Channel> channels = new ConcurrentHashMap<>();
    private final Map<String, PluginCall> opening = new ConcurrentHashMap<>();
    private static class Channel {
        Socket tcp; WebSocket ws; volatile String error = ""; volatile boolean closed;
        final java.util.concurrent.atomic.AtomicInteger buffered = new java.util.concurrent.atomic.AtomicInteger();
        final BlockingQueue<String> queue = new LinkedBlockingQueue<>(256);
        void receive(String data) { if(closed)return; int size=data.length(); int total=buffered.addAndGet(size); if(size>1048576 || total>4194304){buffered.addAndGet(-size);error="TV receive buffer exceeded";close();return;} if(!queue.offer(data)){buffered.addAndGet(-size);error="TV receive buffer exceeded";close();} }
        void close() { closed=true; try { if(tcp!=null)tcp.close(); }catch(Exception ignored){} if(ws!=null)ws.cancel(); }
    }
    static boolean local(String host) {
        if(host==null || !host.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+"))return false;
        String[] parts=host.split("\\."); int[] p=new int[4];
        try{for(int i=0;i<4;i++){p[i]=Integer.parseInt(parts[i]);if(p[i]>255 || !String.valueOf(p[i]).equals(parts[i]))return false;}}catch(Exception e){return false;}
        return p[0]==10 || (p[0]==172 && p[1]>=16 && p[1]<=31) || (p[0]==192 && p[1]==168) || (p[0]==169 && p[1]==254);
    }
    private URI localUrl(String value, String scheme) throws Exception {
        URI uri=new URI(value); if(!local(uri.getHost()) || uri.getUserInfo()!=null || uri.getFragment()!=null || !Arrays.asList(scheme.split(",")).contains(uri.getScheme()))throw new Exception("LAN IPv4 TV address required"); return uri;
    }
    // Self-signed TV certificates are accepted only after the literal LAN-IP check.
    private OkHttpClient client(boolean tvTls) throws Exception {
        OkHttpClient.Builder b=new OkHttpClient.Builder().connectTimeout(8,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false);
        if(tvTls){ X509TrustManager trust=new X509TrustManager(){public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}public void checkClientTrusted(X509Certificate[] c,String a){}public void checkServerTrusted(X509Certificate[] c,String a){}}; SSLContext ssl=SSLContext.getInstance("TLS");ssl.init(null,new TrustManager[]{trust},null);b.sslSocketFactory(ssl.getSocketFactory(),trust).hostnameVerifier((h,s)->local(h)); }
        return b.build();
    }
    @PluginMethod public void open(PluginCall call) { work.execute(()->{
        String id=call.getString("id",""); Channel c=new Channel();
        try {
            if(!id.matches("[a-f0-9-]{36}") || channels.size()>=8 || channels.putIfAbsent(id,c)!=null)throw new Exception("Too many TV connections");
            if("tcp".equals(call.getString("kind"))){
                String host=call.getString("host");int port=call.getInt("port",5555); if(!local(host)||port<1024||port>65535)throw new Exception("Invalid TV address");
                c.tcp=new Socket();c.tcp.connect(new InetSocketAddress(host,port),8000);c.tcp.setTcpNoDelay(true);call.resolve();
                work.execute(()->{try{byte[] buffer=new byte[65536];int n;InputStream input=c.tcp.getInputStream();while((n=input.read(buffer))!=-1)c.receive(Base64.encodeToString(Arrays.copyOf(buffer,n),Base64.NO_WRAP));}catch(Exception e){if(!c.closed)c.error="TV TCP disconnected";}finally{c.closed=true;}});
            } else {
                URI uri=localUrl(call.getString("url",""),"ws,wss"); opening.put(id,call);
                c.ws=client("wss".equals(uri.getScheme())).newWebSocket(new Request.Builder().url(uri.toString()).build(),new WebSocketListener(){
                    @Override public void onOpen(WebSocket socket, Response response){PluginCall p=opening.remove(id);if(p!=null)p.resolve();}
                    @Override public void onMessage(WebSocket socket,String text){c.receive(text);}
                    @Override public void onClosing(WebSocket socket,int code,String reason){socket.close(code,reason);c.closed=true;}
                    @Override public void onFailure(WebSocket socket,Throwable e,Response response){c.error="TV WebSocket failed";c.closed=true;PluginCall p=opening.remove(id);if(p!=null){channels.remove(id);p.reject(c.error);}}
                });
            }
        } catch(Exception e){channels.remove(id,c);c.close();call.reject(e.getMessage());}
    }); }
    @PluginMethod public void read(PluginCall call){work.execute(()->{try{Channel c=channels.get(call.getString("id"));if(c==null)throw new Exception("TV channel closed");String data=c.queue.poll(1,TimeUnit.SECONDS);if(data!=null)c.buffered.addAndGet(-data.length());if(data==null&&!c.error.isEmpty())throw new Exception(c.error);JSObject r=new JSObject();if(data!=null)r.put("data",data);r.put("closed",c.closed&&c.queue.isEmpty()&&data==null);call.resolve(r);}catch(Exception e){call.reject(e.getMessage());}});}
    @PluginMethod public void write(PluginCall call){work.execute(()->{try{Channel c=channels.get(call.getString("id"));if(c==null||c.closed)throw new Exception("TV disconnected");String data=call.getString("data","");if(data.length()>400000)throw new Exception("Chunk too large");if(c.tcp!=null){c.tcp.getOutputStream().write(Base64.decode(data,Base64.DEFAULT));c.tcp.getOutputStream().flush();}else if(!c.ws.send(data))throw new Exception("TV send failed");call.resolve();}catch(Exception e){call.reject(e.getMessage());}});}
    @PluginMethod public void close(PluginCall call){String id=call.getString("id","");Channel c=channels.remove(id);if(c!=null)c.close();PluginCall p=opening.remove(id);if(p!=null)p.reject("TV connection cancelled");call.resolve();}
    @PluginMethod public void http(PluginCall call){work.execute(()->{try{
        URI uri=localUrl(call.getString("url",""),"http,https");String method=call.getString("method","GET");if(!method.equals("GET")&&!method.equals("POST"))throw new Exception("Invalid method");
        Request.Builder request=new Request.Builder().url(uri.toString());if(method.equals("POST"))request.post(RequestBody.create(new byte[0],null));
        try(Response response=client("https".equals(uri.getScheme())).newCall(request.build()).execute()){
            if(!response.isSuccessful())throw new Exception("TV HTTP "+response.code());ByteArrayOutputStream out=new ByteArrayOutputStream();InputStream in=response.body().byteStream();byte[] b=new byte[8192];int n;int limit=Math.min(4*1024*1024,call.getInt("limit",131072));while((n=in.read(b))!=-1){if(out.size()+n>limit)throw new Exception("TV response too large");out.write(b,0,n);}JSObject r=new JSObject();r.put("data",Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP));r.put("type",response.header("Content-Type","application/octet-stream"));call.resolve(r);
        }
    }catch(Exception e){call.reject(e.getMessage());}});}
    @PluginMethod public void discover(PluginCall call){work.execute(()->{
        JSArray found=new JSArray();WifiManager.MulticastLock lock=null;List<NsdManager.DiscoveryListener> listeners=new ArrayList<>();
        NsdManager nsd=(NsdManager)getContext().getSystemService(Context.NSD_SERVICE);Object guard=new Object();
        try{
            WifiManager wifi=(WifiManager)getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);if(wifi!=null){lock=wifi.createMulticastLock("direct-tv-discovery");lock.setReferenceCounted(false);lock.acquire();}
            for(String type:new String[]{"_androidtvremote2._tcp.","_googlecast._tcp.","_adb._tcp.","_adb-tls-connect._tcp."}){
                NsdManager.DiscoveryListener listener=new NsdManager.DiscoveryListener(){public void onDiscoveryStarted(String t){}public void onDiscoveryStopped(String t){}public void onStartDiscoveryFailed(String t,int e){}public void onStopDiscoveryFailed(String t,int e){}public void onServiceLost(NsdServiceInfo i){}
                    public void onServiceFound(NsdServiceInfo info){nsd.resolveService(info,new NsdManager.ResolveListener(){public void onResolveFailed(NsdServiceInfo i,int e){}public void onServiceResolved(NsdServiceInfo s){String h=s.getHost().getHostAddress();if(!local(h))return;JSObject d=new JSObject();d.put("host",h);d.put("name",s.getServiceName());d.put("platform","android");d.put("service",type);d.put("port",(type.equals("_adb._tcp.")||type.equals("_adb-tls-connect._tcp."))?s.getPort():5555);synchronized(guard){found.put(d);}}});}
                }; listeners.add(listener);nsd.discoverServices(type,NsdManager.PROTOCOL_DNS_SD,listener);
            }
            try(DatagramSocket udp=new DatagramSocket()){
                udp.setSoTimeout(500);String packet="M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n";byte[] bytes=packet.getBytes(StandardCharsets.UTF_8);udp.send(new DatagramPacket(bytes,bytes.length,InetAddress.getByName("239.255.255.250"),1900));
                long until=System.currentTimeMillis()+4000;while(System.currentTimeMillis()<until){try{byte[] b=new byte[8192];DatagramPacket p=new DatagramPacket(b,b.length);udp.receive(p);String host=p.getAddress().getHostAddress();if(!local(host))continue;String text=new String(p.getData(),0,p.getLength(),StandardCharsets.UTF_8);JSObject d=new JSObject();d.put("host",host);d.put("ssdp",text);synchronized(guard){if(found.length()<100)found.put(d);}}catch(SocketTimeoutException ignored){}}
            }
            synchronized(guard){JSObject r=new JSObject();r.put("devices",found);call.resolve(r);}
        }catch(Exception e){call.reject("تعذر الاكتشاف المباشر. تحقق من Wi-Fi وإذن الشبكة؛ يمكنك إضافة عنوان التلفزيون.");}
        finally{for(NsdManager.DiscoveryListener l:listeners){try{nsd.stopServiceDiscovery(l);}catch(Exception ignored){}}if(lock!=null&&lock.isHeld())lock.release();}
    });}
    @Override protected void handleOnDestroy(){channels.values().forEach(Channel::close);channels.clear();opening.values().forEach(p->p.reject("App closed"));opening.clear();work.shutdownNow();}
}
