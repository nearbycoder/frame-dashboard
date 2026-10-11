package main

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

// Only public product photos accepted by Ring Shopping. Never send Ring credentials
// upstream. Canonical dimensions bound downloads and the WebView's decoded memory.
var productPath = regexp.MustCompile(`^/(seo|asr)/[A-Za-z0-9_.-]{1,1000}\.(jpeg|jpg|png|webp)$`)

func productImageURL(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host != "i5.walmartimages.com" || u.User != nil || u.Fragment != "" || !productPath.MatchString(u.EscapedPath()) {
		return "", false
	}
	u.RawQuery = "odnHeight=240&odnWidth=240&odnBg=FFFFFF"
	return u.String(), true
}
func productImages(client *http.Client) http.Handler {
	slots := make(chan struct{}, 3)
	// This endpoint rejects redirects rather than broadening the CDN allowlist.
	images := *client
	images.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(405)
			return
		}
		source, ok := productImageURL(r.URL.Query().Get("url"))
		if !ok {
			http.Error(w, "Invalid product image", 400)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		case <-r.Context().Done():
			return
		}
		req, err := http.NewRequestWithContext(r.Context(), "GET", source, nil)
		if err != nil {
			w.WriteHeader(502)
			return
		}
		res, err := images.Do(req)
		if err != nil {
			w.WriteHeader(502)
			return
		}
		defer res.Body.Close()
		kind := strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0])
		if res.StatusCode != 200 || (kind != "image/jpeg" && kind != "image/png" && kind != "image/webp") {
			w.WriteHeader(502)
			return
		}
		data, err := bounded(res.Body, 1024*1024)
		if err != nil {
			w.WriteHeader(502)
			return
		}
		w.Header().Set("Content-Type", kind)
		w.Header().Set("Cache-Control", "private, max-age=21600")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method != "HEAD" {
			w.Write(data)
		}
	})
}
