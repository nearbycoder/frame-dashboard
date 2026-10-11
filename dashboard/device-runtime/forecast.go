package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"sync"
	"time"
)

var forecastURLRE = regexp.MustCompile(`^https://api\.weather\.gov/gridpoints/[A-Z]{3}/[0-9]+,[0-9]+/forecast$`)

type forecastPeriod struct {
	Name                string   `json:"name"`
	Start               string   `json:"start"`
	End                 string   `json:"end"`
	IsDaytime           bool     `json:"isDaytime"`
	Temperature         float64  `json:"temperature"`
	TemperatureUnit     string   `json:"temperatureUnit"`
	PrecipitationChance *float64 `json:"precipitationChance"`
	WindSpeed           string   `json:"windSpeed"`
	WindDirection       string   `json:"windDirection"`
	Summary             string   `json:"summary"`
	Detail              string   `json:"detail"`
}
type forecastData struct {
	Location        map[string]string `json:"location"`
	Provider        string            `json:"provider"`
	TimeZone        string            `json:"timeZone"`
	TemperatureUnit string            `json:"temperatureUnit"`
	GeneratedAt     string            `json:"generatedAt"`
	FetchedAt       string            `json:"fetchedAt"`
	Status          string            `json:"status"`
	Error           string            `json:"error,omitempty"`
	Periods         []forecastPeriod  `json:"periods"`
}

func parseForecast(raw []byte, now time.Time) (*forecastData, error) {
	var v struct {
		Properties struct {
			GeneratedAt string `json:"generatedAt"`
			Periods     []struct {
				Name            *string  `json:"name"`
				StartTime       string   `json:"startTime"`
				EndTime         string   `json:"endTime"`
				IsDaytime       *bool    `json:"isDaytime"`
				Temperature     *float64 `json:"temperature"`
				TemperatureUnit string   `json:"temperatureUnit"`
				Probability     struct {
					Value *float64 `json:"value"`
				} `json:"probabilityOfPrecipitation"`
				WindSpeed     *string `json:"windSpeed"`
				WindDirection *string `json:"windDirection"`
				Short         *string `json:"shortForecast"`
				Detail        *string `json:"detailedForecast"`
			} `json:"periods"`
		} `json:"properties"`
	}
	if e := json.Unmarshal(raw, &v); e != nil {
		return nil, e
	}
	p := v.Properties
	if _, e := time.Parse(time.RFC3339Nano, p.GeneratedAt); e != nil {
		return nil, e
	}
	if len(p.Periods) == 0 || len(p.Periods) > 100 {
		return nil, errors.New("invalid forecast")
	}
	result := &forecastData{Location: map[string]string{"name": "Tulsa, OK 74134"}, Provider: "National Weather Service", TimeZone: "America/Chicago", TemperatureUnit: "F", GeneratedAt: p.GeneratedAt, FetchedAt: now.UTC().Format(time.RFC3339Nano), Status: "ready", Periods: []forecastPeriod{}}
	for _, x := range p.Periods {
		start, e1 := time.Parse(time.RFC3339Nano, x.StartTime)
		end, e2 := time.Parse(time.RFC3339Nano, x.EndTime)
		if e1 != nil || e2 != nil || !end.After(start) || x.Name == nil || x.IsDaytime == nil || x.Temperature == nil || x.TemperatureUnit != "F" || x.WindSpeed == nil || x.WindDirection == nil || x.Short == nil || x.Detail == nil || len(*x.Detail) > 8000 || len(*x.Short) > 8000 || len(*x.Name) > 8000 || len(*x.WindSpeed) > 8000 || len(*x.WindDirection) > 8000 || x.Probability.Value != nil && (*x.Probability.Value < 0 || *x.Probability.Value > 100) {
			return nil, errors.New("invalid forecast period")
		}
		result.Periods = append(result.Periods, forecastPeriod{*x.Name, x.StartTime, x.EndTime, *x.IsDaytime, *x.Temperature, "F", x.Probability.Value, *x.WindSpeed, *x.WindDirection, *x.Short, *x.Detail})
	}
	return result, nil
}

type forecastService struct {
	client  *http.Client
	mu      sync.Mutex
	cache   *forecastData
	checked time.Time
	now     func() time.Time
}

func (f *forecastService) json(ctx context.Context, url string) ([]byte, error) {
	req, e := http.NewRequestWithContext(ctx, "GET", url, nil)
	if e != nil {
		return nil, e
	}
	req.Header.Set("Accept", "application/geo+json")
	req.Header.Set("User-Agent", "FrameDashboard/1.0 (https://github.com/nearbycoder/frame-dashboard)")
	res, e := f.client.Do(req)
	if e != nil {
		return nil, e
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, errors.New("forecast unavailable")
	}
	return bounded(res.Body, 1024*1024)
}
func (f *forecastService) read(ctx context.Context, force bool) (*forecastData, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	now := f.now()
	interval := 15 * time.Minute
	if force {
		interval = 5 * time.Second
	}
	if f.cache != nil && now.Sub(f.checked) < interval {
		return f.cache, nil
	}
	f.checked = now
	fetch := func() (*forecastData, error) {
		raw, e := f.json(ctx, "https://api.weather.gov/points/36.1162,-95.8225")
		if e != nil {
			return nil, e
		}
		var point struct {
			Properties struct {
				Forecast string `json:"forecast"`
			} `json:"properties"`
		}
		if e = json.Unmarshal(raw, &point); e != nil {
			return nil, e
		}
		if !forecastURLRE.MatchString(point.Properties.Forecast) {
			return nil, errors.New("invalid forecast location")
		}
		raw, e = f.json(ctx, point.Properties.Forecast+"?units=us")
		if e != nil {
			return nil, e
		}
		return parseForecast(raw, now)
	}
	data, e := fetch()
	if e == nil {
		f.cache = data
		return data, nil
	}
	if f.cache != nil {
		copy := *f.cache
		copy.Status = "stale"
		copy.Error = "Forecast refresh unavailable. Showing the last confirmed forecast."
		f.cache = &copy
		return &copy, nil
	}
	return nil, errors.New("Tulsa forecast is unavailable. Please refresh to try again.")
}
func (f *forecastService) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		w.Header().Set("Allow", "GET")
		sendJSON(w, 405, map[string]string{"error": "Read-only forecast"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
	defer cancel()
	data, e := f.read(ctx, r.URL.Query().Get("refresh") == "1")
	if e != nil {
		sendJSON(w, 502, map[string]string{"error": e.Error()})
		return
	}
	sendJSON(w, 200, map[string]any{"data": data})
}
