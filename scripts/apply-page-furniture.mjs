#!/usr/bin/env node
// Re-applies every piece of shared page furniture, in the one order that leaves
// all their --check modes passing. The data-page generators (estate, condo)
// emit a bare page shell, so their monthly refresh workflows must run this
// afterwards or the refresh PR strips the consent banner, theme, mobile menu
// and tracking from every regenerated page.
//
// Order matters: the consent banner keys off the tracking tags, so it runs
// after conversion tracking (the other way round leaves it stale).
//
// Run: node scripts/apply-page-furniture.mjs

import { execFileSync } from 'node:child_process';

export const FURNITURE_STEPS = [
  'apply-site-header.mjs',
  'apply-mobile-header.mjs',
  'apply-site-footer.mjs',
  'apply-conversion-tracking.mjs',
  'apply-consent-banner.mjs',
  'apply-self-hosted-fonts.mjs',
];

for (const step of FURNITURE_STEPS) {
  execFileSync(process.execPath, [`scripts/${step}`], { stdio: 'inherit' });
}
