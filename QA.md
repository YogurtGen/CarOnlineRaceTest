# Verification

Updated for **v1.1 asset upgrade**, 22 October 2026 on Windows, Microsoft Edge with hardware WebGL. The initial functional release has now received a more detailed GT model, photographed PBR surfaces, HDRI lighting and industrial track furniture.

## Automated engine and transport tests

`node --test tests/*.test.mjs`: **22 tests passed, 0 failures**.

Two asset-integrity tests additionally check the real GLB structure, embedded resources, normals/UVs for mapped materials, four wheel assemblies, bounded triangle count, JPEG/HDR signatures and required attribution.

Coverage includes 3 closed circuits, 8-car traffic, AI finishing full legitimate laps on every track, countdown and race clock, steering/braking/reverse, boost, offroad grip, collision stability, checkpoint order, shortcut/lap-farming prevention, recovery without free progress, invalid input bounds, and endless mode without a session time cap.

Transport tests cover room validation, BroadcastChannel pairing, WebRTC message validation, handshake ordering, signaling reconnect, 8-seat transport cap, stale eviction, timeouts and cleanup, room collision retry, unavailable transports, stable reconnect identity, replacement in a full room, and rejection of late messages from the old connection. The app limits human seats to 4 for split-screen, within that transport cap.

## Actual browser interactions

| Control / state | Observed result |
| --- | --- |
| Cara main | Opens help; Escape closes the dialog |
| Aset & kredit | Opens six source/license links including Eric Chadwick attribution; close button closes it |
| Buat room | Creates six-character code; QR SVG appears locally |
| Salin link | Clipboard receives the correct subpath and `#join=CODE` |
| Track select | Copper Canyon changes the actual rendered track |
| Lap and bot selects | Free ride and bot count apply to the next race |
| Keyboard join | Two separately controlled local racers appear in roster |
| QR/deep-link route | Controller name form opens for the selected room |
| Name / connect | Joins lobby, displays name as text, opens gamepad |
| Auto gas | Unchecking reveals manual gas button; checking restores auto acceleration |
| Start | Countdown completes; real race begins and speed telemetry rises |
| Left / right | Key press/release on gamepad steering buttons sends controls |
| Brake | Real pointer press/release sends held braking |
| Boost | Held keyboard activation sends boost; release stops it |
| Reset checkpoint | Controller button and keyboard R dispatch recovery |
| Host pause / resume | JEDA overlay appears and disappears; race continues |
| Back to pit lane | Restores settings and keeps connected drivers |
| Split-screen | 2, 3, and 4 human racers render matching viewport/HUD layouts |
| Controller exit | Removes driver from lobby roster |
| Solo keyboard | Creates room and starts a real 3D race against AI |
| Fullscreen | Browser request executes without app error |
| Home | Closes session and returns to start screen |
| Console | No JavaScript exceptions during completed interaction run |

Browser checks also confirmed zero horizontal overflow on the home page at widths **360, 390, 768, 1024, 1440**; host at **360, 768, 1024**; and controller in **390×844 portrait / 844×390 landscape**. Keyboard focus indicators and native dialog Escape behavior were inspected. Reduced-motion disables the idle race preview and cosmetic camera/vehicle motion; gameplay still animates while racing.

## Actual WebRTC, not just mocked transport

Two isolated browser storage contexts were used, with BroadcastChannel explicitly disabled for the controller:

- Public PeerServer Cloud signaling opened a real room.
- A WebRTC DataChannel transmitted identified ping/pong messages.
- The full app connected the controller, accelerated a car from remote inputs, and returned live position/lap/speed/boost status.
- Reloading the controller reconnected to the same car during a race, without another waiting player.
- A blur event held braking across the periodic 50ms sends; focus resumed input.
- No JavaScript exceptions were observed in that integration run.

These checks used two browser sessions on one physical computer. They do not verify a physical phone, TV, arbitrary internet/NAT pair, sleep behavior on iOS/Android, or uptime of a free signaling service.

## 3D verification

