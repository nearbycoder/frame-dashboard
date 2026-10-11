import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The wall tablet runs Android WebView 106 — keep JS output within Chromium 106.
// CSS targets chrome61 on purpose: the tablet's WebView rejects 4/8-digit hex colours (#0000,
// #ffffffbf) even though Chrome 106 should support them, and a newer target lets the minifier
// rewrite transparent/rgba() into that form. Verified on-device with CSS.supports().
export default defineConfig({
  plugins: [{
    name: 'dashboard-source-commit',
    apply: 'build',
    transformIndexHtml() {
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
      }).trim();
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid dashboard source commit.');
      return [{ tag: 'meta', attrs: { name: 'dashboard-commit', content: commit }, injectTo: 'head' }];
    },
  }],
  build: {
    // Retain hashed assets so displays using the previous release stay usable.
    emptyOutDir: false,
    target: 'chrome106',
    cssTarget: 'chrome61',
  },
  server: { host: true },
});
