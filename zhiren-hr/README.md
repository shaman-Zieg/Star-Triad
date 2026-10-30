# 知人 Zhiren: recruitment, talent and organization toolkit

Zhiren (知人, from 知人善任, "know people, place them well") is a web application for HR and organization development. It turns established HR practice into tools you can use day to day: structured interviewing, the 9-box talent review, 70-20-10 development plans, Weisbord Six-Box and 7S diagnosis, RACI, and statutory calculators. The interface is bilingual (中文 / English) and works in light and dark themes, from desktop down to phone width.

- **No install step.** Node.js built-ins only (HTTP server and `node:sqlite`); no `npm install` needed.
- **Transparent rule engines.** Every score (resume fit, flight risk, survey bands, training priority) shows the evidence behind it. The engines live in `public/js/engine/` and are shared by the browser, the seed script and the tests.
- **Optional Claude assistance.** With an Anthropic API key, reports get an "AI analysis" button. It is off by default.
- **Realistic demo company.** 星海科技 / Xinghai Tech: 72 active staff in 9 departments, 39 candidates with parseable resumes, 4 diagnosis surveys (including two rounds of the engagement pulse) with about 140 anonymous responses, and service requests, courses, development plans and succession plans. All dates are relative to today.

## Quick start

Requires **Node.js 22.13 or newer** (developed on Node 24).

```bash
cd "D:\青\千问比赛\zhiren-hr"
npm start
```

Open http://localhost:3200. On first run the database is created and seeded (`data/zhiren.db`); an existing database is kept as it is.

There is no sign-in. Use the **Acting as** menu in the top bar to choose who you are; it only drives attribution (activity feed, notes, requests). Run it on a trusted network only.

## Modules

