package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

type productTransport func(*http.Request) (*http.Response, error)

func (f productTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestProductImageBoundary(t *testing.T) {
	source := "https://i5.walmartimages.com/seo/Example_abcd.jpeg?odnWidth=9999"
	normalized, ok := productImageURL(source)
	if !ok || normalized != "https://i5.walmartimages.com/seo/Example_abcd.jpeg?odnHeight=240&odnWidth=240&odnBg=FFFFFF" {
		t.Fatal("invalid normalization")
	}
	for _, raw := range []string{"http://i5.walmartimages.com/seo/a.jpg", "https://localhost/seo/a.jpg", "https://i5.walmartimages.com.evil/seo/a.jpg", "https://secret@i5.walmartimages.com/seo/a.jpg", "https://i5.walmartimages.com:444/seo/a.jpg", "https://i5.walmartimages.com/api/a.jpg", "https://i5.walmartimages.com/seo/a.svg", "https://i5.walmartimages.com/seo/a.jpg#secret"} {
		if _, ok := productImageURL(raw); ok {
			t.Fatalf("accepted %s", raw)
		}
	}
	for _, kind := range []string{"valid", "redirect", "html", "huge"} {
		calls := 0
		client := &http.Client{Transport: productTransport(func(r *http.Request) (*http.Response, error) {
			calls++
			if r.URL.String() != normalized || r.Header.Get("Authorization") != "" {
				t.Fatal("upstream boundary")
			}
			status, content, body := 200, "image/jpeg", "photo"
			switch kind {
			case "redirect":
				status = 302
			case "html":
				content = "text/html"
			case "huge":
				body = strings.Repeat("x", 1024*1024+1)
			}
			return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": {content}, "Location": {"https://localhost/private"}}, Body: io.NopCloser(strings.NewReader(body)), Request: r}, nil
		})}
		request := httptest.NewRequest("GET", "http://"+listenAddress+"/product-image?url="+url.QueryEscape(source), nil)
		request.Header.Set("Authorization", "Bearer local-test-only")
		result := httptest.NewRecorder()
		productImages(client).ServeHTTP(result, request)
		expected := 502
		if kind == "valid" {
			expected = 200
			if result.Header().Get("Cache-Control") != "private, max-age=21600" {
				t.Fatal("missing private cache")
			}
		}
		if result.Code != expected || calls != 1 {
			t.Fatalf("%s: status %d calls %d", kind, result.Code, calls)
		}
	}
}
