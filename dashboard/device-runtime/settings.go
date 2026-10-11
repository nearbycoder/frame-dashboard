package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

// A single fixed Android action; no shell, package, intent or Wi-Fi password
// supplied by the page. Android owns network selection and credential storage.
func openWifiSettings(ctx context.Context) error {
	output, err := exec.CommandContext(ctx, "/system/bin/am", "start", "--user", "0", "-a", "android.settings.WIFI_SETTINGS",
		"--ez", "extra_prefs_show_button_bar", "true",
		"--es", "extra_prefs_set_next_text", "Return to dashboard",
		"--es", "extra_prefs_set_back_text", "",
		"--ez", "wifi_enable_next_on_connect", "false").CombinedOutput()
	if err != nil || strings.Contains(string(output), "Error") || strings.Contains(string(output), "Exception") {
		return errors.New("Wi-Fi settings could not be opened.")
	}
	return nil
}

type deviceSettings struct {
	key       string
	available bool
	launch    func(context.Context) error
}

func newDeviceSettings(key string) *deviceSettings {
	_, err := os.Stat("/system/bin/am")
	return &deviceSettings{key: key, available: err == nil, launch: openWifiSettings}
}
func (s *deviceSettings) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/device-settings" && r.Method == "GET" {
		sendJSON(w, 200, map[string]any{"wifiSettings": s.available, "controlKey": s.key})
		return
	}
	if r.URL.Path != "/api/device-settings/wifi" {
		sendJSON(w, 404, map[string]string{"error": "Unknown device setting."})
		return
	}
	if r.Method != "POST" {
		w.Header().Set("Allow", "POST")
		sendJSON(w, 405, map[string]string{"error": "Use the Wi-Fi button in Settings."})
		return
	}
	if r.Header.Get("Origin") != "http://"+r.Host || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Device-Control")), []byte(s.key)) != 1 {
		sendJSON(w, 403, map[string]string{"error": "Reopen Settings before choosing a network."})
		return
	}
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		sendJSON(w, 415, map[string]string{"error": "Expected JSON."})
		return
	}
	raw, err := bounded(r.Body, 256)
	var input map[string]any
	if err != nil || json.Unmarshal(raw, &input) != nil || input == nil || len(input) != 0 {
		sendJSON(w, 400, map[string]string{"error": "Invalid settings request."})
		return
	}
	if !s.available {
		sendJSON(w, 503, map[string]string{"error": "Wi-Fi settings are available on the Android frame."})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if err = s.launch(ctx); err != nil {
		sendJSON(w, 503, map[string]string{"error": "Wi-Fi settings could not be opened. Please try again."})
		return
	}
	sendJSON(w, 200, map[string]bool{"opened": true})
}
