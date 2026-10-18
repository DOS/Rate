# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue, discussion or pull request for a security problem.

Report it privately through GitHub private vulnerability reporting:

1. Open the [Security tab](https://github.com/DOS/Rate/security) of this repository.
2. Click **Report a vulnerability** (direct link: <https://github.com/DOS/Rate/security/advisories/new>).
3. Describe the issue, the affected component (`apps/web`, `apps/extension`, `apps/importer`, `packages/*`), steps to reproduce and the impact.

Only the maintainers can see the report. We aim to acknowledge it within 3 business days and keep you updated in the advisory until it is resolved. Please allow a reasonable time for a fix before any public disclosure.

## Scope

- This repository (`DOS/Rate`) and the production site `rate.vn`.
- Secrets or credentials present in this repository or its history.

Do not run load tests or attacks that degrade the service for other users, and do not access or modify data that is not yours.

## Supported versions

Only the latest code on the `dev` branch and the current deployment of `rate.vn` receive security fixes.
