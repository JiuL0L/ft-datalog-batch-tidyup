# scripts/vendor

Vendored third-party assets that get **inlined** into generated reports. They are stamped into output HTML at generation time, **not** imported by Node — `process_ft_datalog.js` itself stays stdlib-only.

## echarts.min.js

| Field        | Value |
|--------------|-------|
| Library      | Apache ECharts |
| Version      | 5.5.1 |
| Source URL   | https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js |
| SHA-256      | `e84270bd0cd5bdf60fefc26d00c2a391cb2e81f4d26a7a9ee16185a54773a3cf` |
| Size         | 1,030,855 bytes (~1.0 MB) |
| License      | Apache License 2.0 (header preserved verbatim in the file) |

Consumed by [scripts/process_ft_datalog.js](../process_ft_datalog.js) and inlined verbatim into every generated `report.html` so reports stay fully offline-capable. See [docs/adr/0001-vendor-and-inline-echarts.md](../../docs/adr/0001-vendor-and-inline-echarts.md) for rationale.

## Updating

1. Download the new file from the same CDN path with the desired version.
2. Replace `echarts.min.js` and update the table above (version, URL, SHA-256, size).
3. Regenerate a sample report and verify all charts render with the project palette.
