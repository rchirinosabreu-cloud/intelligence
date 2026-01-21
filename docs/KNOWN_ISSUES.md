# Known issues

## npm install fails in this environment

In this environment, `npm install` returns a `403 Forbidden` when reaching the npm registry. This blocks dependency installation and prevents running or building the app here. Re-running the command in an environment with registry access should resolve it.
