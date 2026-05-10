# Director's Note — TODOS

Deferred work tracked here. Source of truth for "do this later." Items grouped by trigger condition.

---

## After v1 ships AND first paying academy validates demand

- **PortOne / Toss PG integration** — replace bank-transfer + tax-invoice workflow with proper Korean payment-gateway. Trigger: academy #2 signs paid.
- **Capacitor / native app shell** — iOS/Android wrapper around the Next.js webview. Trigger: paying academy explicitly requests offline mode or better camera access. Earliest: month 4.
- **Reference library admin UI with metadata schema** — replace the Google Drive folder + filename convention with a proper admin upload page (level / scene_type / technique_tag fields). Trigger: 2nd academy joins; manual GDrive process won't scale to multi-academy.

## After v1 ships AND coach asks for format flexibility

- **Coach-defined feedback format templates (KaTalk-style importer)** — let coaches upload their existing feedback format (e.g., a screenshot or text sample of their current KakaoTalk feedback messages) and have the AI generate parent-letter output in THAT visual style + tone. Approved v1 design is the card-report style (Approach B from /plan-design-review on 2026-05-09); this TODO is the v2 "make our format match yours" path. **Why it matters:** coach has been sending feedback in KaTalk format for years; parents are conditioned to that format; matching it lowers adoption friction and creates a per-coach moat surface in addition to calibration. **Trigger:** friend explicitly asks for it OR a second academy onboarding stalls because their existing format is too different from card-report. **Distinguishes from calibration moat:** calibration is "AI judges according to coach's pedagogy"; format-template is "AI delivers in coach's existing visual format." Both stack.

## After 3+ academies onboard (multi-academy operations)

- **Pgvector HNSW index** — promote from sequential scan to HNSW index when total reference videos exceed ~1000. Trigger: cumulative ref-video count > 1000.
- **Multi-tenant admin/billing dashboard** — founder is currently running ops manually. Trigger: 3+ paying academies; manual ops eats too much founder time.
- **Structured Korean tone EVAL suite** — upgrade from lightweight 10-sample blind-judging to a 30-50 sample structured EVAL with multiple judges. Trigger: tone disagreements between coaches at different academies emerge, OR 3+ academies onboard.
- **Automated LLM-as-judge for tone fidelity** — Claude / GPT scoring HyperCLOVA outputs in CI. Trigger: prompt-template iteration cadence justifies CI automation (>1 prompt change per week).

## After calibration validates (week-2 kill-criterion passes)

- **Multi-axis scoring expansion (5 axes)** — add diction and body_alignment scoring axes once 3-axis is validated against the friend's tier. Trigger: kill-criterion passes AND friend explicitly asks for finer-grained scoring.
- **Async background processing for evaluations** — replace sync pipeline with queue-based processing. Trigger: monthly evaluation count exceeds ~500 OR videos routinely exceed 5 minutes.

## Indefinitely deferred (premise-locked)

- **B2C parent paywall on grade-detail unlocks** — Premise P3 says monetizing parent anxiety on minor grades is regulatorily fragile. Re-evaluate only if the regulatory landscape changes substantively.
- **Customer-facing AI grading of minors** — Premise P2 says AI grades stay coach-facing internal only. Re-evaluate only with explicit Korean PIPA guidance permitting it.

## Year-1 ops (post-pilot)

- **Annual Korean PIPA compliance audit by external auditor** — once paid revenue exists, get a third-party audit of consent flows, retention, cross-border, and incident-response. Trigger: end of fiscal year 1, or first regulatory inquiry.
- **Vendor data-processing agreements** — confirm Vertex / Gemini / Korean LLM vendor's actual data-processing terms (not just `do_not_train` flags). Codex flagged this as hand-waved in the eng review. Trigger: pre-launch (week 5-6), have legal counsel sign off on specific terms with each vendor.
- **Backup / disaster recovery** — Supabase managed backup is implicit; document RPO/RTO + restore-test once per quarter. Trigger: post-revenue.
- **Plan B embedding path** (Gemini-describe-then-text-embed) — if Vertex multimodal embeddings produce poor cosine signal in production at multi-academy scale, fall back to Gemini description + text embedding. Trigger: cosine-confidence drops below 0.7 average across 100+ evaluations.
