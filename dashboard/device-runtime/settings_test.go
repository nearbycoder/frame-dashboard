package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDeviceSettingsOfflineAndActionGuard(t *testing.T) {
	called := 0
	fail := false
	s := &deviceSettings{key: "private-ephemeral-control", available: true, launch: func(context.Context) error {
		called++
		if fail {
			return errors.New("private command details")
		}
		return nil
	}}
	r := httptest.NewRequest("GET", "http://127.0.0.1:18773/api/device-settings", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	var data map[string]any
	json.Unmarshal(w.Body.Bytes(), &data)
	if w.Code != 200 || data["wifiSettings"] != true || data["controlKey"] != s.key {
		t.Fatal("offline settings unavailable")
	}
	call := func(method, origin, key, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:18773/api/device-settings/wifi", strings.NewReader(body))
		r.Header.Set("Origin", origin)
		r.Header.Set("X-Device-Control", key)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		return w
	}
	for _, x := range []struct {
		method, origin, key, body string
		code                      int
	}{{"GET", "http://127.0.0.1:18773", s.key, "{}", 405}, {"POST", "https://attacker.test", s.key, "{}", 403}, {"POST", "http://127.0.0.1:18773", "wrong", "{}", 403}, {"POST", "http://127.0.0.1:18773", s.key, `{"command":"reboot"}`, 400}, {"POST", "http://127.0.0.1:18773", s.key, "null", 400}} {
		if call(x.method, x.origin, x.key, x.body).Code != x.code {
			t.Fatal("invalid settings request accepted")
		}
	}
	if called != 0 {
		t.Fatal("invalid request launched a command")
	}
	if call("POST", "http://127.0.0.1:18773", s.key, "{}").Code != 200 || called != 1 {
		t.Fatal("Wi-Fi launch failed")
	}
	fail = true
	w = call("POST", "http://127.0.0.1:18773", s.key, "{}")
	if w.Code != 503 || strings.Contains(w.Body.String(), "private command") {
		t.Fatal("command error exposed")
	}
	s.available = false
	if call("POST", "http://127.0.0.1:18773", s.key, "{}").Code != 503 || called != 2 {
		t.Fatal("desktop attempted network mutation")
	}
}
func TestDNSFollowsNetworkChanges(t *testing.T) {
	clock := time.Now()
	current := "192.0.2.1"
	calls := 0
	get := cachedDNS("1.1.1.1", func() string { calls++; return current }, func() time.Time { return clock })
	if get() != current {
		t.Fatal("Android resolver not used")
	}
	current = "192.0.2.2"
	if get() == current || calls != 1 {
		t.Fatal("DNS cache not bounded")
	}
	clock = clock.Add(6 * time.Second)
	if get() != current {
		t.Fatal("new network resolver ignored")
	}
	current = "invalid; shell"
	clock = clock.Add(6 * time.Second)
	if get() != "1.1.1.1" {
		t.Fatal("invalid DNS accepted")
	}
}
