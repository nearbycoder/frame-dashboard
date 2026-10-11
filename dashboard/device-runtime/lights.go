package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

const mcpEndpoint = "https://ring-mcp.nearbycoder.workers.dev/mcp"

var entityRE = regexp.MustCompile(`^light\.[a-z0-9_]+$`)
var colorRE = regexp.MustCompile(`^#[a-fA-F0-9]{6}$`)

type rawLight struct {
	EntityID   string   `json:"entityId"`
	Name       string   `json:"name"`
	State      string   `json:"state"`
	Brightness *float64 `json:"brightness"`
	Modes      []string `json:"supportedColorModes"`
	RGB        []int    `json:"rgbColor"`
}
type light struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	State     string `json:"state"`
	On        bool   `json:"on"`
	Available bool   `json:"available"`
	Level     *int   `json:"level"`
	Dimmable  bool   `json:"dimmable"`
	Color     bool   `json:"color"`
	RGB       []int  `json:"rgb"`
}
type command struct {
	EntityID   string  `json:"entityId"`
	Power      *string `json:"power,omitempty"`
	Brightness *int    `json:"brightness,omitempty"`
	Color      *string `json:"color,omitempty"`
}
type confirmed struct {
	Light       light  `json:"light"`
	Settled     bool   `json:"settled"`
	ConfirmedAt string `json:"confirmedAt"`
}
type bridge struct {
	client                       *http.Client
	authorization, endpoint, key string
	mu                           sync.Mutex
	inventory                    []light
	synced                       string
	expires                      time.Time
	versions                     map[string]int
	active                       map[string]bool
	locks                        map[string]*sync.Mutex
	loadMu                       sync.Mutex
}