| Module | Tools |
|---|---|
| **Dashboard (工作台)** | Headline metrics (headcount, open roles, turnover, eNPS, high potentials, training, requests, succession coverage), automatically detected issues, hiring funnel, headcount by department, joiners vs leavers, activity feed |
| **Recruitment (智能招聘)** | Job requisitions with funnels and ranked candidates; drag-and-drop pipeline with offer, reject-reason and hire steps (hiring creates the employee record and an onboarding plan); candidate assessment with a weighted fit score, matched/missing skills, risks and interview probes; batch resume screening with CSV export; structured interview kits (STAR questions, red flags, rounds, BARS anchors); multi-interviewer scorecards with calibration flags; JD builder with a compliance and inclusive-language checker |
| **Talent review (人才盘点)** | 9-box grid with drag-to-calibrate and an individual insight per person (observations, hypotheses to verify, owned actions, each citing numbered facts); competency results that name the level band, requirements met, gaps and the next standard (missing ratings stay "not assessed"); succession plans evaluated against a role specification (function, level, critical competencies, key skills) with eligibility checks, an explained score, preferred successor only when suitable, coverage, concentration warnings and risk-ordered roles; flight-risk list linked to succession (successors for the person's role vs plans where they are a candidate) with actions tied to their own risk factors |
| **Learning & growth (培训发展)** | 70-20-10 development plans generated from competency gaps (or the next level band) with tracked actions; training needs analysis with priorities, a department × competency heatmap and bulk enrollment; course catalog and learners; Kirkpatrick four-level evaluation with Phillips ROI |
| **Org diagnosis (组织诊断)** | Weisbord Six-Box, McKinsey 7S, engagement pulse (with eNPS) and team effectiveness surveys; shareable anonymous survey links; reports with dimension bands, spread, radar, department heatmap (groups under 5 are hidden), lowest/highest items, comments, recommended interventions and a comparison with earlier rounds of the same survey; org chart with span-of-control checks; turnover rate (same basis as the dashboard), leave reasons and tenure; RACI matrices with automatic checks and an unsaved-changes warning |
| **Employee services (员工服务)** | Directory and profiles (talent, learning, requests); service requests with working-day SLAs, assignment to HR staff and threaded replies; policy library with a built-in HR assistant (one box filters the articles or asks a question, answers cite their sources, link to the leave and overtime calculators, and offer to open a request); 30-60-90 day onboarding checklists, created automatically on hire |
| **HR toolkit (HR 工具箱)** | Method library (STAR/BEI, competency iceberg, 9-box, learning agility, succession, 70-20-10, GROW, Kirkpatrick, Six-Box, 7S, five dysfunctions, RACI, 30-60-90), each with steps, pitfalls and a link to its tool; calculators for annual leave, overtime pay, salary bands and compa-ratio, turnover cost, recruiting funnel and headcount plan (the last three start from the company's live records) |

## Optional: Claude AI assistance

```bash
cd "D:\青\千问比赛\zhiren-hr"
npm install                      # installs the optional @anthropic-ai/sdk
set ANTHROPIC_API_KEY=sk-ant-... # PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

The sidebar shows **AI assistance on** when it is configured. AI is used for JD drafting, candidate assessment, tailored interview questions, talent review summaries, development advice, diagnosis reports and the HR assistant. Answers stream from `claude-opus-5-5` with Anthropic's server-side fallback enabled. The server limits AI calls to 20 per minute by default. The rule-based result is always shown first, and the AI version can be compared with it.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3200` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address. On loopback, requests with other `Host` headers are refused (DNS-rebinding protection) |
| `ZHIREN_DB_PATH` | `data/zhiren.db` | SQLite database file |
| `ZHIREN_DEMO` | on | Set to `0` to disable "Reset demo data" |
| `ANTHROPIC_API_KEY` | — | Enables AI assistance (with `npm install`) |
| `ZHIREN_AI_MODEL` | `claude-opus-5-5` | Claude model for AI assistance |
| `ZHIREN_AI_RPM` | `20` | AI requests allowed per minute |
| `ZHIREN_AI` | on | Set to `0` to turn AI off even when a key is present |

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the server (seeds an empty database first) |
| `npm run dev` | Same, restarting when server files change |
| `npm run reset` | Regenerate the demo data (or use **Reset demo** in the sidebar) |
| `npm test` | Engine, API, AI-streaming, talent-review tests (Node's built-in test runner) |
| `node --disable-warning=ExperimentalWarning scripts/validate-talent.mjs` | Talent-review validation report on a copy of the database (never writes to it) |

## How it's built

```
server/
  index.js        HTTP server, security headers, JSON document API, AI endpoint
  db.js           Document store on node:sqlite + activity log
  ai.js           Optional Claude streaming (NDJSON to the browser)
  prompts.js      Prompt builders for each AI task
  seed.js         Deterministic demo company
public/
  js/engine/      Rule engines: competency model and level ladder, skills, resume parsing and
                  matching, JD builder and checker, interviews, talent review, succession
                  evaluation, individual insight, learning, diagnosis models, services,
                  RACI, calculators
  js/views/       One module per area (home, recruit, talent, learning, org, service, toolkit, survey)
  js/core.js      Safe HTML templating, API client, formatting, modal, toast
  js/charts.js    Bars, columns, radar, heatmap and stacked bar with tooltips and table views
  js/i18n.js      Language switch and shared vocabularies
  css/app.css     Design tokens (light/dark) and components
test/             node:test suites
scripts/          validate-talent.mjs (validation report on a database copy)
docs/             Validation records
```

**Fair and safe by design**

- Resume scoring never uses age, gender, marital status or school prestige; the JD checker flags wording that is discriminatory under PRC law (gender, marital status, hepatitis B, ethnicity, age, household registration) or exclusionary.
- Survey responses never record who answered. Department breakdowns are hidden below 5 responses, and responses cannot be edited or deleted through the API.
- Output is HTML-escaped by default; a strict Content-Security-Policy blocks inline scripts; writes must be JSON (blocks cross-site form posts); CSV exports are protected against formula injection.

## Open-source references

Zhiren is an original application. These open-source HR systems are useful comparisons for scope and data models:

- [OrangeHRM](https://github.com/orangehrm/orangehrm): HR records, leave, time and recruitment
- [Frappe HR](https://github.com/frappe/hrms): HR and payroll on the Frappe framework
- [Horilla](https://github.com/horilla-opensource/horilla): Django HRMS with recruitment pipeline, onboarding and performance
- [OpenCATS](https://github.com/opencats/OpenCATS): applicant tracking

Those projects focus on HR administration and records. Zhiren focuses on the methods layer: helping people make better hiring, talent and organization decisions.

## Limitations

- Statutory rules (annual leave, overtime, probation, notice) follow national PRC regulations; provincial rules and company policies differ, so review the sample policies before use.
- There is no authentication or role-based access; deploy it on a trusted intranet, or put it behind your SSO proxy.
- Resume parsing works on plain text (paste, or `.txt`/`.md` files). PDF and Word resumes need converting to text first.
- SQLite suits a single server; a multi-node deployment would need a server database.
