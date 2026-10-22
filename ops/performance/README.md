# Mobile performance checks

The Lighthouse workflow audits the current live homepage, valuation, calculator and insights pages. It runs three fresh audits per URL. A push trigger does not wait for Netlify deployment, so use the report timestamps when associating a result with a release; manually rerun after a deployment if needed.

## Reproducible image sizing

The pinned `treosh/lighthouse-ci-action` commit uses Lighthouse 12.6.1. Its image-delivery insight compares painted image dimensions, which depend on Chrome’s host scale. On a 1x host with 1.75x emulation, it can report a sharp 720px poster displayed at 360 CSS pixels as 75% oversized. Launching Chrome with `--force-device-scale-factor=1.75` aligns the host scale with the existing mobile emulation. The viewport, network/CPU throttling, image threshold and responsive assets are unchanged. The earlier DPR-related upstream work is documented at https://github.com/GoogleChrome/lighthouse/pull/16771; this configuration is independently calibrated against the actual pinned runner.

The homepage job first runs `scripts/check-lighthouse-calibration.mjs`. It serves only two local test pages and the real 720px poster on loopback, then runs the same Lighthouse version/settings against both. At 360 CSS pixels, the responsive candidate must pass. At 120 CSS pixels, the identical image must fail the 0.9 image-delivery gate and identify more than 12 KiB of waste. Both must actually load the image. If either expectation fails, the job fails. It does not alter, suppress or retry failed live-page assertions.

Run locally (Chrome installed):

```sh
node scripts/check-lighthouse-calibration.mjs /tmp/joetay-lighthouse-calibration
npm run test:lighthouse
```

`CHROME_PATH` can point to an installed Chrome executable. Calibration uses `npx lighthouse@12.6.1`; if changing the action or engine, update the calibration version only after both positive and negative fixtures pass. Full images, display density and audit thresholds must not be reduced to obtain a pass.

## Variability and evidence

Performance, FCP, LCP, CLS and TBT assertions explicitly use the median of three runs, at their existing thresholds/severities. Accessibility and image-delivery checks remain hard failures. `scripts/lighthouse-summary.mjs` prints every run alongside the median, actual Chrome/Lighthouse versions and CPU benchmark. A TBT outlier above the configured budget or a CPU-benchmark spread of at least 1.5x produces a visible warning. No run is discarded. A CPU benchmark swing is diagnostic evidence, not proof that a slowdown is unrelated to the site.

Per-page artifacts have distinct names. They preserve all raw reports, assertion results, summaries, timestamped Chrome traces and network logs for 30 days, including when assertions fail. `saveAssets` uses Lighthouse’s timestamped URL filenames; traces can be matched to report `fetchTime`. Do not start another audit in the same checkout/output folder at the same time.

To inspect downloaded reports:

```sh
node scripts/lighthouse-summary.mjs /path/to/lighthouseci https://joetay.com/
```

Missing, duplicate, runtime-error or wrong-URL runs make the summary step fail instead of publishing an incomplete median. The summary complements LHCI assertions; it does not replace them.