func randomKey() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func newBridge(client *http.Client, auth string) *bridge {
	return &bridge{client: client, authorization: strings.TrimSpace(auth), endpoint: mcpEndpoint, key: randomKey(), versions: map[string]int{}, active: map[string]bool{}, locks: map[string]*sync.Mutex{}}
}
func normalize(r rawLight) (light, error) {
	if !entityRE.MatchString(r.EntityID) || (r.State != "on" && r.State != "off" && r.State != "unknown" && r.State != "unavailable") {
		return light{}, errors.New("invalid light state")
	}
	name := r.Name
	if name == "" {
		name = r.EntityID
	}
	if len([]rune(name)) > 120 {
		name = string([]rune(name)[:120])
	}
	l := light{ID: r.EntityID, Name: name, State: r.State, On: r.State == "on", Available: r.State == "on" || r.State == "off", RGB: r.RGB}
	if r.Brightness != nil {
		level := int(math.Round(*r.Brightness / 255 * 100))
		l.Level = &level
	}
	if len(l.RGB) > 3 {
		l.RGB = l.RGB[:3]
	}
	for _, m := range r.Modes {
		if m != "onoff" && m != "unknown" {
			l.Dimmable = true
		}
		if m == "hs" || m == "xy" || m == "rgb" || m == "rgbw" || m == "rgbww" {
			l.Color = true
		}
	}
	return l, nil
}
func parseCommand(data []byte) (command, error) {
	var c command
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if dec.Decode(&c) != nil || !entityRE.MatchString(c.EntityID) || (c.Power != nil && *c.Power != "on" && *c.Power != "off") || (c.Brightness != nil && (*c.Brightness < 0 || *c.Brightness > 100)) || (c.Color != nil && !colorRE.MatchString(*c.Color)) || (c.Power == nil && c.Brightness == nil && c.Color == nil) || (c.Power != nil && *c.Power == "off" && (c.Brightness != nil || c.Color != nil)) {
		return c, errors.New("Choose valid light settings.")
	}
	// Reject null settings and trailing JSON; these are never emitted by the UI.
	var fields map[string]json.RawMessage
	if json.Unmarshal(data, &fields) != nil {
		return c, errors.New("Invalid light settings.")
	}
	for _, v := range fields {
		if bytes.Equal(v, []byte("null")) {
			return c, errors.New("Invalid light settings.")
		}
	}
	return c, nil
}
func (b *bridge) rpc(ctx context.Context, name string, args any, out any) error {
	if b.authorization == "" {
		return errors.New("Lighting credentials are missing on this frame.")
	}
	id := randomKey()
	body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": map[string]any{"name": name, "arguments": args}})
	req, e := http.NewRequestWithContext(ctx, "POST", b.endpoint, bytes.NewReader(body))
	if e != nil {
		return errors.New("Lighting request failed.")
	}
	req.Header.Set("Authorization", b.authorization)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	req.Header.Set("Origin", "https://ring-mcp.nearbycoder.workers.dev")
	req.Header.Set("MCP-Protocol-Version", "2025-03-26")
	req.Header.Set("User-Agent", "FrameDashboardDevice/1.0")
	res, e := b.client.Do(req)
	if e != nil {
		return errors.New("Lighting connection failed. Check Wi-Fi before retrying.")
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return errors.New("Lighting request was not confirmed. Check the light before retrying.")
	}
	limit := int64(512000)
	if !strings.HasPrefix(name, "home_assistant_") {
		limit = 2 * 1024 * 1024
	}
	data, e := bounded(res.Body, limit)
	if e != nil {
		return errors.New("Invalid lighting response.")
	}
	type reply struct {
		ID     string          `json:"id"`
		Error  json.RawMessage `json:"error"`
		Result struct {
			IsError bool `json:"isError"`
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
	}
	var r reply
	found := false
	candidates := [][]byte{data}
	if !strings.HasPrefix(strings.TrimSpace(string(data)), "{") {
		candidates = nil
		for _, line := range bytes.Split(data, []byte("\n")) {
			if bytes.HasPrefix(line, []byte("data:")) {
				candidates = append(candidates, bytes.TrimSpace(line[5:]))
			}
		}
	}
	for _, candidate := range candidates {
		if json.Unmarshal(candidate, &r) == nil && r.ID == id {
			found = true
			break
		}
	}
	if !found || (len(r.Error) > 0 && string(r.Error) != "null") || r.Result.IsError {
		return errors.New("Lighting request was not confirmed. Check the light before retrying.")
	}
	for _, c := range r.Result.Content {
		if c.Type == "text" {
			if json.Unmarshal([]byte(c.Text), out) == nil {
				return nil
			}
			break
		}
	}
	return errors.New("Invalid lighting state response.")
}
func (b *bridge) read(ctx context.Context) ([]light, error) {
	var raw []rawLight
	if e := b.rpc(ctx, "home_assistant_lights_list", map[string]any{}, &raw); e != nil {
		return nil, e
	}
	if raw == nil || len(raw) > 500 {
		return nil, errors.New("Invalid light inventory.")
	}
	values := []light{}
	seen := map[string]bool{}
	for _, r := range raw {
		l, e := normalize(r)
		if e != nil || seen[l.ID] {
			return nil, errors.New("Invalid light inventory.")
		}
		seen[l.ID] = true
		values = append(values, l)
	}
	return values, nil
}
func (b *bridge) list(ctx context.Context) ([]light, string, error) {
	b.loadMu.Lock()
	defer b.loadMu.Unlock()
	b.mu.Lock()
	if time.Now().Before(b.expires) {
		l, s := append([]light{}, b.inventory...), b.synced
		b.mu.Unlock()
		return l, s, nil
	}
	before := map[string]int{}
	started := map[string]bool{}
	for id, n := range b.versions {
		before[id] = n
	}
	for id, a := range b.active {
		started[id] = a
	}
	b.mu.Unlock()
	values, e := b.read(ctx)
	if e != nil {
		return nil, "", e
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	prior := map[string]light{}
	for _, l := range b.inventory {
		prior[l.ID] = l
	}
	seen := map[string]bool{}
	for i, l := range values {
		seen[l.ID] = true
		if b.active[l.ID] || started[l.ID] || before[l.ID] != b.versions[l.ID] {
			if p, ok := prior[l.ID]; ok {
				values[i] = p
			}
		}
	}
	for id, p := range prior {
		if !seen[id] && (b.active[id] || started[id] || before[id] != b.versions[id]) {
			values = append(values, p)
		}
	}
	b.inventory = values
	b.synced = time.Now().UTC().Format(time.RFC3339Nano)
	b.expires = time.Now().Add(5 * time.Second)
	return append([]light{}, values...), b.synced, nil
}
func matches(l light, c command) bool {
	on := !(c.Power != nil && *c.Power == "off" || c.Brightness != nil && *c.Brightness == 0)
	if !l.Available || l.On != on {
		return false
	}
	if on && c.Brightness != nil && (l.Level == nil || math.Abs(float64(*l.Level-*c.Brightness)) > 1) {
		return false
	}
	if on && c.Color != nil {
		rgb, _ := hex.DecodeString((*c.Color)[1:])
		if len(l.RGB) != 3 {
			return false
		}
		for i, n := range rgb {
			if math.Abs(float64(int(n)-l.RGB[i])) > 8 {
				return false
			}
		}
	}
	return true
}
func (b *bridge) control(ctx context.Context, c command) (confirmed, error) {
	b.mu.Lock()
	lock := b.locks[c.EntityID]
	if lock == nil {
		lock = &sync.Mutex{}
		b.locks[c.EntityID] = lock
	}
	b.mu.Unlock()
	lock.Lock()
	defer lock.Unlock()
	values, _, e := b.list(ctx)
	if e != nil {
		return confirmed{}, e
	}
	var current light
	for _, l := range values {
		if l.ID == c.EntityID {
			current = l
		}
	}
	if !current.Available || (c.Brightness != nil && !current.Dimmable) || (c.Color != nil && !current.Color) {
		return confirmed{}, errors.New("This light is unavailable or does not support these settings.")
	}
	b.mu.Lock()
	b.active[c.EntityID] = true
	b.versions[c.EntityID]++
	b.expires = time.Time{}
	b.mu.Unlock()
	defer func() {
		b.mu.Lock()
		delete(b.active, c.EntityID)
		b.versions[c.EntityID]++
		b.expires = time.Time{}
		b.mu.Unlock()
	}()
	var ack struct {
		Accepted bool     `json:"accepted"`
		EntityID string   `json:"entityId"`
		State    rawLight `json:"state"`
	}
	if e = b.rpc(ctx, "home_assistant_light_control", c, &ack); e != nil {
		return confirmed{}, e
	}
	if _, e = normalize(ack.State); e != nil || !ack.Accepted || ack.EntityID != c.EntityID || ack.State.EntityID != c.EntityID {
		return confirmed{}, errors.New("Light change was not confirmed. Check the light before retrying.")
	}
	verifyCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	result := confirmed{}
	for _, ms := range []int{0, 250, 500, 1000, 1500, 2000} {
		if ms > 0 {
			select {
			case <-time.After(time.Duration(ms) * time.Millisecond):
			case <-verifyCtx.Done():
				return confirmed{}, errors.New("Could not verify light state. Check it before retrying.")
			}
		}
		values, e = b.read(verifyCtx)
		if e != nil {
			return confirmed{}, e
		}
		found := false
		for _, l := range values {
			if l.ID == c.EntityID {
				result.Light = l
				result.Settled = matches(l, c)
				found = true
				break
			}
		}
		if !found {
			return confirmed{}, errors.New("This light is no longer listed.")
		}
		if result.Settled {
			break
		}
	}
	result.ConfirmedAt = time.Now().UTC().Format(time.RFC3339Nano)
	b.mu.Lock()
	for i, l := range b.inventory {
		if l.ID == c.EntityID {
			b.inventory[i] = result.Light
		}
	}
	b.synced = result.ConfirmedAt
	b.mu.Unlock()
	return result, nil
}
func (b *bridge) handle(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	if r.URL.Path == "/api/lights" && r.Method == "GET" {
		values, synced, e := b.list(ctx)
		if e != nil {
			sendJSON(w, 503, map[string]string{"error": e.Error()})
			return
		}
		sendJSON(w, 200, map[string]any{"lights": values, "syncedAt": synced, "controlKey": b.key})
		return
	}
	if r.URL.Path != "/api/lights/control" || r.Method != "POST" {
		sendJSON(w, 405, map[string]string{"error": "Unsupported lighting request."})
		return
	}
	if r.Header.Get("Origin") != "http://"+r.Host || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Light-Control")), []byte(b.key)) != 1 {
		sendJSON(w, 403, map[string]string{"error": "Refresh the dashboard before changing lights."})
		return
	}
	if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
		sendJSON(w, 415, map[string]string{"error": "Expected JSON."})
		return
	}
	data, e := bounded(r.Body, 4096)
	if e != nil {
		sendJSON(w, 413, map[string]string{"error": "Request too large."})
		return
	}
	c, e := parseCommand(data)
	if e != nil {
		sendJSON(w, 400, map[string]string{"error": e.Error()})
		return
	}
	result, e := b.control(ctx, c)
	if e != nil {
		sendJSON(w, 503, map[string]string{"error": e.Error()})
		return
	}
	sendJSON(w, 200, result)
}
func sendJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
