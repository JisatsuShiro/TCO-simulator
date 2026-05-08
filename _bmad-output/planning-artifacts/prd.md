---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
releaseMode: phased
vision:
  user_is_builder: "Guill is a new SNCF operator who just discovered Gessie — primary user IS the PM. Strong empathy ground."
  install_wall: "Trainees on Mac/Linux/locked-down corporate or school machines can't install Gessie (Windows Electron). Voie Libre removes that wall."
  product_stance: "Subtractive, not additive. v1 = Gessie's experience minus the install. No new features, no scope creep — discipline is the product."
  real_problem: "Training quality is currently gated by which OS your laptop runs. Mac/Linux/restricted trainees get less practice than Windows trainees; that asymmetry compounds across a training cycle."
  future_state: "A new SNCF operator hears about Voie Libre on day 1, opens a URL on their company laptop, and is practicing clelles within minutes — same as a Windows peer. No 'I'll try it at home' deferral, no fade-out."
  why_now: "Guill just lived the install wall as a trainee. Friction fresh, empathy real, skills available, cohort right behind."
  primary_differentiator: "Cross-platform reach via the browser. Not features."
  guardrail: "Fidelity to Gessie matters more than feature surface. A trainee on Voie Libre should not have a 'Gessie does X but Voie Libre doesn't' moment with a Windows peer. The port must be INVISIBLE."
classification:
  projectType: web_app
  domain: edtech
  domainNote: "Professional adult training (railway signaling), not K-12 / classroom edtech. No COPPA/FERPA, no curriculum standards. Closer in spirit to flight or medical-procedure simulators."
  complexity: medium
  projectContext: brownfield
productNarrative:
  audience: SNCF trainee railway operators
  competing_alternative: "Original Gessie (Vue/Electron desktop) — or nothing, for trainees who can't/won't install it"
  core_value_prop: "Lower the barrier to SNCF signaling training: URL > .exe install"
  next_milestone: "Hosted publicly so any trainee with a browser can try it"
  implicit_corollary: "At least one teachable scenario must be solid before deployment, or 'anyone can try it' becomes 'anyone can be confused by it'"
inputDocuments:
  - _bmad-output/project-context.md
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/source-tree-analysis.md
  - docs/component-inventory.md
  - docs/development-guide.md
documentCounts:
  briefCount: 0
  researchCount: 0
  brainstormingCount: 0
  projectDocsCount: 7
projectClassification: brownfield
workflowType: prd
---

# Product Requirements Document - Voie Libre

**Author:** Guill
**Date:** 2026-05-02

## Executive Summary

**Voie Libre** is a faithful web port of **Gessie**, the SNCF railway-signaling
training simulator (Vue + Electron desktop). The port has one job: erase the
install wall. SNCF trainees on Mac, Linux, or locked-down corporate/school
machines cannot run Gessie today; their Windows-equipped peers can. That
asymmetry compounds across a training cycle into a real practice-hours gap.
Voie Libre closes the gap by making the same simulator accessible at a URL.

**Target user:** new SNCF railway operators in their training cycle. Domain
novices in signaling, not in technology — UX must hold their hand on signaling
concepts, not on tooling. The PRD's lead author is himself a new operator who
hit the install wall on day one; product empathy is lived, not assumed.

**Problem solved:** today, training quality is gated by which OS a trainee's
laptop runs. The simulator is excellent; its distribution is not. Voie Libre
removes the OS gate so every trainee gets the same number of practice hours
regardless of hardware.

### What Makes This Special

Voie Libre is **subtractive, not additive.** v1 does not add features to Gessie;
it removes the install. Cross-platform parity *is* the product. The discipline
to ship that — and only that — is the differentiator: most ports drift into
"while we're here, let's also ___" and never land. Voie Libre refuses the drift.

**Core insight:** the bottleneck on trainee proficiency is *who can run the
simulator*, not *what the simulator does*. Reach is the missing factor. A
Mac/Linux trainee with a URL accumulates more practice than the same trainee
asked to install Electron — and more practice is the only thing that produces
better operators.

**Non-goal — explicit:** new features, editor mode, multiplayer, mobile-first
UX, scenario authoring, persistence/accounts. These may earn a place in v2+;
they are out of scope until the URL-vs-install gap is closed for the current
cohort. Fidelity to Gessie behavior is the floor and the ceiling for v1.

**Guardrail:** the port must be **invisible**. A trainee on Voie Libre sitting
next to a Windows peer on Gessie should never have a "wait, Gessie does X but
Voie Libre doesn't" moment on a station they're both practicing. Behavioral
parity on supported scenarios is the non-negotiable quality bar.

## Project Classification

| Dimension | Value |
|---|---|
| **Project type** | Web app (single-page React 19 SPA, browser-only, no SSR/router/auth) |
| **Domain** | Edtech — *professional adult training of railway operators*. Not K-12 / classroom edtech. No COPPA/FERPA, no curriculum standards, no LMS integration. Closer in spirit to flight or medical-procedure simulators. |
| **Complexity** | Medium. Bounded scope (single-station, single-trainee); no regulatory regime; high engineering fidelity requirement (railway interlocking is silent-failure on incorrect inputs) but that constraint is already absorbed by the existing port. |
| **Project context** | Brownfield — POC port exists. PRD scopes the delta from "POC works locally for the author" to "trainee can land on a URL and learn." |

With the project framed, the rest of this PRD specifies how we will know
v1 succeeded, what trainees will experience, and what is in or out of
scope.

## Success Criteria

### User Success

