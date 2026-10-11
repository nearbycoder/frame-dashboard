package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const weatherFixture = `{"properties":{"generatedAt":"2026-10-11T18:00:00Z","periods":[{"name":"Monday","startTime":"2026-10-12T06:00:00-05:00","endTime":"2026-10-12T18:00:00-05:00","isDaytime":true,"temperature":80,"temperatureUnit":"F","probabilityOfPrecipitation":{"value":null},"windSpeed":"5 mph","windDirection":"S","shortForecast":"Clear","detailedForecast":"Clear skies."}]}}`

type forecastTransport func(*http.Request) (*http.Response, error)

func (f forecastTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestForecastCacheAndValidation(t *testing.T) {
	now := time.Now()
	calls := 0
	fail := false
	unsafe := false
	client := &http.Client{Transport: forecastTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Header.Get("Authorization") != "" || r.Header.Get("User-Agent") == "" {
			t.Fatal("unsafe headers")
		}
		w := httptest.NewRecorder()
		if fail {
			w.WriteHeader(503)
		} else if r.URL.Path == "/points/36.1162,-95.8225" {
			url := "https://api.weather.gov/gridpoints/TSA/46,69/forecast"
			if unsafe {
				url = "https://example.com/forecast"
			}
			fmt.Fprintf(w, `{"properties":{"forecast":%q}}`, url)
		} else {
			w.WriteString(weatherFixture)
		}
		return w.Result(), nil
	})}
	f := &forecastService{client: client, now: func() time.Time { return now }}
	data, e := f.read(context.Background(), false)
	if e != nil || data.Status != "ready" || len(data.Periods) != 1 || data.Periods[0].PrecipitationChance != nil {
		t.Fatal("invalid projection", e)
	}
	f.read(context.Background(), false)
	if calls != 2 {
		t.Fatal("cache missed")
	}
	now = now.Add(6 * time.Second)
	fail = true
	data, e = f.read(context.Background(), true)
	if e != nil || data.Status != "stale" || data.Error == "" {
		t.Fatal("stale forecast not labeled")
	}
	data, _ = f.read(context.Background(), false)
	if data.Status != "stale" || calls != 3 {
		t.Fatal("stale cache lost")
	}
	fail = false
	now = now.Add(16 * time.Minute)
	data, _ = f.read(context.Background(), false)
	if data.Status != "ready" {
		t.Fatal("forecast did not recover")
	}
	f.cache = nil
	unsafe = true
	before := calls
	if _, e = f.read(context.Background(), true); e == nil || calls != before+1 {
		t.Fatal("unsafe provider URL followed")
	}
	for _, url := range []string{"http://api.weather.gov/gridpoints/TSA/46,69/forecast", "https://api.weather.gov.evil.test/gridpoints/TSA/46,69/forecast", "https://api.weather.gov/gridpoints/TSA/46,69/forecast?key=x"} {
		if forecastURLRE.MatchString(url) {
			t.Fatal("unsafe URL accepted")
		}
	}
	if _, e := parseForecast([]byte(`{"properties":{"generatedAt":"2026-10-11T18:00:00Z","periods":[{"temperatureUnit":"C"}]}}`), now); e == nil {
		t.Fatal("malformed period accepted")
	}
	r := httptest.NewRequest("POST", "/api/household/forecast", nil)
	w := httptest.NewRecorder()
	f.ServeHTTP(w, r)
	if w.Code != 405 {
		t.Fatal("forecast allowed a write")
	}
}
