package com.wesbos.homehq;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NetworkBootReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
      context.startService(new Intent(context, FrameRuntimeService.class));
      if (context.getSharedPreferences("network", Context.MODE_PRIVATE).getBoolean("tailscale", false)) {
        context.startService(new Intent(context, TailnetService.class));
      }
      Intent dashboard = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      if (dashboard != null) {
        dashboard.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(dashboard);
      }
    }
  }
}