The single user-success milestone for v1 is the **first-train moment**: a
trainee landing cold on the URL successfully runs one train end-to-end —
clicks a lever, sees the signal change, watches the train move through the
station. That moment is the "yes, I get it" beat that earns a return visit.

Success criteria, ordered by load-bearing-ness:

1. A trainee on Mac, Linux, or a locked-down corporate/school browser opens the
   URL and reaches an interactive TCO without errors.
2. From cold open, the trainee can complete the first-train moment without
   external instructions. (Onboarding must deliver this — see MVP scope below.)
3. A trainee using Voie Libre side-by-side with a Windows peer using Gessie on
   the supported MVP stations encounters **no behavioral parity break** — no
   "wait, Gessie does X but Voie Libre doesn't" moment.
4. The trainee comes back. A second session is the proof that the first had
   value. (Tracked as a personal/qualitative signal, not as a metric — see
   Business Success below.)

### Business Success

This is a personal-and-cohort project, not a commercial product. We are
honest about that: there are no revenue metrics, no growth funnels, no
acquisition cost targets.

- **3-month win:** the deployed URL exists, is accessible cross-platform, and
  is used by **the lead author plus ~5 trainees in their cohort**, on the two
  MVP stations, without significant friction reports.
- **12-month signal of "this took":** at least one mention by a trainee outside
  the immediate cohort (forum/Discord/word-of-mouth), or a training-center
  bookmark — qualitative, not numeric.
- **Sustainability:** hosting cost = €0 / month (static hosting on Netlify /
  Vercel / GitHub Pages). The project must survive the lead author's training
  cycle without active maintenance — i.e., no servers, no databases, no
  recurring renewals beyond a domain name (optional).

We will not invent metrics that do not matter to the lead author. Numbers are
a vanity dial here; the real signal is whether the URL is the link a trainee
sends a peer when "have you tried Gessie?" comes up.

### Technical Success

1. **Cross-platform open:** the production URL renders and is interactive in
   current Chrome, Firefox, Safari, and Edge on macOS, Linux, and Windows.
   No browser, OS, or screen-size combo in that matrix shows a dealbreaker bug.
2. **Behavioral parity** with Gessie on the MVP stations
   (`saint_saturnin`, `amvville`): every operator action exposed in the UI
   produces the same observable outcome (signal state, lever refusal, train
   movement, disturbance behavior) as the original Electron app. Visual
   fidelity is desirable but parity of *outcomes* is the floor.
3. **No persistence-dependent features.** Refresh = reset. This is a guardrail,
   not a goal: it makes deployment trivial and bug reports reproducible.
4. **Build = the merge gate.** `npm run lint && npm run build` must pass on
   `master` at all times. No tests are required for v1 (deliberate POC scope).
5. **Static hosting compatible.** The `dist/` output must serve correctly from
   any flat-file CDN/static host, including with paths under a non-root
   subdirectory if needed (e.g., GitHub Pages project sites).

### Measurable Outcomes

| Outcome | How we know |
|---|---|
| Cross-platform open works | Manual smoke test on Mac/Linux/Windows in Chrome + Firefox before each public-URL update |
| Parity on MVP stations | Side-by-side comparison with Gessie: golden path + 3 known disturbance scenarios per station, no observable divergence |
| First-train moment achievable cold | One unfamiliar trainee from the cohort runs the URL with no prior briefing and reaches the first-train moment within ~5 minutes |
| Cohort uses it | Lead author + ~5 cohort peers actively practicing on the URL within 3 months of public deployment |
| Hosting sustainability | One-time deploy cost = €0; recurring cost = €0 (or domain-only) |

## Product Scope & Phased Development

### MVP Strategy & Philosophy

**MVP type: Experience MVP.** The MVP is not problem-solving (the simulation
already exists and works), not platform (no APIs to build on), not
revenue-validation (no money), and not concept-validation (we know the
audience wants the thing — the lead author *is* the audience). The MVP
exists to demonstrate that **the same experience holds on a different
distribution channel**: same simulator, same fidelity, no install.

This framing has consequences. It means we are *not* learning whether the
problem is real (it is). We are learning whether the solution is *reachable*
on the new channel — i.e., whether trainees on Mac/Linux/locked-down
machines can complete the first-train moment as readily as a Windows
peer on Gessie. That is a smaller, sharper learning loop than a typical
MVP.

**Resource model: solo, time-bounded by the lead author's training cycle.**
Voie Libre has one developer who is also a trainee. He has limited
discretionary time and will exit the cohort when training ends. Two
implications:

1. **MVP must ship while the lead author is still demonstrably in the
   user role.** Otherwise the user-as-builder feedback loop closes
   before validation completes.
2. **After exit, the project must survive passively.** Zero-cost static
   host, no databases, no recurring renewals. No active maintenance
   required for the URL to keep serving.

### MVP — Phase 1

The smallest thing that delivers the value proposition.

**Core user journeys supported:** A (cold visitor success), B (gets
stuck), C (deploy and verify parity), D (returning trainee).

**Must-have capabilities — committed:**

- Public deployment to a free static host (Netlify / Vercel / GitHub
  Pages). Choice deferred to architecture step.
- Behavioral parity with Gessie on **`saint_saturnin`** and **`amvville`**,
  verified via the side-by-side check from Journey C. Other stations
  may load and partially work — they are explicitly out of MVP guarantee.
- Default station changed from `clelles` to a cohort station (decision
  in UX/architecture step; current preference: `saint_saturnin`).
- Cold-visitor onboarding cue. Form factor TBD; constraints: dismissable,
  doesn't re-prompt every load, gets a cold visitor to the first-train
  moment without external instructions.
