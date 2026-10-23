# REA reference reconstruction record

Reference: [1in8b.life, Simplified Chinese](https://1in8b.life/zh-hans/). Inspection date: 2026-10-22. The purpose of this record is to establish the reference's functional and pixel-rendering behavior for an independently implemented game.

## Tool and artifact provenance

- Tool: [`morluto/rea`](https://github.com/morluto/rea), npm `rea-agents@6.7.0`, public `rea` launcher; `rea --version` returned `6.7.0`.
- Runtime: existing Node `24.19.0`. The tool was installed only under `/private/tmp/rea-life-tool`, with install scripts disabled. No global installation, MCP registration, native disassembler, or game dependency was added.
- npm package integrity matched the official registry: `sha512-yhIx2ioJYYT1C/tONfYeitC6LhnKmCh+ZwRUOgYuhSc733lGhkkt73zhug9WmLgxoMdKuqIYGCoBfD4fXkOhFw==`.
- Analysis input: `/private/tmp/rea-life-reference`, a read-only snapshot of public release artifacts. Its `package.json` is an analysis-only manifest authored for the snapshot, not a file claimed to come from the website.
- Full source snapshots and REA evidence stay in temporary analysis directories and are not included in this repository. The implementation must not import the reference bundle.

| Public artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `a/zh-hans.1c06e3f947.js` | 4,263,257 | `1c06e3f947c78ab7bf1bc14b2a110d14ae4e26cd9400ccedd2de71b1ac901e11` |
| `era.js` | 548,529 | `9f72926cec47a6a1d21dfdb2c0cc44a681919174375a479b120dc68c9d373342` |
| `index.html` | 235,377 | `69f2c9255c467e00f8118b6c8c1c115ddeaa6edcd5461acff2de1d8ff8d4f025` |
| `reference.css` (captured page styles) | 206,711 | `c9fcbea3200ff4805aaeb57c01a0d626d4bf9cdc0715dcbdbc6f271d84b9a72d` |

## Pixel scene contract

These are direct observations of the public client source, with locations in the hashed JavaScript snapshot above. They are distinct from the REA graph findings recorded below and from live browser observations.

1. **True low-resolution rendering.** `PX` at line 20439 defines width 192, height 60, and ground baseline 48. The scene is generated as individual colored pixels and written to a canvas with `ImageData`. The page styles at lines 910–911 preserve the 32:10 aspect ratio and use nearest-neighbor pixel scaling. This requires an actual low-resolution scene, not a high-resolution illustration with a CSS pixel filter.
2. **State-derived scene.** `sceneModel` at line 20393 selects age stage, mood, urban/rural setting, geographical region, home, residents, career prop, pets, transport, conflict and a stable seed. Houses change with ownership/wealth and special living conditions. Residents come from persistent family state, with age, relationship role and skin tone; the visible group is capped at ten.
3. **Composition.** `pxScene` at line 20907 layers sky/clouds, distant landscape, ground, home, work props, people, pets and foreground. The home sits on the left; the family occupies the middle; career props usually use the right. `pxSceneLayers` preserves sky/back/mid/front layers for other presentations.
4. **Age and mood.** The scene uses morning below age 13, daytime before age 60, and evening afterward. Mood below 35, between thresholds, and above 70 controls cloudy/neutral/clear presentation. Light and dark themes use distinct pixel palettes. These scene mappings do not replace the simulation's statistical state.
5. **Render pipeline.** `renderScene` (21064) obtains `sceneModel` and caption, compares a cache key, ensures a 192×60 canvas, and calls `sceneCanvas` (20975), which calls `pxScene`. The cache key includes age bands, residents, home, career prop, region, mood and theme. The display caption and accessible label are updated with the scene.
6. **Clock to render.** `frame0` (29455) advances the simulation only in the active life view with no blocking sheet. `tick` honors paused/pending/dead state. After the age changes or UI becomes dirty, `renderAll` calls `renderScene`. Changing an option must affect simulation state before the scene refreshes.
7. **Historical reconstruction.** `sceneSnap` and `sceneAt` (20982 onward) save and reconstruct compact scene state from annual records. A historical view shows the household and circumstances of that year. `sceneFor(age, act)` can attach a moment to the reconstructed scene.

## Activity-specific pixel moments

The reference does more than show one house throughout a life. `pxMoment` (21190) dispatches an activity string by its prefix; it creates the same four pixel layers and a cast from the current or historical family model. Unknown activities fall back to the default scene.

| Moment | Observed behavior | Source location |
| --- | --- | --- |
| Birth and baby | Family cast, infant/care setting | `MO.born`, 21460; `MO.baby`, 21475 |
| School | School building/gate, child with school bag, parent and other children | `MO.school`, 21487 |
| Graduation | School or university backdrop; older graduates use gowns/caps, family and celebration | `MO.grad`, 21502 |
| Work | Activity chooses a job-specific setting; promotion and retirement add coworkers/gestures | `MO.work`, 21727; `MO_W` renderers |
| Travel | Destination subtype chooses beach, mountains or city; companions come from solo/partner/family selection | `MO.trip`, 22068; `MO_T` renderers |
| Social and family | Dating, wedding, anniversary, meal, friends, walking and conversation have separate arrangements | `MO.date`, `MO.wed`, `MO.meal`, `MO.friends`, `MO.talk` |
| Illness and loss | Hospital and loss scenes use a context-appropriate cast; funeral rendering is separate | `MO.hosp`, 21646; `MO.loss`, 21658; `pxFuneral`, 20998 |

Reconstruction priorities are persistent family sprites, an age-aware home scene, distinct school/work/travel/relationship moments, and accurate historical scene replay. Exact sprite rows and scene algorithms are not copied into this repository.

## Basic interaction acceptance checks

- Setup exposes birth/population sampling, past/present/future world choice, and 30/60/90-minute pacing. Pacing controls wall-clock speed, not a predetermined death age.
- Birth starts at age zero and displays identity, country, household and starting conditions before the clock runs.
- The clock supports pause, speeds 1/2/4/8/12/16 and next-decision fast-forward. Pending choices keep the simulation paused even when minimized.
- Annual focus has stage-specific options and accumulates effects over elapsed fractions of the year. Repeated clicks cannot grant instant stat bonuses.
- Health, happiness, knowledge and relationships remain bounded and connect to life events, opportunities and mortality.
- Education, work, money, family and migration persist and influence later choices. Events are conditioned on state and chance; a fixed chronological script does not provide this behavior.
- Four same-second peers, annual life cells, event history and survival comparison progress with the same simulated age.
- Reload resumes the same state; terminal summaries archive completed lives; historical views are read-only.
- DeepSeek conversations, world intelligence and freely branching timelines are requested additions. They should operate on the same state model and should not erase these basic mechanics.

## REA evidence ledger

The complete default analysis of the 4.26 MB bundle reached REA's 300,000 ms per-source deadline. A selected-source rerun with bounded semantic work reached the same deadline. Both timeouts were preserved as partial Evidence and are not counted as successful application analyses. The focused pixel/clock analysis below completed successfully.

For that focused pass, Babel parsed the original bundle without running it. Forty-five complete top-level declarations/assignments were copied verbatim, in source order, into the temporary `scene-slice.js`. The selection includes the pixel model, renderer, selected moment handlers, clock, decision and render entrypoints. Each statement retains its original start/end byte offsets, line numbers and SHA-256 in `/private/tmp/rea-life-scene-slice/provenance.json`. Only separator newlines were added. This is explicitly a partial source slice, not the full website or a recovered original repository.

- Slice bytes: **51,530**.
- Slice SHA-256: `4ea4d11581fe71e0470a0d8b1a26a59b3dfc01b9d4da01aef04a883d20ab8fd2`.
- REA inspected **15,241 AST nodes**, with **1 parsed JavaScript file and 0 parse failures**.
- Its semantic graph retains **9,731 nodes and 7,035 relations**. Application coverage is `partial`, semantic coverage is `unknown`, and **2,970 semantic unknown records** remain. Missing external declarations and dynamic calls are not treated as absent functionality.
- The module page was read first, followed by its exact `javascript-module` item. `scene-slice.js` also has a separate asset node; the module selection uses the actual node ID to avoid conflating the two.
- Verification compared every one of the 45 extracted byte ranges against the original bundle and checked each range digest. All matched. Every Evidence ID listed below was also checked against a saved REA output.

| Operation | Actual REA Evidence ID | Result |
| --- | --- | --- |
| Full-snapshot default attempt | `ev_09d11cfbafc958c55115cb45dbd2ba1b55ea8acd8863e31a153bc43dc3faab04` | Partial observation retained after timeout; no completed JavaScript parse |
| Bounded selected-source attempt | `ev_f34a23c1d3a9af849077cec757bf40480a645eb8ce654a8e86ced4a08b653dc0` | Partial observation retained after timeout; no completed JavaScript parse |
| View of that partial attempt | `ev_53ded5d38aab3f407e108081f917cacd4405cd8f6b15d05e8ac6f29520796980` | Confirms incomplete source analysis |
| Focused application analysis | `ev_7693bba0ce4b54be72aff8ab91784c63611e728578a7c5f4cb7d4c7c3eb28acc` | Completed static analysis of the explicitly selected slice |
| Focused summary view | `ev_a0268144d4687e2cca643999a57fa17508e902a8bb7c36ef239205d872c6babd` | Counts, scope, unknowns and coverage inspected |
| Module identity page | `ev_db5ab985734b14939ac6ef4679aae0defadda0ad46fe7887373e3ad6025ab71d` | Identifies distinct module and asset nodes |
| Exact module item | `ev_c624f4315e7a60e4ef3ce4e329f283613d708e1b6cfb2ce29a657a4f83b1ed6b` | Verifies slice digest and retained source range |
| Application feature trace | `ev_f6aa7eabf3487e495126bd55328f70f41bf951feac59ac4b90cc2c4548f3e6cf` | Selects exact module node; one observed module, no expanded call graph in this application-level view |
| `sceneModel` callers | `ev_5f0cc42173cbf869512811a8c951f3fdd43f67e01417760aedfb74a2e9240126` | Resolved static calls from `renderScene` and `sceneSnap` |
| `sceneCanvas` callers | `ev_bfa1a1bdd41fdb355fcee99d2acf2dcabc03f48c0417a41eea114e91a4f91300` | Resolved static call from `renderScene` |
| `pxScene` callers | `ev_b7c3ecb7ff9ae868f765ae7306946dbd19fd25c67a82600df6b590c1cee50505` | Resolved static call from `sceneCanvas` |
| `pxMoment` callers | `ev_26faf3c1514b85ea247b809efd07996422f6580e61cfc324f8a323496f01afbd` | Resolved static calls from `pxScene` and `pxSceneLayers` |
| `tick` callers | `ev_c2dcd7ec2b0411a791ff44c7823d0777d81825ab51625c4b3971018d297faacd` | Resolved static call from `frame0` |
| `renderAll` callers | `ev_d95712cef39ad0e237d03c1af271cad6de024a5ae73ee4111a3b2cd2645bbe5f` | Resolved static calls from `frame0` and `pickChoice` |

These are static call relations within the slice. They establish which selected call expressions resolve to selected declarations; they do not prove browser execution or full application reachability. In particular, `renderAll` invokes renderers through an array and a loop. Its inclusion of `renderScene` was directly observed in the original source; it is not presented as a resolved REA call edge.

Selected original byte ranges (zero-based, end exclusive) make the slice traceable to the hashed public release:

| Declaration | Original byte range | Original lines |
| --- | --- | --- |
| `tick` | 1463550–1463977 | 4301–4314 |
| `sceneModel` | 3330435–3334738 | 20393–20438 |
| `pxScene` | 3369126–3371047 | 20907–20935 |
| `sceneCanvas` | 3373676–3374046 | 20975–20980 |
| `renderScene` | 3383336–3384058 | 21064–21077 |
| `pxMoment` | 3394304–3394721 | 21190–21197 |
| `renderAll` | 4054717–4054990 | 28063–28067 |
| `frame0` | 4195806–4198203 | 29455–29485 |

## Commands used

The installed public launcher was `/private/tmp/rea-life-tool/node_modules/.bin/rea`, with the existing Node 24 directory prepended to `PATH`. Outputs were redirected to `/private/tmp/rea-life-evidence` before inspection.

```sh
rea --version
rea analyze-javascript-application /private/tmp/rea-life-reference \
  --format json > application-default-timeout.json

rea analyze-javascript-application /private/tmp/rea-life-reference \
  --source-path a/zh-hans.1c06e3f947.js \
  --source-path index.html --source-path package.json \
  --max-semantic-nodes 1024 --max-semantic-nodes-per-file 1024 \
  --max-semantic-unknowns 256 --max-semantic-unknowns-per-file 256 \
  --max-heap-mb 2048 --format json > application-bounded.json

rea analyze-javascript-application /private/tmp/rea-life-scene-slice \
  --source-path scene-slice.js --source-path package.json \
  --format json > scene-slice-application.json

rea inspect-analysis-view scene-summary-request.json --format json
rea inspect-analysis-view scene-modules-request.json --format json
rea inspect-analysis-view scene-module-request.json --format json
rea trace-application-feature feature-scene-module-request.json --format json
rea trace-javascript-semantics trace-sceneCanvas-request.json --format json
rea trace-javascript-semantics trace-pxScene-request.json --format json
rea trace-javascript-semantics trace-renderAll-request.json --format json
rea trace-javascript-semantics callers-sceneModel-request.json --format json
rea trace-javascript-semantics callers-tick-request.json --format json
rea trace-javascript-semantics callers-pxMoment-request.json --format json
```

View requests contain `source: {kind: "inline", evidence: <complete saved Evidence>}` and the requested `summary`, `page/modules` or `item/modules` view. The exact module selector is `jag_node_72362f2f5a0c51b622db251a6ade49dcdba40241843b266cb687d81d23e7acbd`. Semantic trace requests contain the complete application Evidence plus `query.seed.kind: "semantic-node"`, the actual function node ID returned by that Evidence, and `query.direction: "callers"`.

REA initially needed its own macOS process-ownership helper compiled with the already installed system toolchain. A sandbox cache-write failure and diagnostic output were retained; the authorized CLI run with compiler-cache access then succeeded. The target game JavaScript was never executed by this static-analysis workflow.
