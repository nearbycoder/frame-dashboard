// The rooted Android frame owns its dashboard cache and lighting credential.
// No host computer, USB reverse tunnel, or GitHub token is needed at runtime.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	_ "embed"
	"flag"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Public Mozilla CA store from https://curl.se/docs/caextract.html (MPL-2.0).
// Android 6's old CA store is insufficient for modern GitHub/CDN HTTPS.
//
//go:embed roots.crt
var roots []byte

const listenAddress = "127.0.0.1:18773"

func secureClient(dns string, redirects bool) *http.Client {
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(roots) {
		panic("invalid CA store")
	}
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	if dns != "" {
		currentDNS := androidDNS(dns)
		dialer.Resolver = &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
			return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(currentDNS(), "53"))
		}}
	}
	return &http.Client{Timeout: 30 * time.Second, Transport: &http.Transport{DialContext: dialer.DialContext, TLSClientConfig: &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}, TLSHandshakeTimeout: 10 * time.Second, MaxIdleConns: 8, MaxIdleConnsPerHost: 4, IdleConnTimeout: 180 * time.Second}, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if !redirects || len(via) > 5 || req.URL.Scheme != "https" || req.URL.Port() != "" || req.URL.User != nil {
			return http.ErrUseLastResponse
		}
		switch req.URL.Hostname() {
		case "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "picsum.photos", "fastly.picsum.photos":
			return nil
		}
		return http.ErrUseLastResponse
	}}
}
func handler(s *releases, b *bridge, client *http.Client) http.Handler {
	products := productImages(client)
	photos := b.photoImages()
	settings := newDeviceSettings(b.key)
	forecastClient := *client
	forecastClient.CheckRedirect = func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }
	forecast := &forecastService{client: &forecastClient, now: time.Now}
	imageLimit := make(chan struct{}, 4)
	imageRE := regexp.MustCompile(`^/demo-images/([a-zA-Z0-9_-]{1,64})/([0-9]{1,4})/([0-9]{1,4})$`)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Loopback binding plus an exact Host check prevents LAN access and DNS rebinding.
		if r.Host != listenAddress {
			http.Error(w, "Host not allowed", 403)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/photo-image/") {
			photos.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/device-settings") {
			settings.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/product-image" {
			products.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/api/household/forecast" {
			forecast.ServeHTTP(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/household/") {
			b.handleHousehold(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/lights") {
			b.handle(w, r)
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			w.Header().Set("Allow", "GET, HEAD")
			w.WriteHeader(405)
			return
		}
		if r.URL.Path == "/api/dashboard-update" {
			sendJSON(w, 200, s.check())
			return
		}
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			active := s.current()
			if v := r.URL.Query().Get("build"); versionRE.MatchString(v) {
				if cached, e := loadRelease(filepath.Join(s.root, v)); e == nil {
					active = cached
				}
			}
			html := strings.Replace(string(active.html), "</head>", `<meta name="dashboard-build" content="`+active.Version+`"></head>`, 1)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("X-Dashboard-Build", active.Version)
			if r.Method != "HEAD" {
				io.WriteString(w, html)
			}
			return
		}
		if strings.HasPrefix(r.URL.Path, "/demo-images/") {
			m := imageRE.FindStringSubmatch(r.URL.Path)
			var width, height int
			if m != nil {
				fmt.Sscan(m[2], &width)
				fmt.Sscan(m[3], &height)
			}
			if m == nil || width < 1 || height < 1 || width > 1600 || height > 1200 || width*height > 1920000 {
				http.Error(w, "Invalid image", 400)
				return
			}
			select {
			case imageLimit <- struct{}{}:
				defer func() { <-imageLimit }()
			default:
				http.Error(w, "Image limit", 503)
				return
			}
			req, e := http.NewRequestWithContext(r.Context(), "GET", "https://picsum.photos/seed/"+strings.Join(m[1:], "/"), nil)
			if e != nil {
				w.WriteHeader(502)
				return
			}
			res, e := client.Do(req)
			if e != nil {
				w.WriteHeader(502)
				return
			}
			defer res.Body.Close()
			kind := strings.Split(res.Header.Get("Content-Type"), ";")[0]
			if res.StatusCode != 200 || (kind != "image/jpeg" && kind != "image/png") {
				w.WriteHeader(502)
				return
			}
			data, e := bounded(res.Body, 4*1024*1024)
			if e != nil {
				w.WriteHeader(502)
				return
			}
			w.Header().Set("Content-Type", kind)
			w.Header().Set("Cache-Control", "public, max-age=21600")
			if r.Method != "HEAD" {
				w.Write(data)
			}
			return
		}
		name := strings.TrimPrefix(r.URL.Path, "/")
		if !safeFile(name) {
			w.WriteHeader(404)
			return
		}
		active := s.current()
		roots := []string{active.root}
		entries, _ := os.ReadDir(s.root)
		for _, entry := range entries {
			if versionRE.MatchString(entry.Name()) {
				roots = append(roots, filepath.Join(s.root, entry.Name()))
			}
		}
		for _, root := range roots {
			p := filepath.Join(root, name)
			info, e := os.Stat(p)
			if e != nil || !info.Mode().IsRegular() {
				continue
			}
			w.Header().Set("Content-Type", mime.TypeByExtension(filepath.Ext(name)))
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			http.ServeFile(w, r, p)
			return
		}
		w.WriteHeader(404)
	})
}
func main() {
	root := flag.String("state", "/data/local/frame-dashboard", "private state directory")
	dns := flag.String("dns", "", "Wi-Fi DNS server (Android has no resolv.conf)")
	flag.Parse()
	if *dns != "" && net.ParseIP(*dns) == nil {
		fmt.Fprintln(os.Stderr, "Invalid DNS address")
		os.Exit(2)
	}
	client := secureClient(*dns, true)
	// Package replacements can leave a root child alive. Only one runtime may
	// own the cache, and the service can supervise an existing child by its PID.
	lock, e := os.OpenFile(filepath.Join(*root, "runtime.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if e != nil || syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
		fmt.Fprintln(os.Stderr, "Frame runtime already running or state unavailable")
		os.Exit(66)
	}
	defer lock.Close()
	s, e := newReleases(*root, client)
	if e != nil {
		fmt.Fprintln(os.Stderr, "A verified dashboard bootstrap/cache is required")
		os.Exit(65)
	}
	auth, _ := os.ReadFile(filepath.Join(*root, "ringos.authorization"))
	b := newBridge(secureClient(*dns, false), string(auth))
	server := &http.Server{Addr: listenAddress, Handler: handler(s, b, client), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 65 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8192}
	listener, e := net.Listen("tcp", listenAddress)
	if e != nil {
		fmt.Fprintln(os.Stderr, "Frame loopback port unavailable")
		os.Exit(66)
	}
	pidfile := filepath.Join(*root, "runtime.pid")
	if os.WriteFile(pidfile, []byte(strconv.Itoa(os.Getpid())), 0600) != nil {
		os.Exit(65)
	}
	defer os.Remove(pidfile)
	fmt.Println("Frame dashboard ready on loopback; credentials are private")
	if e = server.Serve(listener); e != nil {
		fmt.Fprintln(os.Stderr, "Frame dashboard stopped")
		os.Exit(1)
	}
}
