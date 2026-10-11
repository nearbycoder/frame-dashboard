package com.wesbos.homehq;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import java.io.InputStream;

/** Optional rooted-frame network service. Binaries and login state stay outside the APK. */
public class TailnetService extends Service {
  private volatile boolean stopped;
  private Thread worker;
  private Process daemon;

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (!getSharedPreferences("network", MODE_PRIVATE).getBoolean("tailscale", false)) {
      stopSelf(); return START_NOT_STICKY;
    }
    startForeground(4173, new Notification.Builder(this)
        .setSmallIcon(R.mipmap.ic_launcher).setContentTitle("Frame network")
        .setContentText("Tailscale connection service").setOngoing(true).build());
    if (worker == null) {
      worker = new Thread(new Runnable() { @Override public void run() { runDaemon(); } }, "FrameTailnet");
      worker.start();
    }
    return START_STICKY;
  }

  private void runDaemon() {
    // Android 6 routes ordinary apps with netd marks. Tailscale's underlay mark
    // needs its own Wi-Fi route before Tailscale's Linux unreachable rule.
    String command = "test -x /data/local/tailscale/tailscaled || exit 65; "
        + "mkdir -p /dev/net; test -e /dev/net/tun || ln -s /dev/tun /dev/net/tun; "
        + "ip rule show | grep -q '5205:.*fwmark 0x80000/0xff0000.*lookup wlan0' "
        + "|| ip rule add priority 5205 fwmark 0x80000/0xff0000 lookup wlan0; "
        + "export HOME=/data/local/tailscale XDG_CACHE_HOME=/data/local/tailscale/cache; "
        + "exec /data/local/tailscale/tailscaled "
        + "--state=/data/local/tailscale/tailscaled.state "
        + "--socket=/data/local/tailscale/tailscaled.sock --tun=tailscale0";
    while (!stopped) {
      try {
        daemon = new ProcessBuilder("/system/xbin/su", "-c", command).redirectErrorStream(true).start();
        InputStream output = daemon.getInputStream();
        byte[] discard = new byte[512];
        while (output.read(discard) != -1) { /* Never log login state or credentials. */ }
        int code = daemon.waitFor();
        if (code == 65) { stopSelf(); return; }
      } catch (Exception ignored) { /* Retry if Wi-Fi or root is temporarily unavailable. */ }
      if (!stopped) try { Thread.sleep(10000); } catch (InterruptedException ignored) { }
    }
  }

  @Override public void onDestroy() {
    stopped = true;
    if (daemon != null) daemon.destroy();
    if (worker != null) worker.interrupt();
    stopForeground(true);
    super.onDestroy();
  }
  @Override public IBinder onBind(Intent intent) { return null; }
}