- Cross-browser smoke matrix as a documented checklist (Chrome / Firefox
  / Safari × macOS / Linux / Windows; <10 min manual run).
- `npm run lint && npm run build` continues to pass on `master` at all
  times.

**Must-have capabilities — conditional ("MVP if cheap"; trigger named):**

- Refused-action feedback beyond red flash (one-line FR explanation at
  the refusal site).
- Reset-without-page-refresh affordance scoped to current station.

  **Trigger to upgrade these to required (not optional):** if the
  first cohort cold-visit (Léa-shaped) results in confusion or
  drop-off attributable to silent refusal or no-reset-path, both
  become required for v1 ship. Otherwise they may slip to early
  Phase 2.

### Phase 2 — Growth (Post-MVP)

After the MVP URL exists, is used, and the parity claim holds.

- Behavioral parity expanded to remaining stations (clelles, jarze,
  vif, monestier_v3, monestier, la_presle, montfort_sur_meu, aville_p2,
  passyle_st_jean).
- Shareable scenario URLs (introduces a router; static-host choice in
  Phase 1 must keep this unblocked).
- Glossary / hover-help layer for SNCF terminology.
- Bug-report path that captures station + state for reproduction.
- Escape hatch ("I am stuck") link to peer/forum.
- Embed support (iframe-friendly) for course-page hosting.

### Phase 3 — Vision (Future)

Open-ended; may earn scope later.

- Editor mode (create/edit stations in-browser).
- Multiplayer drill (two trainees observing or collaborating).
- Mobile-first / touch-first UX.
- Scenario authoring (custom drills, disturbance recipes).
- Persistence / accounts.
- WCAG accessibility audit and remediation.

### Risk Mitigation Strategy

**Technical risks**

- *Parity-verification scaling.* Each station added expands the test
  surface (golden path + 3 disturbance scenarios per station per
  release). **Mitigation:** MVP at 2 stations; do not promise parity
  on stations not yet verified. Phase 2 adds stations one at a time,
  each with its own verification pass.
- *Static-host SPA-fallback gotcha.* Phase 2's shareable URLs require
  the host to serve `index.html` for unknown subpaths. **Mitigation:**
  pick a host in MVP that supports SPA fallback natively (Netlify and
  Vercel do; GitHub Pages requires a `404.html` workaround).
- *Telemetry door closable by accident.* MVP ships zero analytics, but
  later instrumentation needs a clear path. **Mitigation:** no
  aggressive Content-Security-Policy that forbids first-party scripts.
  Hosting plan billed per-deploy, not per-request.

**Market / adoption risks**

- *Trainees never hear about it.* Distribution is word-of-mouth.
  **Mitigation:** lead author shares the URL in his cohort on ship day.
  If no organic spread by 3 months, the validation framework re-opens
  rather than the feature scope.
- *Trainees bounce at Journey B.* Refusal-confusion is the
  highest-probability failure mode. **Mitigation:** the
  conditional-MVP capabilities upgrade to required upon a cohort-signal
  trigger (see MVP § conditional).
- *Trainees see less polish than Gessie.* Visual fidelity is desirable;
  *outcome* parity is the floor. **Mitigation:** named explicitly in
  Technical Success; we do not promise pixel-for-pixel visual match.

**Resource risks**

- *Lead author exits the cohort.* Training ends, user-as-builder
  loop closes. **Mitigation:** ship MVP before exit. After exit, the
  project enters maintenance-only mode; no new feature commitments.
  Zero-data architecture and free static hosting mean the URL keeps
  serving with no active developer.
- *Solo developer, no team.* No code review, no QA, no on-call
  rotation. **Mitigation:** lint+build merge gate is the correctness
  floor; the documented cross-browser smoke matrix from Journey C is
  the regression gate. We do not pretend a team-grade quality
  apparatus exists.
- *Discretionary-time variability.* Solo and trainee. Effort capacity
  is not predictable week-to-week. **Mitigation:** scope is biased
  toward "ships in N weekends" not "ships on M-month roadmap." The
  conditional-MVP tag is a release valve specifically for this risk.

## User Journeys

### Journey A — Léa, cold first-time visitor, success path

**Persona:** Léa Robert, 22, first-year SNCF trainee in a French CFA. Owns
a MacBook for personal study; uses a locked-down Windows PC at the training
center. Heard about Gessie from a peer; tried to install it at training
center (blocked) and at home (no clean Mac path). Gave up. Last week, a peer
sent her a URL to "Voie Libre." Tech-comfortable enough to use a browser,
not a developer.

**Opening scene.** Sunday evening, kitchen table, MacBook open. The peer
chat tab is still showing the link. Léa is hopeful but cautious — she has
been let down before.

**Rising action.** She clicks the link. The page loads in under three
seconds. A TCO appears: rails, signals, switches, controls. She does not
recognize most of it; signaling vocabulary is still new. A brief onboarding
cue (form TBD — overlay, hint strip, or splash) tells her, in one short
phrase, *"click a lever to route a train, then watch it move."* The default
station presented to her is one her cohort actually uses (saint_saturnin
or amvville — not clelles); she has at least one anchor she has heard of.

**Climax.** She clicks a lever in the operator panel. The lever badge
flips from `+` to `−`. A signal in the TCO changes color. She launches
the simulation and a train glides through the layout. **The first-train
moment lands.** It feels real, and it feels hers — same as her Windows
peers had, with no install.

**Resolution.** She closes the laptop with "I get it now" energy. She
intends to come back. (Whether she does is Journey D.)

