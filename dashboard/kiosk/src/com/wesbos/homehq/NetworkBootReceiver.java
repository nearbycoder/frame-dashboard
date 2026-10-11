package com.wesbos.homehq;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NetworkBootReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())
        && context.getSharedPreferences("network", Context.MODE_PRIVATE).getBoolean("tailscale", false)) {
      context.startService(new Intent(context, TailnetService.class));
    }
  }
}
