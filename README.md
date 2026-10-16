# QualityGate

QualityGate is a web quality gate for pull requests. It scans a deployed preview
for accessibility, SEO, security headers, broken links, performance, AI search
readiness, and exposed secrets, reports the result on the pull request, and
fails the check when the server-authoritative gate is exceeded. It runs in
GitHub Actions, GitLab CI, and Bitbucket Pipelines.

**Full documentation: [qualitygate.dev/docs](https://qualitygate.dev/docs)**

## Quickstart

1. Create an organization at [app.qualitygate.dev](https://app.qualitygate.dev/signup).
2. Under **Projects → Connect GitHub**, install the QualityGate GitHub App on
   your repository, select it, and add your preview host to **Allowed
   domains** (for example `*.preview.example.com`).
3. Add `.github/workflows/qualitygate.yml`:

```yaml
name: QualityGate

on:
  pull_request:

permissions:
  contents: read
  id-token: write

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - name: Install the scanning browser
        run: npx -y playwright@1.61.1 install --with-deps chromium

      - name: Scan the preview
        uses: QualityGateDev/scan-action@v1
        with:
          url: https://pr-${{ github.event.pull_request.number }}.preview.example.com
```

Open a pull request. QualityGate waits for the preview, scans it in a real
Chromium on your runner, and posts one comment with the findings and the
decision. The step fails when the gate is exceeded, by default on any critical
or serious finding.

Connected repositories need no secret: `id-token: write` lets GitHub sign a
short-lived token proving which repository is asking. To use an API key instead,
create one on the project card, store it as `QUALITYGATE_API_KEY`, and pass it
with `api_key: ${{ secrets.QUALITYGATE_API_KEY }}`. Without the GitHub App, also
grant `pull-requests: write` and set `env: GITHUB_TOKEN: ${{ github.token }}`
so the action can post its comment.

## Inputs

| Input          | Default                | Description                                                                                          |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `url`          | required               | HTTP or HTTPS address to scan. Its host must be one of the project's allowed domains.                |
| `api_key`      | none                   | Project API key. Optional for repositories connected through the GitHub App with `id-token: write`.  |
| `bundle`       | `a11y`                 | `a11y`, `ada`, `seo`, `security`, `links`, `full`, `perf`, `geo`, `seo-deep`, or `secrets-exposure`. |
| `fail_on`      | `critical=0,serious=0` | Limits, or `regression` to fail only on issues the pull request introduced.                          |
| `wait_for_url` | `true`                 | Wait for the URL to return a `2xx` response before scanning.                                         |
| `wait_timeout` | `120`                  | Seconds to wait for the URL.                                                                         |
| `comment`      | `true`                 | Create or update the QualityGate pull request comment.                                               |

## Guides

| Topic                                                                               | What it covers                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [GitHub Actions](https://qualitygate.dev/docs/github-actions)                       | Keyless and API key setups, permissions, triggers, forks, advisory mode |
| [Preview deployments](https://qualitygate.dev/docs/preview-deployments)             | Vercel, Netlify, Render, Cloudflare Pages, your own pipeline, localhost |
| [GitLab CI](https://qualitygate.dev/docs/gitlab-ci)                                 | Released template, Review Apps, merge request notes                     |
| [Bitbucket Pipelines](https://qualitygate.dev/docs/bitbucket-pipelines)             | The QualityGate pipe and pull request comments                          |
| [Multiple pages and sites](https://qualitygate.dev/docs/multiple-pages)             | Matrices over pages, bundles, and monorepo apps                         |
| [Scheduled scans](https://qualitygate.dev/docs/scheduled-scans)                     | Nightly production checks with a separate allowance                     |
| [Merge readiness suite](https://qualitygate.dev/docs/merge-readiness)               | Lint, tests, build, secrets, and PR policy as one required check        |
| [Bundles and checks](https://qualitygate.dev/docs/bundles)                          | What each check inspects and what fails a build                         |
| [Gates and regression mode](https://qualitygate.dev/docs/gates-and-regressions)     | Limits, baselines, and blocking only new issues                         |
| [Organizations and projects](https://qualitygate.dev/docs/account-setup)            | Projects, API keys, roles, plans, and usage                             |
| [Reports and notifications](https://qualitygate.dev/docs/reports-and-notifications) | History, PDF and client reports, report domains, email and Slack        |
| [Troubleshooting](https://qualitygate.dev/docs/troubleshooting)                     | Every error message and its fix                                         |

## Security

QualityGate fails closed: a denied authorization, an unreachable service, a scan
error, an upload error, or a failed gate all fail the step. The pass or fail
decision is computed by QualityGate from the uploaded findings, never by the
runner. Your source code and screenshots never leave your CI; page text is
uploaded only for the `geo` and `seo-deep` bundles, analysed in memory, and not
stored.

`pull_request_target` is intentionally unsupported, because combining its
privileged context with untrusted pull request code can expose repository
secrets and write permissions. See
[GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout).

Automated checks are not a legal or conformance assessment; qualified human
review is still required.

## Developing QualityGate

This repository is a pnpm workspace containing the CI adapters, scan engine,
backend, account app, and landing site. Contributor documentation starts at
[docs/README.md](docs/README.md). The public guides above are written in
`apps/landing/src/content/docs/`.
