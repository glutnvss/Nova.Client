# Nova Launcher

## Get the .exe (no Node.js needed for users)
1. Create a GitHub repo and push this folder to it.
2. Tag a release:  `git tag v1.0.0 && git push origin v1.0.0`
3. GitHub Actions builds on Windows and attaches to the Release page:
   - `Nova-Launcher-1.0.0-nsis.exe`      (installer)
   - `Nova-Launcher-1.0.0-portable.exe`  (single file, no install)
   Share the Release page link. (Run it manually from the Actions tab too.)

Users still need Java 21 and a Java Edition account.

## Developing
`npm install` then `npm start`.
