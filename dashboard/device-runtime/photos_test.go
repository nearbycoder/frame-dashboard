package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPhotoProjectionAndAuthenticatedImage(t *testing.T) {
	const id = "00000000-0000-4000-8000-000000000001"
	var value map[string]any
	json.Unmarshal([]byte(`{"sources":[],"total":1,"photos":[{"id":"`+id+`","title":"Example","fileName":"image.jpg","contentType":"image/jpeg","imagePath":"/api/photos/items/`+id+`/image"}]}`), &value)
	if !validPhotos(value) {
		t.Fatal("valid photo rejected")
	}
	value["photos"].([]any)[0].(map[string]any)["imagePath"] = "https://evil.test/image"
	if validPhotos(value) {
		t.Fatal("foreign photo URL accepted")
	}
	calls := 0
	status := 200
	b := newBridge(&http.Client{Transport: forecastTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != "https://ring-mcp.nearbycoder.workers.dev/api/photos/items/"+id+"/image" || r.Header.Get("Authorization") != "private-test-credential" {
			t.Fatal("unsafe photo request")
		}
		w := httptest.NewRecorder()
		w.Header().Set("Content-Type", "image/jpeg")
		w.WriteHeader(status)
		w.WriteString("bytes")
		return w.Result(), nil
	})}, "private-test-credential")
	h := b.photoImages()
	call := func(path, method string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:18773"+path, nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w
	}
	w := call("/photo-image/"+id, "GET")
	if w.Code != 200 || w.Body.String() != "bytes" || w.Header().Get("Cache-Control") != "private, no-store" {
		t.Fatal("private image failed")
	}
	if call("/photo-image/bad", "GET").Code != 400 || call("/photo-image/"+id, "POST").Code != 405 || calls != 1 {
		t.Fatal("invalid request sent to Ring")
	}
	status = 403
	if call("/photo-image/"+id, "GET").Code != 403 {
		t.Fatal("permission error lost")
	}
	status = 302
	if call("/photo-image/"+id, "GET").Code != 502 {
		t.Fatal("redirect accepted")
	}
}
