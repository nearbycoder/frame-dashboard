package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

var uuidRE = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var dateRE = regexp.MustCompile(`^20[0-9]{2}-[0-9]{2}-[0-9]{2}$`)

func validDate(s string) bool {
	_, e := time.Parse("2006-01-02", s)
	return dateRE.MatchString(s) && e == nil
}
func textArg(a map[string]any, k string, max int, required bool) bool {
	v, ok := a[k]
	if !ok {
		return !required
	}
	s, ok := v.(string)
	return ok && len([]rune(s)) <= max && (!required || strings.TrimSpace(s) != "")
}
func only(a map[string]any, keys ...string) bool {
	for k := range a {
		found := false
		for _, v := range keys {
			if k == v {
				found = true
			}
		}
		if !found {
			return false
		}
	}
	return true
}
func numberArg(a map[string]any, k string, required bool) bool {
	v, ok := a[k]
	if !ok {
		return !required
	}
	n, ok := v.(float64)
	return ok && n > 0 && n <= 999
}
func idArg(a map[string]any, k string, uuid bool) bool {
	if !textArg(a, k, 100, true) {
		return false
	}
	return !uuid || uuidRE.MatchString(a[k].(string))
}
func validateHousehold(action string, a map[string]any) error {
	valid := false
	switch action {
	case "complete":
		_, b := a["completed"].(bool)
		date, _ := a["date"].(string)
		valid = only(a, "choreId", "date", "completed") && idArg(a, "choreId", true) && validDate(date) && b
	case "create":
		s, ok := a["schedule"].(map[string]any)
		start, _ := s["startDate"].(string)
		repeat, _ := s["repeat"].(string)
		valid = only(a, "personId", "title", "notes", "schedule") && idArg(a, "personId", true) && textArg(a, "title", 160, true) && textArg(a, "notes", 1000, false) && ok && only(s, "repeat", "startDate", "endDate", "weekdays") && validDate(start) && (repeat == "once" || repeat == "daily" || repeat == "weekly")
		if end, exists := s["endDate"]; exists {
			d, ok := end.(string)
			valid = valid && ok && validDate(d) && d >= start && repeat != "once"
		}
		days, exists := s["weekdays"]
		if repeat == "weekly" {
			list, ok := days.([]any)
			valid = valid && ok && len(list) > 0 && len(list) <= 7
			seen := map[float64]bool{}
			for _, d := range list {
				n, ok := d.(float64)
				if !ok || n < 1 || n > 7 || n != float64(int(n)) || seen[n] {
					valid = false
				}
				seen[n] = true
			}
		} else if exists {
			valid = false
		}
	case "add":
		_, name := a["name"]
		_, usual := a["usualItemId"]
		valid = only(a, "name", "usualItemId", "quantity", "note") && name != usual && textArg(a, "name", 240, name) && textArg(a, "usualItemId", 100, usual) && numberArg(a, "quantity", false) && textArg(a, "note", 500, false)
	case "update":
		_, q := a["quantity"]
		c, checked := a["checked"]
		_, note := a["note"]
		_, isBool := c.(bool)
		valid = only(a, "id", "quantity", "checked", "note") && idArg(a, "id", false) && (q || checked || note) && numberArg(a, "quantity", false) && (!checked || isBool) && textArg(a, "note", 500, false)
	}
	if !valid {
		return errors.New("Choose valid household settings.")
	}
	return nil
}
func (b *bridge) householdLock(domain string) *sync.Mutex {
	b.mu.Lock()
	defer b.mu.Unlock()
	key := "household:" + domain
	l := b.locks[key]
	if l == nil {
		l = &sync.Mutex{}
		b.locks[key] = l
	}
	return l
}
func validHousehold(domain string, v map[string]any) bool {
	arr := func(k string) bool { _, ok := v[k].([]any); return ok }
	switch domain {
	case "calendar":
		return arr("sources") && arr("events")
	case "chores":
		return arr("people") && arr("occurrences") && arr("overdue")
	case "shopping":
		return arr("items") && arr("usualItems")
	case "weather":
		s, _ := v["status"].(string)
		return arr("periods") && (s == "ready" || s == "stale" || s == "unavailable") && v["temperatureUnit"] == "F"
	case "time":
		n, ok := v["unixMs"].(float64)
		return ok && n > 0 && v["timeZone"] == "America/Chicago"
	}
	return false
}
func (b *bridge) handleHousehold(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/household/"), "/")
	tools := map[string]string{"calendar": "calendar_events_list", "chores": "chores_list", "shopping": "shopping_list_get", "weather": "weather_forecast_get", "time": "date_time_get"}
	domain := parts[0]
	tool, ok := tools[domain]
	if !ok {
		sendJSON(w, 404, map[string]string{"error": "Unknown household page."})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	args := map[string]any{}
	if week := r.URL.Query().Get("weekStart"); week != "" {
		if domain != "chores" || !validDate(week) {
			sendJSON(w, 400, map[string]string{"error": "Choose a valid chore week."})
			return
		}
		args["weekStart"] = week
	}
	if r.Method == "POST" {
		if len(parts) != 2 || ((domain != "chores" || !(parts[1] == "complete" || parts[1] == "create")) && (domain != "shopping" || !(parts[1] == "add" || parts[1] == "update"))) {
			sendJSON(w, 405, map[string]string{"error": "This operation is not supported."})
			return
		}
		if r.Header.Get("Origin") != "http://"+r.Host || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Household-Control")), []byte(b.key)) != 1 {
			sendJSON(w, 403, map[string]string{"error": "Refresh before making changes."})
			return
		}
		if strings.Split(r.Header.Get("Content-Type"), ";")[0] != "application/json" {
			sendJSON(w, 415, map[string]string{"error": "Expected JSON."})
			return
		}
		raw, e := bounded(r.Body, 8192)
		var input map[string]any
		if e != nil || json.Unmarshal(raw, &input) != nil || input == nil || validateHousehold(parts[1], input) != nil {
			sendJSON(w, 400, map[string]string{"error": "Choose valid household settings."})
			return
		}
		lock := b.householdLock(domain)
		lock.Lock()
		defer lock.Unlock()
		writeTool := map[string]string{"chores/complete": "chores_complete", "chores/create": "chores_create", "shopping/add": "shopping_list_add", "shopping/update": "shopping_list_update"}[domain+"/"+parts[1]]
		var ack map[string]any
		if b.rpc(ctx, writeTool, input, &ack) != nil {
			sendJSON(w, 503, map[string]string{"error": "The change was not confirmed. Refresh to check before trying again."})
			return
		}
		// Read after each write; never turn an optimistic preview into saved state.
		var value map[string]any
		if b.rpc(ctx, tool, args, &value) != nil || !validHousehold(domain, value) {
			sendJSON(w, 503, map[string]string{"error": "Could not verify the saved state. Refresh before trying again."})
			return
		}
		delete(value, "orders")
		sendJSON(w, 200, map[string]any{"data": value, "controlKey": b.key})
		return
	}
	if r.Method != "GET" || len(parts) != 1 {
		sendJSON(w, 405, map[string]string{"error": "Unsupported household request."})
		return
	}
	lock := b.householdLock(domain)
	lock.Lock()
	defer lock.Unlock()
	var value map[string]any
	if b.rpc(ctx, tool, args, &value) != nil || !validHousehold(domain, value) {
		sendJSON(w, 503, map[string]string{"error": "Live " + domain + " data is unavailable. Check Wi-Fi and Ring MCP permissions."})
		return
	}
	delete(value, "orders")
	sendJSON(w, 200, map[string]any{"data": value, "controlKey": b.key})
}
