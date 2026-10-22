# Asset upgrade: industrial GT racing

## Game frame

- Target: browser-based couch racing on GitHub Pages; up to four chase-camera viewports and eight cars.
- Engine: Three.js r160, WebGL. Ten engine position units equal one metre-like scene unit.
- Car: 4.4 scene units long, floor pivot, forward +X at the game root. Four separate wheel pivots.
- Review resolution: 1440px desktop, 1000×625 game canvas for four-camera measurements, phone controller unchanged.

## Visual system

- Direction: the user's 3D racing screenshot, upgraded from the original blocky placeholder style toward industrial sports-car racing.
- Silhouette: rounded GT coupe, long hood, readable rear lights, actual spokes/tires, visible glazing and interior.
- Surface hierarchy: glossy metallic paint against rough, cracked asphalt and weathered concrete. Dark glass and metal trim frame the player color.
- Setting: dockyard garages, ribbed containers, factory windows, rooftop ventilation, pipes, continuous rail/barrier edges, barrels and distant terrain.
- Lighting: Poly Haven Industrial Sunset 02 HDRI, warm direct sun, cool environmental reflection, soft vehicle/prop shadows.
- Motion: wheel spin, front-wheel steering, subtle body lean, boost flames and a closer chase camera. Interface motion stays restrained.
- Existing design dials: ENERGY 3 / RHYTHM 2 / MOTION 2. Existing UI direction and approved antislop during mode continue.

## Technical contract

- GT source: Car Concept, Eric Chadwick / Darmstadt Graphics Group GmbH, CC BY 4.0. Original source retained in work files; derivative GLB is self-contained.
- Runtime model: approximately 70k triangles rather than source 213k; 33 meshes, 23 materials. Maximum car texture size 1024px. No Draco decoder, CDN or build step at runtime.
- Materials: diffuse textures in sRGB, normal/roughness maps in linear data space; mipmaps and up to 8× anisotropy. Shared 1K PBR source images; 1K HDRI.
- Original named wheel groups retained through optimization; four runtime pivots reconstructed before normalization.
- Collision remains the existing lightweight arcade proxy. Props beyond the road are decorative.
- Authored static scenery is batched by material, with world-scale concrete UVs. Curbs use vertex colors rather than one draw call per stripe.
- Original branding textures on license/interior surfaces removed from the derivative; credits preserve creator, source, license and changes.

## Visual target and acceptance

- Delegated choice: selected the Car Concept GT model and photographed industrial materials because the user asked for a better 3D asset set without choosing a specific vendor.
- Review in the running game, rather than accepting the source thumbnail as evidence.
- Verify loading of all local dependencies, visible car orientation/colors, four wheel pivots per car, all three track environments, split-screen, and error fallback.
- Measure after shader warm-up; first-frame compilation is not steady-state frame rate.
