package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

const releaseURL = "https://github.com/nearbycoder/frame-dashboard/releases/latest/download/dashboard-bundle.json"

var versionRE = regexp.MustCompile(`^[a-f0-9]{16}$`)
var tagRE = regexp.MustCompile(`^v\d+\.\d+\.\d+$`)
var assetRE = regexp.MustCompile(`^assets/[a-zA-Z0-9_.-]+$`)
var referenceRE = regexp.MustCompile(`(?:src|href)=["'](/assets/[a-zA-Z0-9_.-]+)["']`)

type bundleFile struct {
	Name   string `json:"name"`
	SHA256 string `json:"sha256"`
	Data   string `json:"data"`
}
type bundle struct {
	Schema  int          `json:"schema"`
	Tag     string       `json:"tag"`
	Version string       `json:"version"`
	BuiltAt string       `json:"builtAt"`
	Files   []bundleFile `json:"files"`
}
type release struct {
	Version     string   `json:"version"`
	Tag         string   `json:"tag"`
	BuiltAt     string   `json:"builtAt"`
	Assets      []string `json:"assets"`
	UpdateError string   `json:"updateError,omitempty"`
	root        string
	html        []byte
}
type releases struct {
	mu        sync.Mutex
	checkMu   sync.Mutex
	root      string
	active    release
	lastCheck time.Time
	client    *http.Client
	url       string
}

func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func safeFile(n string) bool {
	return n == "index.html" || n == "icon-192.png" || n == "icon-512.png" || n == "manifest.webmanifest" || assetRE.MatchString(n)
}
func bounded(r io.Reader, limit int64) ([]byte, error) {
	b, e := io.ReadAll(io.LimitReader(r, limit+1))
	if e == nil && int64(len(b)) > limit {
		e = errors.New("size limit")
	}
	return b, e
}

