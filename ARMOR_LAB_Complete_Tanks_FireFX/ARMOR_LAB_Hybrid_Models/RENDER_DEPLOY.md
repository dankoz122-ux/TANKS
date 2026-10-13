# Deploy ARMOR LAB to Render

This package is laid out with `package.json`, `server.cjs`, and `index.html` in the project root.

In Render, create a **Web Service** from the GitHub repository that contains these extracted files at the repository root.

- Root Directory: leave blank
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`

The server listens on `process.env.PORT` and binds to `0.0.0.0`.

Important: upload/extract the contents of this ZIP into the repository; do not commit only the ZIP file. Commit `package.json`, `server.cjs`, `index.html`, `css/`, and `js/` at the repository root. If the files are inside a subdirectory, set Root Directory to that actual directory name as seen on GitHub.
