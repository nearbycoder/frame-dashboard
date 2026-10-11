#!/usr/bin/env python3
"""One-time rooted-frame setup. Authorization is never an argument or log entry."""
import argparse
import getpass
import re
import secrets
import shlex
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--runtime', type=Path, required=True)
parser.add_argument('--bundle', type=Path, required=True)
parser.add_argument('--apk', type=Path, required=True)
parser.add_argument('--serial')
parser.add_argument('--adb', default='adb')
args = parser.parse_args()
for file in (args.runtime, args.bundle, args.apk):
    if not file.is_file():
        parser.error('Each artifact must be an existing file.')
adb = [args.adb] + (['-s', args.serial] if args.serial else [])

def run(parts):
    result = subprocess.run(adb + parts, capture_output=True, timeout=120)
    if result.returncode or b'Permission denied' in result.stdout + result.stderr:
        raise RuntimeError('Device operation failed; no credential output was logged.')
    return result.stdout

def root(command):
    data = run(['shell', 'su -c ' + shlex.quote('set -e; umask 077; ' + command + '; printf "\\nFRAME_OK\\n"')])
    if b'FRAME_OK' not in data:
        raise RuntimeError('Root device operation failed.')
    return data

if root('id').split(b' ')[0] != b'uid=0(root)':
    raise SystemExit('A working root su is required.')
auth = getpass.getpass('RingOS authorization (hidden): ').strip()
if not re.fullmatch(r'Bearer [A-Za-z0-9_./+-]{20,512}', auth):
    raise SystemExit('Enter the full authorization value.')
state = '/data/local/frame-dashboard'
staging = '/data/local/tmp/frame-private-' + secrets.token_hex(8)
root('mkdir ' + staging + '; chown 2000:2000 ' + staging + '; chmod 700 ' + staging)
try:
    root('mkdir -p ' + state + '; chmod 700 ' + state)
    # Install before replacing the native binary; package installation stops its service.
    if b'Success' not in run(['install', '-r', str(args.apk)]):
        raise RuntimeError('APK installation failed.')
    root('if test -f ' + state + '/runtime.pid; then p=$(cat ' + state
         + '/runtime.pid); if grep -q "' + state + '/frame-runtime" /proc/"$p"/cmdline 2>/dev/null; '
         + 'then kill "$p"; fi; fi')
    with tempfile.TemporaryDirectory(prefix='frame-private-') as local:
        artifacts = [('frame-runtime', args.runtime.read_bytes(), '700'),
                     ('bootstrap.json', args.bundle.read_bytes(), '600'),
                     ('ringos.authorization', auth.encode(), '600')]
        for name, data, mode in artifacts:
            file = Path(local) / name
            file.write_bytes(data)
            file.chmod(0o600)
            run(['push', str(file), staging + '/' + name])
            root('cp ' + staging + '/' + name + ' ' + state + '/' + name
                 + '.new; chmod ' + mode + ' ' + state + '/' + name + '.new; mv '
                 + state + '/' + name + '.new ' + state + '/' + name
                 + '; rm ' + staging + '/' + name)
    run(['shell', 'am start -n com.wesbos.homehq/.MainActivity '
         '-a android.intent.action.VIEW -d '
         + shlex.quote('http://127.0.0.1:18773/?lite=1#control') + ' --ez tailscale false'])
    print('Installed standalone dashboard. Credentials remain private on this frame.')
finally:
    root('rm -f ' + staging + '/ringos.authorization ' + staging + '/bootstrap.json '
         + staging + '/frame-runtime; rmdir ' + staging)