- Real `assets/3d/gt/rally-gt.glb` loaded with embedded images; `canvas.dataset.models` reached `ready` with no model error.
- Source Car Concept had 213,347 triangles. The derivative has **69,981 triangles, 33 meshes and 23 materials**, with textures capped at 1024px. Runtime normalizes length to 4.4 world units and reconstructs four wheel pivots, with the same simple collision proxy.
- All three track environments were exercised with eight cars and four viewports. Each reported **32 wheel pivots**, all local textures/HDR loaded, zero failed asset responses and no JavaScript exceptions. Each viewport layout covers area 1.
- A deliberate failed GLB request triggered the explicit error state, displayed the visible fallback/reload message and left the fallback car active. Loading status is visible until model/material downloads finish.
- Chase cameras, sun/shadows, PBR road/concrete, guardrails/barriers, warehouses/vents/pipes, HDRI reflections, wheel movement and boost effects render through WebGL.
- Viewport rectangles for 1–4 players cover the frame without overlap, apart from deliberate narrow dividers.
- One warmed local sample at 1000×625, four viewports and eight cars reported **590 draw calls / 915,641 triangles per frame**. After twelve warm-up frames, thirty measured frames took **276ms (~109fps)** on this machine's NVIDIA RTX 4050 through ANGLE/D3D11. Initial shader/model loading is slower. This is a short local measurement, not a general performance guarantee.
- Final screenshots were captured from the running application, including the three-camera race view after countdown and the controller.

## Antislop delivery gate

| Gate | Status / concrete evidence |
| --- | --- |
| Hard gates: R-02/03/17/18/23/24/25/26/27/28/32/33/34/35/36/37/38 | **PASS.** No invented marketing statistics/testimonials or dead navigation; assets were authorized and sourced under CC BY 4.0/CC0, with libraries under MIT; attribution and modifications are visible in-game. Mobile overflow, native forms, visible focus, dialogs, empty/loading/error connection text and functioning controls were verified. No theme toggle or FAQ is shipped. UI was written directly in source. |
| Contrast: R-25 | **PASS.** Computed white/orange `#c93614` **5.22:1**, muted `#62665e`/paper `#f3f0e7` **5.15:1**, HUD white/solid `#17211d` **16.51:1**. Input border `#7c8173`/`#fffdf6` **3.93:1** meets non-text contrast. |
| Purpose gates | **PASS.** Impact/Arial typography follows racing-poster direction; orange identifies primary action; road/sky textures describe game surfaces; shadows express 3D depth; HUD solid surfaces preserve legibility. Camera/vehicle motion conveys driving, and decorative page transitions are absent. |
| Liveliness | **PASS.** Direction declared before UI: arcade couch racing, ENERGY 3 / RHYTHM 2 / MOTION 2, corrected to 3D chase/split-screen after user reference. Large racing type, primary room action, and actual running 3D scene establish hierarchy and identity. |
| Craftsmanship and quality locks | **PASS.** Layout follows host/join/race tasks; no template marketing sections, fake claims, or default dashboard clutter. Real interactions, source credits, responsive states and verification limits are recorded above. |

## Practical limits

The game has no application play-time limit. Free hosting/signaling retains its providers' own availability and quotas. Strict networks can require a TURN relay that is not bundled. Scene props are decorative; physics is an arcade simulation on a flat plane. v1.1 has a larger first download for the detailed model and PBR assets. There are no combat weapons in this version. The selected deployment target is `YogurtGen/CarOnlineRaceTest`; publication is pending Git push and Pages setup. Physical phone/TV and low-end GPU testing remain unperformed.

## Playwright CLI verification — 22 October 2026

An additional run with `playwright-cli` and an isolated Microsoft Edge session passed 13 checks against `http://127.0.0.1:4173/couch-rally/`: responsive home at four widths, room/QR creation, a browser phone controller joining two keyboard players, portrait controller layout, three 3D viewports with live speed telemetry, pause, return to lobby, disconnect removal, no JavaScript exceptions, and no failed local asset responses. This was a local browser test; it does not establish that the public GitHub Pages deployment is live.