// Validate a whole release BEFORE any active files change. Hashes detect corruption;
// HTTPS and repository access controls authenticate the publisher.
func stage(data []byte, root string) (release, error) {
	var b bundle
	if json.Unmarshal(data, &b) != nil || b.Schema != 1 || !tagRE.MatchString(b.Tag) || !versionRE.MatchString(b.Version) || len(b.Files) < 3 || len(b.Files) > 45 {
		return release{}, errors.New("invalid bundle")
	}
	files := map[string][]byte{}
	total := 0
	for _, f := range b.Files {
		if !safeFile(f.Name) || files[f.Name] != nil || len(f.Data) > 8*1024*1024 {
			return release{}, errors.New("invalid file")
		}
		decoded, e := base64.StdEncoding.DecodeString(f.Data)
		total += len(decoded)
		if e != nil || len(decoded) == 0 || total > 10*1024*1024 || digest(decoded) != f.SHA256 {
			return release{}, errors.New("checksum mismatch")
		}
		files[f.Name] = decoded
	}
	html := files["index.html"]
	if len(html) == 0 || digest(html)[:16] != b.Version || !strings.Contains(string(html), "</head>") {
		return release{}, errors.New("HTML version mismatch")
	}
	refs := referenceRE.FindAllSubmatch(html, -1)
	if len(refs) == 0 || len(refs) > 40 {
		return release{}, errors.New("missing assets")
	}
	for _, ref := range refs {
		if files[string(ref[1])[1:]] == nil {
			return release{}, errors.New("incomplete release")
		}
	}
	if e := os.MkdirAll(root, 0700); e != nil {
		return release{}, e
	}
	temp, e := os.MkdirTemp(root, ".stage-")
	if e != nil {
		return release{}, e
	}
	defer os.RemoveAll(temp)
	for name, bytes := range files {
		p := filepath.Join(temp, name)
		if e = os.MkdirAll(filepath.Dir(p), 0700); e != nil {
			return release{}, e
		}
		if e = os.WriteFile(p, bytes, 0600); e != nil {
			return release{}, e
		}
	}
	// Persist the manifest to verify every file on restart, not just its presence.
	manifest := b
	for i := range manifest.Files {
		manifest.Files[i].Data = ""
	}
	meta, _ := json.Marshal(manifest)
	if e = os.WriteFile(filepath.Join(temp, "release.json"), meta, 0600); e != nil {
		return release{}, e
	}
	target := filepath.Join(root, b.Version)
	if _, err := os.Stat(target); err == nil {
		cached, err := loadRelease(target)
		if err != nil || cached.Version != b.Version {
			return release{}, errors.New("invalid cached release")
		}
	} else if e = os.Rename(temp, target); e != nil {
		return release{}, e
	}
	r, e := loadRelease(target)
	r.Tag = b.Tag
	r.BuiltAt = b.BuiltAt
	return r, e
}
func loadRelease(root string) (release, error) {
	raw, e := os.ReadFile(filepath.Join(root, "release.json"))
	if e != nil {
		return release{}, e
	}
	var b bundle
	if json.Unmarshal(raw, &b) != nil || !versionRE.MatchString(b.Version) || !tagRE.MatchString(b.Tag) || len(b.Files) < 3 || len(b.Files) > 45 {
		return release{}, errors.New("invalid manifest")
	}
	files := map[string][]byte{}
	total := 0
	for _, f := range b.Files {
		if !safeFile(f.Name) || files[f.Name] != nil {
			return release{}, errors.New("invalid manifest file")
		}
		p, e := os.ReadFile(filepath.Join(root, f.Name))
		total += len(p)
		if e != nil || len(p) == 0 || total > 10*1024*1024 || digest(p) != f.SHA256 {
			return release{}, errors.New("cached checksum mismatch")
		}
		files[f.Name] = p
	}
	html := files["index.html"]
	if len(html) == 0 || digest(html)[:16] != b.Version {
		return release{}, errors.New("cached version mismatch")
	}
	assets := []string{}
	for _, ref := range referenceRE.FindAllSubmatch(html, -1) {
		n := string(ref[1])
		if files[n[1:]] == nil {
			return release{}, errors.New("cached missing asset")
		}
		assets = append(assets, n)
	}
	if len(assets) == 0 {
		return release{}, errors.New("cached missing references")
	}
	return release{Version: b.Version, Tag: b.Tag, BuiltAt: b.BuiltAt, Assets: assets, root: root, html: html}, nil
}
func newReleases(root string, client *http.Client) (*releases, error) {
	s := &releases{root: root, client: client, url: releaseURL}
	saved, e := os.ReadFile(filepath.Join(root, "active.json"))
	if e == nil {
		var r release
		if json.Unmarshal(saved, &r) == nil && versionRE.MatchString(r.Version) {
			s.active, e = loadRelease(filepath.Join(root, r.Version))
			if e == nil {
				s.active.Tag = r.Tag
				return s, nil
			}
		}
	}
	data, e := os.ReadFile(filepath.Join(root, "bootstrap.json"))
	if e != nil {
		return nil, e
	}
	r, e := stage(data, root)
	if e != nil {
		return nil, e
	}
	s.active = r
	return s, nil
}
func (s *releases) current() release { s.mu.Lock(); defer s.mu.Unlock(); return s.active }
func (s *releases) check() release {
	s.checkMu.Lock()
	defer s.checkMu.Unlock()
	if time.Since(s.lastCheck) < time.Minute {
		return s.current()
	}
	s.lastCheck = time.Now()
	fail := func() release {
		s.mu.Lock()
		defer s.mu.Unlock()
		s.active.UpdateError = "Could not check GitHub. Your current dashboard is still available."
		return s.active
	}
	req, e := http.NewRequest("GET", s.url, nil)
	if e != nil {
		return fail()
	}
	req.Header.Set("User-Agent", "FrameDashboardDevice/1.0")
	res, e := s.client.Do(req)
	if e != nil {
		return fail()
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fail()
	}
	bytes, e := bounded(res.Body, 15*1024*1024)
	if e != nil {
		return fail()
	}
	r, e := stage(bytes, s.root)
	if e != nil {
		return fail()
	}
	saved, _ := json.Marshal(r)
	p := filepath.Join(s.root, "active.json")
	if os.WriteFile(p+".tmp", saved, 0600) != nil || os.Rename(p+".tmp", p) != nil {
		return fail()
	}
	s.mu.Lock()
	s.active = r
	s.mu.Unlock()
	return r
}
