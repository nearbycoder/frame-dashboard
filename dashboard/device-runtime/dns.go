package main

import (
	"context"
	"net"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// The runtime remains alive when Wi-Fi changes. Refresh Android's current DNS
// rather than retaining the resolver from the network used at process startup.
func cachedDNS(fallback string, read func() string, now func() time.Time) func() string {
	var mu sync.Mutex
	var expires time.Time
	value := fallback
	return func() string {
		mu.Lock()
		defer mu.Unlock()
		if !now().Before(expires) {
			value = fallback
			if current := strings.TrimSpace(read()); net.ParseIP(current) != nil {
				value = current
			}
			expires = now().Add(5 * time.Second)
		}
		return value
	}
}
func androidDNS(fallback string) func() string {
	if _, err := os.Stat("/system/bin/getprop"); err != nil {
		return func() string { return fallback }
	}
	return cachedDNS(fallback, func() string {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		output, err := exec.CommandContext(ctx, "/system/bin/getprop", "net.dns1").Output()
		if err != nil {
			return ""
		}
		return string(output)
	}, time.Now)
}
