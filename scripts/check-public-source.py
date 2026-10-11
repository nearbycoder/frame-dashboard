#!/usr/bin/env python3
"""Fail publication for credential patterns; never print matched values."""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
patterns = [rb"ring_[a-fA-F0-9]{64}", rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})", rb"tskey-(?:auth|api)-[A-Za-z0-9_-]{20,}", rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", rb"(?i)Bearer[ \t]+[A-Za-z0-9_./+-]{40,}"]
blocked = {'.env', '.env.local', '.env.production'}
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).split(b'\0')
failures = []
for name in paths:
    if not name: continue
    file = root / name.decode()
    if not file.is_file(): continue
    if file.name in blocked or file.suffix in {'.keystore', '.jks', '.pem', '.key'} or any(part in {'diagnostics', 'backups', '.release-cache', 'node_modules'} for part in file.relative_to(root).parts):
        failures.append(file.relative_to(root).as_posix()); continue
    data = file.read_bytes()
    if any(re.search(pattern, data) for pattern in patterns): failures.append(file.relative_to(root).as_posix())
if failures: raise SystemExit('Potential private material in: ' + ', '.join(failures))
print('Public source check passed; no credential pattern or private artifact found.')
