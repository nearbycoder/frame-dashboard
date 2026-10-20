package main

import (
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"os"
	"strings"
	"testing"
)

// SHA-256 of the SubjectPublicKeyInfo of roots that must never be trusted again.
// emSign ECC Root CA - G3 issued the eMudhra intermediates whose private keys were
// disclosed as recoverable on 2026-10-20; Mozilla removed the other two alongside it.
var distrustedRoots = map[string]string{
	"8d417db2dd8bf5e3084d1e3f196d583849d81bdd4c00c70b9d39369e96b8c782": "emSign ECC Root CA - G3",
	"b7408b4d2be0238ba37004dd34e276c6019bd2f24c9db7d4980f5f6c359a4bcc": "emSign Root CA - C1",
	"eabc185c4e82d942b1a5978ba3c0181487d6b3b9974e5c49f72f6d0bd9637150": "emSign ECC Root CA - C3",
}

func TestEmbeddedRootsExcludeDistrustedCAs(t *testing.T) {
	rest, count := roots, 0
	for {
		var block *pem.Block
		if block, rest = pem.Decode(rest); block == nil {
			break
		}
		cert, e := x509.ParseCertificate(block.Bytes)
		if e != nil {
			t.Fatal(e)
		}
		count++
		spki := sha256.Sum256(cert.RawSubjectPublicKeyInfo)
		if name, bad := distrustedRoots[hex.EncodeToString(spki[:])]; bad {
			t.Errorf("roots.crt trusts distrusted %s (subject %q)", name, cert.Subject.CommonName)
		}
	}
	if count < 100 {
		t.Fatalf("roots.crt has only %d certificates", count)
	}
}

func TestReadmeRecordsEmbeddedRootsHash(t *testing.T) {
	readme, e := os.ReadFile("README.md")
	if e != nil {
		t.Fatal(e)
	}
	sum := sha256.Sum256(roots)
	if !strings.Contains(string(readme), "`"+hex.EncodeToString(sum[:])+"`") {
		t.Fatalf("README.md does not record roots.crt SHA-256 %x", sum)
	}
}