**Capabilities revealed:**
- Sub-three-second time-to-interactive on cold load.
- Default station chosen for cohort relevance, not legacy code default.
- A *single*, dismissable onboarding cue that names the first-train moment
  in plain language.
- Cross-platform rendering correctness on macOS Safari/Chrome/Firefox.
- The existing first-train flow polished to remove rough edges (e.g.,
  obvious "Lancer simulation" affordance, visible lever-to-signal causality).

### Journey B — Léa, gets stuck

**Opening scene.** Tuesday evening, her bedroom. Léa has used Voie Libre
twice now. Tonight she wants to try a more involved scenario — she heard
her instructor mention "fermeture de carré" and she wants to see one.

**Rising action.** She clicks a lever. Nothing visibly happens. She clicks
another. A red flash, then nothing. She is not sure whether the simulator
refused her, whether she misunderstood the scenario, or whether the page
is broken. She tries to "undo" — there is no undo. She tries to reset —
there is no obvious reset.

**Climax.** She is one of three things away from giving up: (a) she finds
a way to start the scenario over without refreshing the page, (b) the
silent-refusal red flash carries enough context for her to guess why, or
(c) she gives up and assumes the simulator is buggy. Outcome depends on
what we ship.

**Resolution (target).** She finds a "reset" or "restart scenario"
affordance, and a context-aware tooltip on the refused lever that names
the constraint ("levier 2 minus bloque ce mouvement"). She tries again.
She does not need to call Guill. She does not need to refresh the page.
She does not feel stupid.

**Capabilities revealed:**
- A reset-without-page-refresh affordance, scoped to the current station.
- Refusal feedback that goes beyond a red flash: a one-line *why* in plain
  language, attached to the refused operator action.
- A glossary or hover-help layer for SNCF terminology (post-MVP if MVP
  cannot fit it; mandatory if MVP cohort regularly hits unfamiliar terms).
- An escape hatch: "I am stuck" → Discord/forum link or peer-message
  template (post-MVP).

### Journey C — Guill, deploys and verifies parity

**Opening scene.** Saturday morning. `master` is green. `npm run lint &&
npm run build` is clean. The new feature (or fix) is in.

**Rising action.** Guill builds locally, runs the static `dist/` against
a preview server. He opens it in Chrome on Windows, Firefox on Linux (a
cheap VM or his other laptop), and Safari on macOS. He side-by-sides
Voie Libre and Gessie on `saint_saturnin`: golden path, then three known
disturbance scenarios. Same on `amvville`. No observable divergence.

**Climax.** He pushes to the static host (Netlify / Vercel / GH Pages —
to be chosen). The new URL responds. He opens it on each browser/OS
combo one more time, this time as the *deployed* artifact rather than
local. Still clean.

**Resolution.** He posts the link in the cohort chat. Done in under an
hour, no dashboards, no servers.

**Capabilities revealed:**
- One-command (or one-button) deploy from the existing build artifact.
- A parity-verification checklist (golden path + 3 disturbance scenarios
  per MVP station) that fits on one page.
- A cross-browser smoke matrix (Chrome/Firefox/Safari × macOS/Linux/Windows)
  that takes < 10 minutes to run manually.
- Deploy infrastructure that survives Guill's training cycle without
  active maintenance.

### Journey D — Léa, returns for session 2+

**Opening scene.** Wednesday lunch break, training center. Twenty minutes
free. Léa has ten more days until a practical exam where she will need
to read a TCO without hesitation. She opens the Voie Libre bookmark.

**Rising action.** Page loads in under three seconds. The default station
is the one she practiced on Sunday — she has continuity, even though
nothing is persisted, because the default was chosen for her cohort.
The onboarding cue from Journey A does **not** re-block her path; it is
either gone after first dismissal (cookieless, session-only, fine) or
quiet enough to ignore. She runs three drills — first-train, then a
disturbance she struggled with, then another. She closes the tab.

**Climax.** This is where Voie Libre either earns its place in her habit
loop or fades. The deciding question is: did her twelve minutes feel
like *practice*, or like *figuring out the tool*? If it was practice, she
will be back tomorrow. If it was figuring out the tool, she will not.

**Resolution.** Habit forms — or doesn't. We are aiming for forms. The
specific test: at the end of session 2+, did she think about the
*signaling* or did she think about the *interface*?

**Capabilities revealed:**
- Onboarding that does not re-prompt on every visit. Cookieless dismissal
  is acceptable (a refresh = welcome again is acceptable for v1).
- Fast time-to-interactive on warm cache (< 1.5s target).
- A *visible* return to the place she practiced last (default station =
  cohort station; advanced "resume specific scenario" via shareable URL
  is post-MVP, not MVP).
- Disturbance scenarios that are reachable in two or fewer clicks from
  cold open. If the path to a hard drill is twelve clicks deep, Journey
  D fails on busy days.

### Journey Requirements Summary

Capabilities the four journeys collectively demand:

| Capability | Journeys that need it | MVP / Post-MVP |
|---|---|---|
| Public URL with sub-3s cold-load time-to-interactive | A, D | MVP |
| Cross-platform rendering (macOS / Linux / Windows; Chrome / Firefox / Safari / Edge) | A, B, C, D | MVP |
| Default station = cohort station (`saint_saturnin` or `amvville`), not `clelles` | A, D | MVP |
| Single, dismissable cold-visitor onboarding cue that names the first-train moment | A, D | MVP |
| Behavioral parity with Gessie on MVP stations, verifiable in < 10 min | C | MVP |
| Cross-browser smoke matrix as a documented checklist | C | MVP |
| One-command/one-button deploy to a free static host | C | MVP |
| Refused-action feedback that goes beyond red flash (a *why*, in plain FR) | B | MVP if cheap; otherwise top of post-MVP |
| Reset-without-page-refresh affordance scoped to current station | B | MVP if cheap; otherwise top of post-MVP |
| Onboarding that doesn't re-prompt on every load (cookieless / session is fine) | D | MVP |
| Glossary / hover-help for SNCF terminology | B | Post-MVP |
| Escape hatch ("I am stuck") link to peer/forum | B | Post-MVP |
| Shareable scenario URLs to resume specific drills | D | Post-MVP |

