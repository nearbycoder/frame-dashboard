package com.wesbos.homehq;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;

/**
 * Full-screen kiosk WebView for the Home HQ wall tablet.
 * - Immersive mode hides the status + navigation bars (true 1280x800).
 * - Exit: hold two fingers still on the screen for 1.5s to go to the regular launcher.
 * - Remote debugging is OFF unless launched with the debug extra (every app on this device
 *   gets root, so the devtools socket should only exist while actively debugging):
 *     adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true
 * - Launch with a URL: adb shell am start -a android.intent.action.VIEW -d <url> -n com.wesbos.homehq/.MainActivity
 */
public class MainActivity extends Activity {
  static final String TAG = "HomeHQ";
  static final String DEFAULT_URL = "http://127.0.0.1:18773/?lite=1#home";
  static final long EXIT_HOLD_MS = 1500;
  static final float EXIT_SLOP_PX = 60;

  private WebView web;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] exitIds = new int[2];
  private final float[] exitX = new float[2];
  private final float[] exitY = new float[2];
  private boolean exitArmed;
  private boolean loadFailed;
  private int networkRetries;
  private String reconnectUrl;
  private final Runnable reconnectDashboard = new Runnable() {
    @Override public void run() { if (web != null && reconnectUrl != null) web.loadUrl(reconnectUrl); }
  };

  private final Runnable exitToLauncher = new Runnable() {
    @Override
    public void run() {
      exitArmed = false;
      Log.i(TAG, "Two-finger hold: exiting to launcher");
      Intent home = new Intent(Intent.ACTION_MAIN);
      home.addCategory(Intent.CATEGORY_HOME);
      home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(home);
      finish();
    }
  };

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    applyDebugFlag(getIntent());
    configureTailnet(getIntent());
    startService(new Intent(this, FrameRuntimeService.class));
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_FULLSCREEN);

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setMediaPlaybackRequiresUserGesture(true);
    s.setUserAgentString(s.getUserAgentString() + " HomeHQKiosk");
    web.setWebViewClient(new WebViewClient() {
      @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { loadFailed = false; }
      @Override public void onPageFinished(WebView view, String url) { if (!loadFailed) networkRetries = 0; }
      @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) retryNetwork(request.getUrl().toString(), error.getErrorCode());
      }
      @Override public void onReceivedError(WebView view, int code, String description, String url) { retryNetwork(url, code); }
    }); // keep navigation inside the kiosk
    setContentView(web);

    final String launchUrl = dashboardUrl(getIntent());
    if (launchUrl.startsWith("http://127.0.0.1:18773/") || getSharedPreferences("network", MODE_PRIVATE).getBoolean("tailscale", false)) {
      handler.postDelayed(new Runnable() { @Override public void run() { web.loadUrl(launchUrl); } }, 3000);
    } else web.loadUrl(launchUrl);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handler.removeCallbacks(reconnectDashboard);
    networkRetries = 0;
    applyDebugFlag(intent);
    configureTailnet(intent);
    startService(new Intent(this, FrameRuntimeService.class));
    String url = intent.getDataString();
    if (url != null) web.loadUrl(dashboardUrl(intent));
  }

  /** Remember the dashboard's LAN URL so normal launches do not need USB reverse. */
  private String dashboardUrl(Intent intent) {
    String url = intent == null ? null : intent.getDataString();
    if (url != null) {
      Uri parsed = Uri.parse(url);
      if (("http".equals(parsed.getScheme()) || "https".equals(parsed.getScheme()))
          && parsed.getHost() != null) {
        getPreferences(MODE_PRIVATE).edit().putString("dashboard_url", url).apply();
        return url;
      }
    }
    return getPreferences(MODE_PRIVATE).getString("dashboard_url", DEFAULT_URL);
  }

  private void configureTailnet(Intent intent) {
    if (intent != null && intent.hasExtra("tailscale")) {
      getSharedPreferences("network", MODE_PRIVATE).edit()
          .putBoolean("tailscale", intent.getBooleanExtra("tailscale", false)).apply();
    }
    if (getSharedPreferences("network", MODE_PRIVATE).getBoolean("tailscale", false)) {
      startService(new Intent(this, TailnetService.class));
    } else if (intent != null && intent.hasExtra("tailscale")) {
      stopService(new Intent(this, TailnetService.class));
    }
  }

  private void retryNetwork(String url, int code) {
    loadFailed = true;
    if ((url.startsWith("http://127.0.0.1:18773/") || getSharedPreferences("network", MODE_PRIVATE).getBoolean("tailscale", false))
        && networkRetries < 8 && (code == WebViewClient.ERROR_CONNECT
            || code == WebViewClient.ERROR_HOST_LOOKUP || code == WebViewClient.ERROR_TIMEOUT)) {
      reconnectUrl = url;
      networkRetries++;
      handler.removeCallbacks(reconnectDashboard);
      handler.postDelayed(reconnectDashboard, 3000);
    }
  }

  @Override
  protected void onPause() {
    web.onPause();
    web.pauseTimers();
    super.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    web.onResume();
    web.resumeTimers();
  }

  @Override
  protected void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    web.destroy();
    super.onDestroy();
  }

  /** Remote debugging only when explicitly requested; any normal launch turns it back off. */
  private void applyDebugFlag(Intent intent) {
    boolean debug = intent != null && intent.getBooleanExtra("debug", false);
    WebView.setWebContentsDebuggingEnabled(debug);
    Log.i(TAG, "WebView remote debugging " + (debug ? "ON" : "off"));
  }

  /** Watches for the two-finger exit hold; all touches still go to the page. */
  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_POINTER_DOWN:
        if (e.getPointerCount() == 2) {
          for (int i = 0; i < 2; i++) {
            exitIds[i] = e.getPointerId(i);
            exitX[i] = e.getX(i);
            exitY[i] = e.getY(i);
          }
          exitArmed = true;
          handler.removeCallbacks(exitToLauncher);
          handler.postDelayed(exitToLauncher, EXIT_HOLD_MS);
        } else {
          cancelExit(); // 3+ fingers
        }
        break;
      case MotionEvent.ACTION_MOVE:
        if (exitArmed) {
          for (int i = 0; i < 2; i++) {
            int idx = e.findPointerIndex(exitIds[i]);
            if (idx < 0 || Math.hypot(e.getX(idx) - exitX[i], e.getY(idx) - exitY[i]) > EXIT_SLOP_PX) {
              cancelExit();
              break;
            }
          }
        }
        break;
      case MotionEvent.ACTION_POINTER_UP:
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        cancelExit();
        break;
      default:
        break;
    }
    return super.dispatchTouchEvent(e);
  }

  private void cancelExit() {
    if (!exitArmed) return;
    exitArmed = false;
    handler.removeCallbacks(exitToLauncher);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUi();
  }

  private void hideSystemUi() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
  }
}
