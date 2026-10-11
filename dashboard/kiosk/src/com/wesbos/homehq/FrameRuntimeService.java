package com.wesbos.homehq;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.os.IBinder;
import java.io.InputStream;
import java.net.InetAddress;

/** Keeps the on-device cache/API running. No credentials are in the APK or WebView. */
public class FrameRuntimeService extends Service {
  private volatile boolean stopped;
  private Thread worker;
  private Process runtime;

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    startForeground(18773, new Notification.Builder(this)
        .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("Frame dashboard")
        .setContentText("Local dashboard and GitHub updates").setOngoing(true).build());
    if (worker == null) {
      worker = new Thread(new Runnable() { @Override public void run() { runRuntime(); } }, "FrameRuntime");
      worker.start();
    }
    return START_STICKY;
  }

  private String wifiDns() {
    try {
      ConnectivityManager manager = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
      LinkProperties properties = manager.getLinkProperties(manager.getActiveNetwork());
      if (properties != null) for (InetAddress address : properties.getDnsServers()) {
        if (address.getAddress().length == 4) return address.getHostAddress();
      }
    } catch (Exception ignored) { }
    return null;
  }

  private void runRuntime() {
    while (!stopped) {
      String dns = wifiDns();
      // InetAddress supplied by Android, never user-entered shell text.
      if (dns == null) dns = "1.1.1.1"; // Cached dashboard still starts without Wi-Fi.
      String command = "test -x /data/local/frame-dashboard/frame-runtime || exit 65; "
          + "runtime_pid=$(cat /data/local/frame-dashboard/runtime.pid 2>/dev/null); "
          + "if test -n \"$runtime_pid\" && grep -q '/data/local/frame-dashboard/frame-runtime' /proc/\"$runtime_pid\"/cmdline 2>/dev/null; then "
          + "while kill -0 \"$runtime_pid\" 2>/dev/null; do sleep 5; done; fi; "
          + "exec /data/local/frame-dashboard/frame-runtime --state=/data/local/frame-dashboard --dns=" + dns;
      try {
        runtime = new ProcessBuilder("/system/xbin/su", "-c", command).redirectErrorStream(true).start();
        InputStream output = runtime.getInputStream();
        byte[] discard = new byte[512];
        while (output.read(discard) != -1) { /* Do not log state or credential material. */ }
        if (runtime.waitFor() == 65) { stopSelf(); return; }
      } catch (Exception ignored) { }
      if (!stopped) try { Thread.sleep(5000); } catch (InterruptedException ignored) { }
    }
  }
  @Override public void onDestroy() {
    stopped = true;
    if (runtime != null) runtime.destroy();
    if (worker != null) worker.interrupt();
    stopForeground(true);
    super.onDestroy();
  }
  @Override public IBinder onBind(Intent intent) { return null; }
}