## Domain-Specific Requirements

Voie Libre's domain — adult professional training in railway signaling — has
**no regulatory or compliance surface** of the kind that would normally fill
this section. We document the absence explicitly, with the trade-offs that
made it so.

**v1 explicitly does not require:**

- **Data privacy / GDPR compliance scaffolding.** v1 captures zero user data:
  no accounts, no cookies needing consent, no telemetry, no PII. Refresh
  resets all state. This is not an oversight — it is the simplest path to
  ship and the simplest path to host.
- **Safety-critical software certification.** Voie Libre is a training tool.
  It cannot dispatch real trains and is not subject to DO-178-style or
  EN 50128-style certification regimes that apply to operational signaling
  software.
- **K-12 educational compliance** (COPPA / FERPA / curriculum standards /
  LMS integration). Users are adult professional trainees; there is no
  school-system contract.
- **WCAG / accessibility certification.** Deferred to post-MVP. v1 is
  *unverified* against WCAG criteria. We acknowledge this gap honestly: web
  products attract more accessibility scrutiny than desktop ones, and SNCF
  trains people with disabilities. The defer is a deliberate scope choice,
  not a denial that this matters. Re-opens at v2 if a cohort member surfaces
  a need or if the project is adopted formally (see next item).

**v1 explicit assumptions that may break later:**

- **Informal-use mode only.** v1 is something a trainee uses on their own
  time, not a tool an SNCF training body has officially adopted. Formal
  adoption — if it ever happens — likely invokes a vetting/hosting/domain
  conversation we are not having today. The architecture should avoid
  decisions that are *hard* to reverse if a formal-adoption conversation
  starts (e.g., do not lock in a hosting region or domain that would
  exclude such a conversation).
