package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestHouseholdValidation(t *testing.T) {
	good := []struct{ action, body string }{
		{"complete", `{"choreId":"00000000-0000-4000-8000-000000000001","date":"2026-10-11","completed":false}`},
		{"create", `{"personId":"00000000-0000-4000-8000-000000000001","title":"Example","schedule":{"repeat":"weekly","startDate":"2026-10-11","weekdays":[1,7]}}`},
		{"add", `{"usualItemId":"usual:example","quantity":1}`},
		{"update", `{"id":"example","checked":false}`},
	}
	for _, tc := range good {
		var a map[string]any
		json.Unmarshal([]byte(tc.body), &a)
		if validateHousehold(tc.action, a) != nil {
			t.Fatal("valid request rejected", tc.action)
		}
	}
	bad := []struct{ action, body string }{
		{"complete", `{"choreId":"bad","date":"2026-10-11","completed":true}`},
		{"complete", `{"choreId":"00000000-0000-4000-8000-000000000001","date":"2026-02-30","completed":true}`},
		{"complete", `{"choreId":"00000000-0000-4000-8000-000000000001","date":"2026-10-11","completed":null}`},
		{"add", `{"name":"Example","usualItemId":"x","quantity":1}`},
		{"add", `{"name":"Example","quantity":0}`},
		{"add", `{"name":"Example","tool":"shopping_orders_import"}`},
		{"update", `{"id":"example"}`},
		{"create", `{"personId":"00000000-0000-4000-8000-000000000001","title":"Example","schedule":{"repeat":"weekly","startDate":"2026-10-11","weekdays":[1,1]}}`},
	}
	for _, tc := range bad {
		var a map[string]any
		json.Unmarshal([]byte(tc.body), &a)
		if validateHousehold(tc.action, a) == nil {
			t.Fatal("invalid request accepted", tc.action)
		}
	}
}
func TestHouseholdProjectionReadbackAndProtection(t *testing.T) {
	var mu sync.Mutex
	checked := false
	calls := []string{}
	remote := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var call struct {
			ID     string `json:"id"`
			Params struct {
				Name      string         `json:"name"`
				Arguments map[string]any `json:"arguments"`
			} `json:"params"`
		}
		json.NewDecoder(r.Body).Decode(&call)
		mu.Lock()
		defer mu.Unlock()
		calls = append(calls, call.Params.Name)
		var result any
		if call.Params.Name == "shopping_list_update" {
			checked = call.Params.Arguments["checked"].(bool)
			result = map[string]any{"items": []any{}, "usualItems": []any{}}
		} else {
			result = map[string]any{"items": []any{map[string]any{"id": "example", "name": "Example", "checked": checked, "quantity": 1}}, "usualItems": []any{}, "orders": []any{map[string]any{"id": "private-order"}}}
		}
		raw, _ := json.Marshal(result)
		json.NewEncoder(w).Encode(map[string]any{"id": call.ID, "result": map[string]any{"content": []any{map[string]any{"type": "text", "text": string(raw)}}}})
	}))
	defer remote.Close()
	b := newBridge(http.DefaultClient, "private-test-credential")
	b.endpoint = remote.URL
	request := func(method, path, origin, key, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://"+listenAddress+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Origin", origin)
		r.Header.Set("X-Household-Control", key)
		w := httptest.NewRecorder()
		b.handleHousehold(w, r)
		return w
	}
	for _, tc := range []struct{ origin, key string }{{"http://evil.example", b.key}, {"http://" + listenAddress, ""}, {"http://" + listenAddress, "wrong"}} {
		if request("POST", "/api/household/shopping/update", tc.origin, tc.key, `{"id":"example","checked":true}`).Code != 403 {
			t.Fatal("untrusted write accepted")
		}
	}
	w := request("GET", "/api/household/shopping", "", "", "")
	if w.Code != 200 || strings.Contains(w.Body.String(), "private-order") || strings.Contains(w.Body.String(), "private-test-credential") {
		t.Fatal("private data exposed")
	}
	w = request("POST", "/api/household/shopping/update", "http://"+listenAddress, b.key, `{"id":"example","checked":true}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"checked":true`) {
		t.Fatal("fresh readback missing")
	}
	mu.Lock()
	defer mu.Unlock()
	if len(calls) != 3 || calls[1] != "shopping_list_update" || calls[2] != "shopping_list_get" {
		t.Fatal("write not followed by read", calls)
	}
}
