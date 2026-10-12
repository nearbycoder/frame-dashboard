package main

import (
	"context"
	"net/http"
	"strings"
	"time"
)

func validPhotos(v map[string]any) bool {
	sources, ok := v["sources"].([]any)
	if !ok || sources == nil {
		return false
	}
	photos, ok := v["photos"].([]any)
	if !ok || len(photos) > 100 {
		return false
	}
	total, ok := v["total"].(float64)
	if !ok || total < float64(len(photos)) || total != float64(int(total)) {
		return false
	}
	for _, raw := range photos {
		p, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		id, ok := p["id"].(string)
		if !ok || !uuidRE.MatchString(id) || p["imagePath"] != "/api/photos/items/"+id+"/image" {
			return false
		}
		if _, ok = p["title"].(string); !ok {
			return false
		}
		if _, ok = p["fileName"].(string); !ok {
			return false
		}
		kind, _ := p["contentType"].(string)
		if kind != "image/jpeg" && kind != "image/png" && kind != "image/webp" {
			return false
		}
	}
	return true
}
func (b *bridge) photoImages() http.Handler {
	limit := make(chan struct{}, 2)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method != "GET" && r.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(405)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/photo-image/")
		if !uuidRE.MatchString(id) {
			w.WriteHeader(400)
			return
		}
		select {
		case limit <- struct{}{}:
			defer func() { <-limit }()
		default:
			http.Error(w, "Photo loading is busy.", 503)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, r.Method, "https://ring-mcp.nearbycoder.workers.dev/api/photos/items/"+id+"/image", nil)
		if err != nil {
			w.WriteHeader(502)
			return
		}
		req.Header.Set("Authorization", b.authorization)
		req.Header.Set("Accept", "image/jpeg,image/png,image/webp")
		response, err := b.client.Do(req)
		if err != nil {
			http.Error(w, "Photo unavailable. Check Wi-Fi.", 502)
			return
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			code := 502
			if response.StatusCode == 401 || response.StatusCode == 403 || response.StatusCode == 404 {
				code = response.StatusCode
			}
			http.Error(w, "Photo unavailable. Check photos_read permission for the frame token.", code)
			return
		}
		kind := strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])
		if kind != "image/jpeg" && kind != "image/png" && kind != "image/webp" {
			w.WriteHeader(502)
			return
		}
		if r.Method == "HEAD" {
			w.Header().Set("Content-Type", kind)
			w.WriteHeader(200)
			return
		}
		data, err := bounded(response.Body, 8*1024*1024)
		if err != nil {
			w.WriteHeader(502)
			return
		}
		w.Header().Set("Content-Type", kind)
		w.Write(data)
	})
}