- **Anonymous telemetry door, kept open.** v1 ships zero analytics. But the
  product roadmap eventually wants to know things like "what fraction of
  cold visitors reach the first-train moment?" — i.e., privacy-respecting,
  anonymous, non-PII telemetry. v1 must therefore avoid choices that *block*
  later instrumentation: do not ship a CSP that forbids first-party
  analytics scripts at all; do not pick a host that bills per request and
  punishes a click event; structurally keep dispatch points (e.g., the
  store's `dispatchPlayerEvent` table) as natural future emit-sites.

**French-language UI is a fixed constraint.** All user-facing strings —
labels, tooltips, error messages, onboarding cues, help text — are in
French. The cohort is French-speaking SNCF trainees; an English UI is not
under consideration for v1. (Code, comments, and developer docs follow the
existing project convention: French comments on French-domain code, English
on neutral infrastructure.)

**Behavioral fidelity to Gessie** is the only non-negotiable constraint
worth restating here, but it is a *product* guardrail, captured under
Technical Success, not a domain compliance requirement. We leave it there.

## Innovation & Novel Patterns

### Detected Innovation Areas

Voie Libre does not introduce technical innovation. The novelty, such as it is,
lives in the *combination* applied to a narrow vertical:

1. **First web-delivered SNCF railway-signaling simulator.** In the niche of
   French SNCF signaling training tools, Voie Libre may be the first artifact
   a trainee can open with a URL alone, no install. This is novelty in the
   vertical, not in software at large.
2. **Subtractive port discipline.** Most desktop-to-web ports drift into
   feature additions; Voie Libre explicitly refuses. The feature surface at
   v1 is constrained to ≤ Gessie's. The discipline itself is the
   differentiator.
3. **User-as-builder operating model.** The lead author is himself an SNCF
   trainee. The product reflects choices a non-trainee builder would not
   plausibly make (e.g., default station = cohort station; no scope drift
   into editor mode). This affects how the PRD is executed and validated.

### Market Context & Competitive Landscape

The competing artifact is **original Gessie** (Vue + Electron, Windows-leaning
distribution). Voie Libre is not a market product; it is a delivery vehicle
for the same simulator on machines Gessie cannot reach. There is no "market"
in the commercial sense.

### Validation Approach

Validation reuses the metrics already in Success Criteria — no new
instrumentation needed for the innovation claims:

- Web-delivery niche-first: validated when a cohort peer asks "how can I
  practice on my Mac?" and the answer they receive is the Voie Libre URL.
- Subtractive discipline: validated at v1 ship date. Feature surface
  strictly ≤ Gessie's. Anything added has a written rationale.
- User-as-builder loop: validated by retrospect — at 3 months, can the lead
  author point to scope decisions that came from his own training experience
  and not from theory?

### Risk Mitigation

- **Risk:** subtractive discipline erodes silently as polish requests pile
  up. **Mitigation:** the PRD's explicit non-goal list is the line; any
  request that adds feature surface goes to the Growth/Vision sections
  before code.
- **Risk:** "first web-delivered SNCF simulator" turns out to be wrong (some
  obscure prior art exists). **Mitigation:** claim is framed as
  "may be the first" and is dispensable — does not affect any other PRD
  decision.
- **Risk:** user-as-builder advantage fades when the lead author finishes
  training and is no longer in the cohort. **Mitigation:** acknowledged
  explicitly in the post-MVP roadmap (the project must survive the lead
  author's training cycle without active maintenance — see Business
  Success / Sustainability).

The remaining sections move from product framing into platform-specific
technical contracts.

## Web App Specific Requirements

### Project-Type Overview

Voie Libre is a single-page **React 19 SPA** built with **Vite 8**, using
**Zustand 5** for state and inline-styled SVG for the TCO render. There
is no backend, no router, no SSR, no auth, no persistence layer, no
build-time CMS. The deliverable is a static `dist/` directory served by
any flat-file CDN. This is the simplest viable deployment shape, and
keeping it simple is itself a requirement (see Domain Requirements
§ Sustainability).

### Technical Architecture Considerations

The existing layered architecture (`src/sim/` pure → `src/store/`
Zustand bridge → `src/components/` React UI) is a fit-for-purpose v1.
PRD-level direction:

- **No new top-level architectural layers in MVP.** The existing
  sim/store/components separation is the contract; new features choose
  one of those layers, never invent a fourth.
- **No new runtime dependencies in MVP** unless they serve a journey
  requirement directly. The deliberately-boring stack stance from
  `_bmad-output/project-context.md` is upheld by the PRD.
- **Static-host compatibility is non-negotiable.** No build-time
  transformation that requires a server, no API stubbing that assumes a
  Node runtime in production, no dynamic imports of files outside the
  bundled `dist/`. If a feature implies a server, it is not MVP.

### Browser Matrix

*(Restated as the NFR contract in NFR-COMP-1 through NFR-COMP-3.)*

The browser support floor follows **the de-facto target produced by
Vite 8 + React 19** under default configuration. We do not pin a
manual `browserslist` for v1; the toolchain's defaults are accepted as
the contract. In practice this is approximately:

- **Chrome / Edge:** last 2 stable versions (evergreen).
- **Firefox:** last 2 stable versions (evergreen).
- **Safari:** last 2 stable versions on macOS; same on iPadOS to the
  extent the responsive constraint below is met.

OS coverage required: **macOS, Linux, Windows.** macOS is the cohort
priority. Linux is verified because the cohort includes locked-down
school/training-center machines that may run Linux distributions.
Windows is verified because that's where Gessie users live and the
parity-check workflow runs there.

What we do **not** support, explicitly:
- Internet Explorer (any version) — End of life. Not a target.
- Legacy (pre-Chromium) Edge — Not a target.
- Browsers older than ~12 months from a v1 ship date — On the trainee's
  shoulder; we will not polyfill backwards.

Validation: the cross-browser smoke matrix from Journey C runs against
the deployed URL on Chrome+Firefox at minimum on each OS, plus Safari
on macOS, before each public-URL update.

### Responsive Design

v1 is **laptop/desktop optimized; smaller-form-factor non-broken but
non-optimized.**

- **Primary target:** standard laptop viewport, ≥ 1280×720 effective.
- **Smaller viewports (tablet, phone, narrow window):** the page must
  not crash, must not render with overlapping content that obscures the
  TCO, and must allow horizontal scroll if the TCO exceeds the
  viewport width. We do not commit to legible TCO scaling, touch
  affordances, or rotation handling.
- **Mobile-first / touch-first UX is explicitly out of scope for v1**
  (see Product Scope § Vision).

The current `TcoCanvas` implementation already produces SVG content that
scales to its container; the work for v1 is making sure the operator
panels (`LeversPanel`, `BlocsPanel`, etc.) stack legibly when the
viewport is narrow, not that they look pretty there.

### Performance Targets

*(Restated as the NFR contract in NFR-PERF-1 through NFR-PERF-5.)*

| Metric | Target | How verified |
|---|---|---|
| Cold-load Time-to-Interactive | < 3 s on a typical trainee laptop, broadband or institutional Wi-Fi | Manual measurement in Chrome DevTools "Slow 4G" + Fast 3G profiles before each public-URL update |
| Warm-load TTI (cache hit) | < 1.5 s | Manual measurement, second visit |
| Sim tick latency | 1 Hz tick completes within one frame budget (~16 ms) on a typical laptop, no perceptible UI freeze | Visual: clock readout advances smoothly; no audible fan spin-up under simulation load |
| `dist/` total size (gzipped) | < 1 MB; aim for substantially less | Build output inspection per release |

These targets are deliberately conservative. The codebase today is small
and fast; the targets exist to *prevent regression*, not to define a
new high bar.

### SEO Strategy

**There is no SEO investment.** Discovery is via cohort word-of-mouth.
Operationally:

- The site does not block indexing — search engines can crawl if they
  wish. We do not configure `robots.txt` to disallow.
- We do not invest in OpenGraph metadata, JSON-LD schema, sitemap
  generation, or canonical URL strategy.
- Page title and meta description follow Vite-default boilerplate; if a
  trainee shares the URL on a social platform that previews links, the
  preview will be unstyled. This is an accepted v1 limitation.

If Voie Libre ever moves from informal-use to officially-adopted (see
Domain Requirements § Informal-use mode only), this section is the
first to revisit.

### Accessibility Level

*(Restated as the NFR contract in NFR-A11Y-1 through NFR-A11Y-3.)*

v1 is **unverified against WCAG.** This was decided explicitly in the
domain-requirements step.

What this means concretely for v1:

- **No active commitment** to keyboard-only navigation, screen-reader
  support, color-contrast minimums, or `prefers-reduced-motion`
  respect. We are not certifying any of those today.
- **No active anti-pattern.** We do not deliberately remove existing
  accessibility hooks. Semantic HTML is preferred where it costs nothing
  (button vs div, label vs span). The existing inline-styled UI is not
  audited and is acknowledged to have likely contrast and focus-state
  gaps.
- **Re-opens at v2** if a cohort member surfaces a need or if formal
  adoption requires it.

This is not a position we are proud of; it is the v1 trade-off we made
on purpose, and we name it.

### Implementation Considerations

- **Default station change** (`clelles` → `saint_saturnin` or `amvville`)
  is a one-line code change in `src/App.tsx` plus a documentation update.
  Decision deferred — pick whichever station is the strongest cold-start
  for an unfamiliar trainee in cohort chat. Likely **`saint_saturnin`**
  (covers the `commutFC` reference path the cohort cites), but **`amvville`**
  is equally defensible if it has the simpler cold-open path.
- **Onboarding cue form factor** (overlay / hint strip / splash) is not
  decided in the PRD. It will be decided in the UX/architecture step.
  PRD-level constraint: it must be (i) dismissable, (ii) not re-prompt
  on every page load, (iii) get a cold visitor to the first-train
  moment without external instructions.
- **Refused-action feedback** (Journey B) needs an architectural
  decision: extending `ActionResult` to carry a refusal-reason string,
  versus reading the same predicates UI-side. Either is defensible;
  the PRD says only that the mechanism must produce a one-line
  human-readable French explanation at the refusal site.
- **Reset-without-page-refresh affordance** (Journey B) maps to a new
  store action that re-runs `stationToPlayerData` against the current
  station, returning the Player to its built initial state. Cheap.
- **Static-host choice** (Netlify / Vercel / GitHub Pages) is a Journey
  C concern — pick the simplest one that satisfies: free tier, custom
  domain optional, deploy-from-git, supports SPA fallback (so a refresh
  on a subpath returns `index.html`, even though we do not currently
  use a router — keeps the post-MVP shareable-URL feature unblocked).

## Functional Requirements

### Distribution & Access

- **FR1.** A trainee can open Voie Libre at a public URL without installing
  anything.
- **FR2.** A trainee can use Voie Libre on macOS, Linux, and Windows in
  current Chrome, Firefox, Safari, and Edge.
- **FR3.** A trainee can use Voie Libre without creating an account,
  providing personal information, or accepting any data-collection
  consent.
- **FR4.** A trainee can refresh the page (or close and re-open it)
  without losing access to the simulator. State resets to the built
  initial state; the URL itself remains usable.
- **FR5.** All trainee-facing text in Voie Libre is presented in French.

### Simulation Core

- **FR6.** The system can load a station fixture and produce an
  interactive Player state.
- **FR7.** The system can run an event-driven simulation advanced by a
  logical clock at configurable speeds (paused, ×1, ×2, ×5, ×10).
- **FR8.** The system preserves behavioral parity with original Gessie
  on supported MVP stations (`saint_saturnin`, `amvville`): observable
  outcomes — signal state, lever refusal, train movement, disturbance
  behavior — match the desktop app for equivalent operator inputs.
- **FR9.** The system fails silently when an operator action violates
  an interlocking constraint — returning the simulation state unchanged,
  without throwing an error or logging anything trainee-visible.

### Operator Actions

- **FR10.** A trainee can toggle a lever between its plus and minus
  positions.
- **FR11.** A trainee can toggle the Fermeture Carré commutator on a
  signal that supports it.
- **FR12.** A trainee can press cantonnement (block-section) controls:
  test, reddition, sémaphore commutator, voie libre, annonce.
- **FR13.** A trainee can manipulate ATR (annulateur de transit)
  controls: press, release, give autorisation, remove autorisation.
- **FR14.** A trainee can take and put keys between lever keyholes,
  key cabinets (groups), and central locks.
- **FR15.** A trainee can inject a disturbance (avarie) onto a target
  affectation or bloc and clear it from a single visible list of active
  disturbances.
- **FR16.** A trainee can cancel an active EPA on a signal.

### Trains & Scenarios

- **FR17.** A trainee can spawn a train by specifying its direction,
  size, speed, and starting point.
- **FR18.** The system progresses spawned trains through the station
  automatically, driven by the simulation event queue.
- **FR19.** A trainee can adjust the simulation speed or pause it
  during a session.
- **FR20.** A trainee can read the current logical clock time at any
  point during the session.

### Station Management

- **FR21.** A trainee can select a station from the available catalog
  before or during a session.
- **FR22.** The system can load fixture data for any station in the
  available catalog without server interaction.
- **FR23.** The system presents a default station appropriate to the
  cohort on cold open, without prompting the trainee.

### Onboarding & Recovery

- **FR24.** A first-time trainee can be presented with a single
  onboarding cue that names the first-train moment in plain French.
- **FR25.** A trainee can dismiss the onboarding cue; subsequent page
  loads in the same browser session do not re-prompt with the cue.
- **FR26.** A trainee receives feedback distinct from the success path
  when an operator action is refused.
- **FR27.** *(conditional-MVP)* A trainee can read a one-line
  plain-French explanation attached to a refused operator action.
- **FR28.** *(conditional-MVP)* A trainee can reset the current station
  to its built initial state without refreshing the page.

### Visualization

- **FR29.** The system renders the TCO of a loaded station as scalable
  SVG, sized to fill its container.
- **FR30.** A trainee can hover a TCO item to see a tooltip describing
  the item.
- **FR31.** A trainee can read at-a-glance simulator status: current
  mode (edit/play), current speed, clock time, pending event count,
  and counts of affectations and levers.
- **FR32.** The system shows, on each TCO item, a visual state derived
  from the underlying Player state (signal F/O, lever +/−, switch
  G/D/g/d, zone occupied, etc.) consistent with original Gessie.

### Maintainer Workflow

- **FR33.** The lead author can produce a static `dist/` artifact via
  `npm run build` that runs without any server-side runtime.
- **FR34.** The lead author can deploy the static artifact to a free
  static host (Netlify / Vercel / GitHub Pages) with a single command
  or one-button action.
- **FR35.** The lead author can run a documented cross-browser smoke
  matrix against the deployed URL in under 10 minutes manually.
- **FR36.** The lead author can verify behavioral parity with original
  Gessie on each MVP station via a documented checklist (golden path
  + 3 disturbance scenarios per station).

## Non-Functional Requirements

### Performance

(Established in Web App Specific Requirements § Performance Targets;
restated here for the NFR contract.)

- **NFR-PERF-1.** Cold-load time-to-interactive on the deployed URL must
  be < 3 seconds on a typical trainee laptop over broadband or
  institutional Wi-Fi.
- **NFR-PERF-2.** Warm-load (cache hit) time-to-interactive must be
  < 1.5 seconds.
- **NFR-PERF-3.** A simulation tick must complete within ~16 ms (one
  frame budget) on a typical laptop, with no user-perceptible UI freeze.
- **NFR-PERF-4.** The shipped `dist/` artifact must be < 1 MB total
  gzipped; aim is substantially smaller.
- **NFR-PERF-5.** Performance is verified by manual measurement (Chrome
  DevTools, Lighthouse, or equivalent) before each public-URL update.
  No automated performance regression suite is required for v1.

### Compatibility

- **NFR-COMP-1.** The deployed URL must render and be interactive in
  current Chrome, Firefox, Safari, and Edge on macOS, Linux, and Windows.
  "Current" means the last 2 stable major versions per browser as of the
  release date — no manual `browserslist` pin in v1; Vite 8 + React 19
  defaults are the contract.
- **NFR-COMP-2.** Internet Explorer (any), legacy non-Chromium Edge, and
  any browser version older than ~12 months as of the release date are
  out of scope. No polyfilling or backwards-compatibility shims will be
  added for these.
- **NFR-COMP-3.** Smaller form factors (tablet, phone, narrow browser
  windows) must not crash, must not render with overlapping content
  obscuring the TCO, and must allow horizontal scroll if the TCO exceeds
  the viewport width. No commitment to legible TCO scaling, touch
  affordances, or rotation handling at v1.

### Accessibility

- **NFR-A11Y-1.** v1 ships **unverified** against WCAG 2.1 AA. This is a
  deliberate v1 trade-off, named explicitly in the Domain Requirements
  step.
- **NFR-A11Y-2.** No active anti-pattern: semantic HTML is preferred
  where it costs nothing (button vs. div, label vs. span). Existing
  inline-styled UI is not audited and is acknowledged to have likely
  contrast and focus-state gaps.
- **NFR-A11Y-3.** WCAG audit and remediation are an explicit Phase 3
  scope item; this NFR re-opens then.

### Security & Privacy

- **NFR-SEC-1.** The deployed URL must be served over HTTPS (TLS) only.
  The chosen static host must enforce HTTPS by default; mixed-content
  references in the build are not permitted.
- **NFR-SEC-2.** No personally identifiable information (PII), no
  account data, and no usage telemetry are collected or transmitted in
  v1. (Reinforces FR3 at the NFR layer: zero-data is a *system
  property*, not just a user-facing affordance.)
- **NFR-SEC-3.** The build pipeline relies on the supply-chain trust
  level of `npm install` against `package-lock.json` with no additional
  integrity layer (no SCA gate, no SBOM publication). This matches the
  project's "deliberately boring" stance and is explicit: any post-MVP
  move toward formal adoption (see Domain Requirements § Informal-use)
  re-opens this NFR.
- **NFR-SEC-4.** Content-Security-Policy, if configured, must not block
  first-party scripts in a way that prevents future privacy-respecting
  anonymous telemetry (Phase 2+).

### Reliability

- **NFR-REL-1.** Availability is inherited from the chosen static host's
  free-tier SLA. We make no independent uptime commitment; if the host
  goes down, the URL is down. This is acceptable for an informal-use
  training tool and is named explicitly.
- **NFR-REL-2.** A page refresh must return the simulator to a known,
  clean state without operator intervention. Refresh is the canonical
  recovery mechanism for any unrecoverable client-side error in v1.
- **NFR-REL-3.** The merge gate (`npm run lint && npm run build`) must
  pass on `master` at all times. A red `master` is a release blocker.

### Maintainability

- **NFR-MAINT-1.** New runtime dependencies require explicit author
  approval before being added. The "deliberately boring" stack stance
  from `_bmad-output/project-context.md` is enforced PRD-side: every
  new dep must serve a journey requirement directly.
- **NFR-MAINT-2.** Code changes must follow the conventions documented
  in `_bmad-output/project-context.md` (TypeScript rules, framework
  rules, anti-patterns). The 95-rule list is the contract.
- **NFR-MAINT-3.** No test runner is required for v1. The combination of
  TypeScript strict-ish typecheck (`noUnusedLocals/Parameters`,
  `verbatimModuleSyntax`) and ESLint flat config is the correctness
  floor. Adding a runner requires explicit author approval.
- **NFR-MAINT-4.** The project must survive the lead author's training
  cycle without active maintenance: zero-cost static host, no databases,
  no recurring renewals beyond an optional domain name.
