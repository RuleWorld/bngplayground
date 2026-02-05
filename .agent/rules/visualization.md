---
trigger: model_decision
description: When dealing with visualization
---

# Visualization (React & D3) Rules

Rules for maintaining high-performance visualization components.

## Performance
- **Link Detection**: Use `Set`-based methods for link existence checks (e.g., bidirectional detection).
    - **Avoid**: Nested loops ($O(N^2)$) or `.some()` inside `.map()`.
    - **Prefer**: `const linkSet = new Set(links.map(l => l.id))` then `linkSet.has(...)`.
- **Canvas vs SVG**: For networks > 1000 nodes, prefer Canvas or WebGL (PixiJS) over SVG.
- **Rendering**: Batch updates using `requestAnimationFrame`.

## Clarity & Aesthetics
- **Graph Layouts**:
    - Use convex hulls for clusters instead of bounding boxes or circles.
    - Use solid arrows with bezier curves for clear directionality.
- **Data Representation**:
    - **Flux Metrics**: Use "Total Flux" over a time window rather than instantaneous average.
    - **Tooltips**: Show both total magnitude and rate-independent strength.
- **Empty States**: Every visualization panel MUST handle:
    - Loading state (Skeleton or Spinner).
    - Empty state (Use standard `EmptyState` component).
    - Error state (Graceful fallback).

## Charting (Recharts)
- **Zero formatting**: Explicitly return `'0'` in tick formatters to avoid `0.00` or `0.0`.
- **Optimization**: Use `isAnimationActive={false}` for large datasets to prevent React render thrashing.

## UI Patterns
- **Progressive Disclosure**: Hide advanced settings (Integrators, Steps) behind a 'Controls' toggle.
- **Hierarchy**: Use a 3-tier tab structure: Time Courses -> Network -> Analysis.
- **Performance**: Use Set-based lookups (\(N)\$) for link detection in force graphs.
