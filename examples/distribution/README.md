# Browser distribution examples

These complete HTML files use the HiGHS engine with no WASM URL configuration.
They require the new browser distribution; published version 0.1.1 does not contain it.

From the repository root:

```sh
npm ci
npm run build:browser
cp -R dist/browser examples/distribution/washi
python3 -m http.server 8000 --directory examples/distribution
```

Open `http://localhost:8000/esm.html` or `http://localhost:8000/script.html`.
Both should report `Optimal`, objective `1100`, `x = 20`, `y = 10`.
The checkbox allows testing Worker and main-thread solves. Keep the entire
`washi/` directory, including JS chunks, Worker, WASM and license, together.
After the build/copy, serving and solving need no external network or cached assets.
Use HTTP, not a `file://` URL. The copied directory is generated and gitignored.

## CodePen

After publishing a release containing `dist/browser`, add this version-pinned URL
in **Settings → JavaScript → External Scripts**:

```text
https://cdn.jsdelivr.net/npm/@ohtaman/washi@VERSION/dist/browser/washi.min.js
```

Replace `VERSION` with that release. Copy the body elements from `script.html`
into the HTML panel, and the code inside its second `<script>` into the JS panel.
The global API is `Washi`; no npm install or import statement is needed.
For the simplest demo, remove `checked` from the Worker checkbox to start on the
main thread. Worker execution from a CDN needs CORS plus CSP permission for the
CDN and a Blob module Worker (`worker-src blob:`). If the host blocks that,
leave the checkbox off. A main-thread solve can block the UI during long solves.

The loader resolves WASM and Worker beside the chosen script/module URL. It does
not silently switch to another CDN. The explicit CDN version above needs network
access and is not the offline distribution method.
