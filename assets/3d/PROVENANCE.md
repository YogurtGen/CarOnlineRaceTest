# 3D asset provenance, v1.1

## GT car

`gt/rally-gt.glb` is adapted from **Car Concept** by **Eric Chadwick**, © 2024 **Darmstadt Graphics Group GmbH**, distributed through the Khronos glTF Sample Assets project under **Creative Commons Attribution 4.0 International**.

- Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
- Original download: https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb
- License: https://creativecommons.org/licenses/by/4.0/
- Original license record: `gt/LICENSE-source.md`.
- Acquired and adapted: 22 October 2026.

Changes: removed unused/hidden small parts, pruned material variants, removed original license/interior logo textures and steering emblem, reduced geometry from 213,347 to 69,981 triangles, joined compatible body primitives, resized images to a maximum of 1024px, adjusted glass for realtime rendering. Optimization used glTF Transform 4.2.1 and meshoptimizer 0.23.0. No geometry decoder is required at runtime.

Runtime: normalize to length 4.4, rotate +Z forward to game +X, center at floor, apply player paint, create four named wheel pivots for spin/steering, keep original detailed interior and surface textures. Collision uses the existing simple arcade proxy.

Required attribution appears in the in-game credits and THIRD_PARTY.md. No endorsement or affiliation is implied. Trademark rights are not granted by the asset copyright license.

## Environment

Road, barriers, track furniture, containers, cranes, warehouses, vents, windows, pipes, lights and terrain are original procedural Three.js geometry. Materials and lighting use the CC0 Poly Haven assets listed in `../pbr/PROVENANCE.md`.

Three.js r160.1 and its loaders/utilities are vendored under `vendor/`, with `vendor/THREE-LICENSE.txt`. Imports point to local files. The earlier Kenney car files are replaced in v1.1.
