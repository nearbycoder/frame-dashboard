package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func fixture(t *testing.T, tag, text string) []byte {
	t.Helper()
	html := []byte(`<html><head><script src="/assets/app-` + text + `.js"></script></head><body>` + text + `</body></html>`)
	files := []bundleFile{}
	for name, data := range map[string][]byte{"index.html": html, "assets/app-" + text + ".js": []byte("console.log('" + text + "')"), "icon-192.png": []byte("icon")} {
		files = append(files, bundleFile{Name: name, SHA256: digest(data), Data: base64.StdEncoding.EncodeToString(data)})
	}
	data, e := json.Marshal(bundle{Schema: 1, Tag: tag, Version: digest(html)[:16], BuiltAt: time.Now().UTC().Format(time.RFC3339), Files: files})
	if e != nil {
		t.Fatal(e)
	}
	return data
}
func TestBundleValidationAndOfflineRestart(t *testing.T) {
	root := t.TempDir()
	initial := fixture(t, "v1.0.0", "one")
	if e := os.WriteFile(filepath.Join(root, "bootstrap.json"), initial, 0600); e != nil {
		t.Fatal(e)
	}
	s, e := newReleases(root, http.DefaultClient)
	if e != nil {
		t.Fatal(e)
	}
	first := s.current()
	for _, kind := range []string{"checksum", "traversal", "missing", "duplicate", "version"} {
		var b bundle
		json.Unmarshal(initial, &b)
		switch kind {
		case "checksum":
			b.Files[0].Data = base64.StdEncoding.EncodeToString([]byte("bad"))
		case "traversal":
			b.Files[0].Name = "../secret"
		case "missing":
			for i, f := range b.Files {
				if strings.HasPrefix(f.Name, "assets/") {
					b.Files[i].Name = "assets/unreferenced.js"
				}
			}
		case "duplicate":
			b.Files = append(b.Files, b.Files[0])
		case "version":
			b.Version = "0000000000000000"
		}
		data, _ := json.Marshal(b)
		if _, e := stage(data, root); e == nil {
			t.Fatalf("accepted %s", kind)
		}
		if s.current().Version != first.Version {
			t.Fatal("changed active release")
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(fixture(t, "v1.0.1", "two")) }))
	s.url = server.URL
	next := s.check()
	if next.Tag != "v1.0.1" || next.UpdateError != "" {
		t.Fatal(next)
	}
	server.Close()
	restarted, e := newReleases(root, http.DefaultClient)
	if e != nil {
		t.Fatal(e)
	}
	restarted.url = server.URL
	offline := restarted.check()
	if offline.Version != next.Version || offline.UpdateError == "" {
		t.Fatal("lost cache after restart/outage")
	}
	if _, e = loadRelease(first.root); e != nil {
		t.Fatal("old release lost")
	}
}
func TestCheckingDoesNotBlockLocalPage(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "bootstrap.json"), fixture(t, "v1.0.0", "one"), 0600)
	s, _ := newReleases(root, http.DefaultClient)
	entered := make(chan struct{})
	finish := make(chan struct{})
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { close(entered); <-finish; w.WriteHeader(503) }))
	defer remote.Close()
	s.url = remote.URL
	done := make(chan struct{})
	go func() { s.check(); close(done) }()
	<-entered
	page := make(chan release, 1)
	go func() { page <- s.current() }()
	select {
	case r := <-page:
		if r.Version == "" {
			t.Fatal("no page")
		}
	case <-time.After(time.Second):
		t.Error("local page blocked by GitHub request")
	}
	close(finish)
	<-done
}
func TestCachedFilesAndHostProtection(t *testing.T) {
	root := t.TempDir()
	initial := fixture(t, "v1.0.0", "one")
	os.WriteFile(filepath.Join(root, "bootstrap.json"), initial, 0600)
	s, _ := newReleases(root, http.DefaultClient)
	h := handler(s, newBridge(http.DefaultClient, ""), http.DefaultClient)
	for _, tc := range []struct {
		path, host string
		status     int
	}{{"/", listenAddress, 200}, {"/assets/app-one.js", listenAddress, 200}, {"/release.json", listenAddress, 404}, {"/", "evil.example", 403}, {"/api/lights", "evil.example", 403}} {
		r := httptest.NewRequest("GET", "http://"+tc.host+tc.path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%s: %d", tc.path, w.Code)
		}
		if tc.path == "/" && tc.status == 200 && !strings.Contains(w.Body.String(), `name="dashboard-build"`) {
			t.Fatal("missing build stamp")
		}
	}
}
func TestControlUsesFreshReadbackAndRejectsUntrustedWrites(t *testing.T) {
	var mu sync.Mutex
	reads, writes := 0, 0
	on := false
	level := 20.0
	delay := false
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var call struct {
			ID     string `json:"id"`
			Params struct {
				Name      string  `json:"name"`
				Arguments command `json:"arguments"`
			} `json:"params"`
		}
		json.NewDecoder(r.Body).Decode(&call)
		mu.Lock()
		defer mu.Unlock()
		var result any
		raw := func() rawLight {
			state := "off"
			if on {
				state = "on"
			}
			bright := level / 100 * 255
			return rawLight{EntityID: "light.example", Name: "Example", State: state, Brightness: &bright, Modes: []string{"rgb"}, RGB: []int{0, 0, 0}}
		}
		if call.Params.Name == "home_assistant_lights_list" {
			reads++
			if delay && reads >= 3 {
				on = true
				level = 70
			}
			result = []rawLight{raw()}
		} else {
			writes++
			delay = true
			result = map[string]any{"accepted": true, "entityId": "light.example", "state": raw()}
		}
		content, _ := json.Marshal(result)
		json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": call.ID, "result": map[string]any{"content": []any{map[string]any{"type": "text", "text": string(content)}}}})
	}))
	defer remote.Close()
	b := newBridge(http.DefaultClient, "test-only")
	b.endpoint = remote.URL
	if _, _, e := b.list(context.Background()); e != nil {
		t.Fatal(e)
	}
	c, e := parseCommand([]byte(`{"entityId":"light.example","brightness":70}`))
	if e != nil {
		t.Fatal(e)
	}
	result, e := b.control(context.Background(), c)
	if e != nil || !result.Settled || result.Light.Level == nil || *result.Light.Level != 70 || reads < 3 || writes != 1 {
		t.Fatalf("readback failed: %+v %v reads=%d writes=%d", result, e, reads, writes)
	}
	r := httptest.NewRequest("POST", "http://"+listenAddress+"/api/lights/control", strings.NewReader(`{"entityId":"light.example","power":"off"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	b.handle(w, r)
	if w.Code != 403 || writes != 1 {
		t.Fatal("accepted write without origin/key")
	}
	for _, bad := range []string{`{"entityId":"switch.example","power":"on"}`, `{"entityId":"light.example","brightness":101}`, `{"entityId":"light.example","brightness":1.5}`, `{"entityId":"light.example","power":"off","brightness":50}`, `{"entityId":"light.example","color":"red"}`, `{"entityId":"light.example","power":null}`, `{"entityId":"light.example","power":"on","extra":"bad"}`} {
		if _, e = parseCommand([]byte(bad)); e == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}
func TestMCPRejectsWrongResponseIDAndPreservesConcurrentState(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Write([]byte("data: {\"id\":\"wrong\",\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"[]\"}]}}\n\n"))
	}))
	defer server.Close()
	b := newBridge(http.DefaultClient, "test-only")
	b.endpoint = server.URL
	if _, e := b.read(context.Background()); e == nil {
		t.Fatal("accepted mismatched MCP response")
	}
	entered := make(chan struct{})
	finish := make(chan struct{})
	fresh := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		json.NewDecoder(r.Body).Decode(&request)
		close(entered)
		<-finish
		json.NewEncoder(w).Encode(map[string]any{"id": request["id"], "result": map[string]any{"content": []any{map[string]any{"type": "text", "text": `[{"entityId":"light.example","state":"off"}]`}}}})
	}))
	defer fresh.Close()
	b.endpoint = fresh.URL
	done := make(chan struct{})
	go func() { b.list(context.Background()); close(done) }()
	<-entered
	b.mu.Lock()
	b.inventory = []light{{ID: "light.example", State: "on", On: true, Available: true}}
	b.versions["light.example"]++
	b.mu.Unlock()
	close(finish)
	<-done
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.inventory[0].On {
		t.Fatal("stale inventory overwrote verified change")
	}
}
