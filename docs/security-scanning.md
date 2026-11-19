

Every push to `ZAP-test` runs the **ZAP active security scan** GitHub Actions
workflow. There is no path filter, so documentation and configuration updates
trigger it too. You can also use **Run workflow** when GitHub makes the manual
dispatch button available (the workflow must exist on the default branch).
No repository secrets or external deployment are required.

The two independent jobs build the checked-out commit using the production
Dockerfiles and start a disposable PostgreSQL, Redis, Django, and Nuxt stack.
The Nuxt image is built with its API proxy pointing to the scan backend.
No service ports are published to the host. The stack has its own Compose
project, network, and database volume; it does not use your development database
or AWS environments. Email goes to container logs and Google OAuth is disabled.

- **web:** `zap-full-scan.py` crawls the frontend with traditional and Ajax
  spiders, then runs an active scan.
- **api:** `zap-api-scan.py` imports `/api/openapi.json` through the frontend
  proxy and actively scans the API operations, including ones a crawler cannot
  discover. The import target is overridden to the disposable frontend.

These are **unauthenticated scans**. Protected operations may return 401/403;
this does not validate behavior inside a signed-in session. Authenticated
coverage would require scan accounts, session/token handling, and seeded data.
The scan stack uses HTTP, so these reports do not assess production TLS.

## Results

Open **Actions → ZAP active security scan → the run → Artifacts** and download
`zap-web-…` and `zap-api-…`. Each contains an HTML report, a JSON report, and
application logs. Reports and logs are uploaded even when a scan fails, when
available, and kept for 14 days.

ZAP's scripts use these exit codes: 0 passes, 1 indicates a rule
configured as FAIL, 2 indicates warnings, and 3 indicates a scan error. Any
nonzero result fails the workflow. By
default, ZAP categorizes findings as warnings, so **any reported warning makes
the job fail**. No findings are suppressed. Review the HTML report to distinguish
findings from scanner errors. A red job does not itself prove exploitability.

Each active scan has a 15-minute scan budget. Traditional and Ajax crawling
are limited to two minutes each for the web scan. `-T 5` bounds ZAP startup and
passive-scan waiting, not the active scan. Each job has a 60-minute overall
timeout. A scan time budget can limit coverage; increase it when needed.
The official `stable` ZAP image receives updates, so scanner behavior can change
between runs even if the application does not.

## Run locally

Use this standalone Compose file, without adding the development Compose file.
Active scans send attack payloads and may modify application data; keep the
targets pointing at the disposable stack.

```sh
docker compose -f docker-compose.zap.yml up -d --build --wait --wait-timeout 300 db redis backend frontend
```

Create `zap-reports` first. On Linux/macOS/Git Bash:

```sh
mkdir -p zap-reports
chmod 777 zap-reports
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force zap-reports
```

Then run each scan (a nonzero exit status can mean findings; see above):

```sh
docker compose -f docker-compose.zap.yml run --rm -T zap
docker compose -f docker-compose.zap.yml run --rm -T zap zap-api-scan.py -t http://frontend:3000/api/openapi.json -f openapi -O http://frontend:3000 -T 5 -z "-config ascan.maxScanDurationInMins=15" -r api.html -J api.json
```

Read the HTML files in `zap-reports`, then remove the scan stack and its data:

```sh
docker compose -f docker-compose.zap.yml down --volumes --remove-orphans
```

References: [ZAP full scan](https://www.zaproxy.org/docs/docker/full-scan/),
[ZAP API scan](https://www.zaproxy.org/docs/docker/api-scan/).
