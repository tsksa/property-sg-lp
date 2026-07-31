#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILE = path.join(ROOT, 'new-launches', 'projects.json');

export const EXPECTED_2026_PROJECTS = [
  'Coastal Cabana',
  'Newport Residences',
  'Narra Residences',
  'River Modern',
  'Rivelle Tampines',
  'Pinery Residences',
  'Tengah Garden Residences',
  'Vela Bay',
  'Hudson Place Residences',
  'Lentor Gardens Residences',
  'Dunearn House',
  'Thomson Reserve',
  'Lucerne Grand',
  'Chuan Grove',
  'Amberwood at Holland',
  'Former Pastoral View',
  'Dorset Road',
  'Woodlands Drive 17 EC',
  'Chencharu Close',
  'Sembawang Road EC',
  'Upper Thomson Road',
  'Senja Close EC',
  'Keppel Bay Plot 6',
];

const REQUIRED_STRING_FIELDS = [
  'slug',
  'name',
  'location',
  'district',
  'region',
  'propertyType',
  'tenure',
  'developer',
  'status',
  'canonicalUrl',
  'verifiedAt',
];
const PROVENANCE_GROUPS = ['facts', 'timing', 'status', 'dynamics'];
const PROVENANCE_FIELDS = {
  facts: [
    'name',
    'location',
    'district',
    'region',
    'propertyType',
    'tenure',
    'developer',
    'unitCount',
    'inventoryYear',
  ],
  timing: ['previewDate', 'bookingDate', 'launchWindow'],
  status: ['status', 'verifiedAt'],
  dynamics: ['priceFrom', 'averagePsf', 'soldPercent'],
};
const DYNAMIC_FIELDS = ['priceFrom', 'averagePsf', 'soldPercent'];
const ALLOWED_SOURCE_CATEGORIES = new Set([
  'government',
  'corporate-filing',
  'portal-corroboration',
]);
const ALLOWED_STATUSES = new Set(['selling', 'upcoming', 'sold-out']);
const ALLOWED_REGIONS = new Set(['CCR', 'RCR', 'OCR']);
const ALLOWED_PROPERTY_TYPES = new Set([
  'condominium',
  'executive-condominium',
]);
const ALLOWED_TENURES = new Set(['freehold', '99-year']);
const PLACEHOLDER_PATTERN = /(?:\$?\s*—|placeholder|price\s+tba|from\s+\$—)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PARTIAL_DATE = /^(?:\d{4}-\d{2}|\d{4}-Q[1-4])$/;

function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) &&
    date.toISOString().slice(0, 10) === value;
}

function ageInDays(older, newer) {
  return (
    new Date(`${newer}T00:00:00Z`) - new Date(`${older}T00:00:00Z`)
  ) / 86_400_000;
}

function projectLabel(project, index) {
  return project?.slug || project?.name || `projects[${index}]`;
}

export function validateNewLaunchData(
  data,
  { now = new Date(), dataFile = 'new-launches/projects.json' } = {},
) {
  const errors = [];
  const fail = (message) => errors.push(`${dataFile}: ${message}`);
  const today = now.toISOString().slice(0, 10);

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return [`${dataFile}: root must be an object`];
  }
  if (data.schemaVersion !== 1) {
    fail('schemaVersion must be 1');
  }
  if (!isIsoDate(data.inventoryAsOf)) {
    fail('inventoryAsOf must be a real ISO date');
  }
  if (
    !Number.isInteger(data.dynamicFreshnessDays) ||
    data.dynamicFreshnessDays < 1
  ) {
    fail('dynamicFreshnessDays must be a positive integer');
  }
  if (
    !data.provenanceFields ||
    typeof data.provenanceFields !== 'object' ||
    Array.isArray(data.provenanceFields)
  ) {
    fail('provenanceFields must be an object');
  } else {
    for (const group of PROVENANCE_GROUPS) {
      const actual = data.provenanceFields[group];
      if (
        !Array.isArray(actual) ||
        JSON.stringify(actual) !== JSON.stringify(PROVENANCE_FIELDS[group])
      ) {
        fail(
          `provenanceFields.${group} must enumerate its canonical field set`,
        );
      }
    }
  }

  const sources = data.sources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    fail('sources must be an object');
  } else {
    for (const [sourceId, source] of Object.entries(sources)) {
      if (!sourceId.trim()) fail('source IDs must not be empty');
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        fail(`source ${sourceId} must be an object`);
        continue;
      }
      if (typeof source.name !== 'string' || !source.name.trim()) {
        fail(`source ${sourceId}.name is required`);
      }
      if (!ALLOWED_SOURCE_CATEGORIES.has(source.category)) {
        fail(`source ${sourceId}.category is invalid`);
      }
      try {
        const url = new URL(source.url);
        if (url.protocol !== 'https:') throw new Error('not HTTPS');
      } catch {
        fail(`source ${sourceId}.url must be a valid HTTPS URL`);
      }
      if (!isIsoDate(source.checkedAt)) {
        fail(`source ${sourceId}.checkedAt must be a real ISO date`);
      }
    }
  }

  if (!Array.isArray(data.projects)) {
    fail('projects must be an array');
    return errors;
  }

  const seenSlugs = new Set();
  const seenNames = new Set();
  const canonicalUrls = new Set();

  for (const [index, project] of data.projects.entries()) {
    const label = projectLabel(project, index);
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      fail(`${label} must be an object`);
      continue;
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      if (typeof project[field] !== 'string' || !project[field].trim()) {
        fail(`${label}.${field} is required`);
      } else if (PLACEHOLDER_PATTERN.test(project[field])) {
        fail(`${label}.${field} contains placeholder content`);
      }
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.slug || '')) {
      fail(`${label}.slug must be a lowercase kebab-case slug`);
    }
    if (seenSlugs.has(project.slug)) fail(`${label}.slug is duplicated`);
    else seenSlugs.add(project.slug);
    if (seenNames.has(project.name)) fail(`${label}.name is duplicated`);
    else seenNames.add(project.name);
    if (canonicalUrls.has(project.canonicalUrl)) {
      fail(`${label}.canonicalUrl is duplicated`);
    } else {
      canonicalUrls.add(project.canonicalUrl);
    }

    const expectedUrl =
      `https://joetay.com/new-launches/${project.slug}.html`;
    if (project.canonicalUrl !== expectedUrl) {
      fail(`${label}.canonicalUrl must be ${expectedUrl}`);
    }
    if (!/^D(?:0[1-9]|1\d|2[0-8])$/.test(project.district || '')) {
      fail(`${label}.district must be D01 through D28`);
    }
    if (!ALLOWED_REGIONS.has(project.region)) {
      fail(`${label}.region is invalid`);
    }
    if (!ALLOWED_PROPERTY_TYPES.has(project.propertyType)) {
      fail(`${label}.propertyType is invalid`);
    }
    if (!ALLOWED_TENURES.has(project.tenure)) {
      fail(`${label}.tenure is invalid`);
    }
    if (!ALLOWED_STATUSES.has(project.status)) {
      fail(`${label}.status is invalid`);
    }
    if (!Number.isInteger(project.unitCount) || project.unitCount < 1) {
      fail(`${label}.unitCount must be a positive integer`);
    }
    if (!Number.isInteger(project.inventoryYear) || project.inventoryYear < 2000) {
      fail(`${label}.inventoryYear must be a four-digit year`);
    }
    if (!isIsoDate(project.verifiedAt)) {
      fail(`${label}.verifiedAt must be a real ISO date`);
    }
    for (const field of ['previewDate', 'bookingDate']) {
      if (project[field] !== null && !isIsoDate(project[field])) {
        fail(`${label}.${field} must be null or a real ISO date`);
      }
    }
    if (
      project.launchWindow !== null &&
      (typeof project.launchWindow !== 'string' ||
        !PARTIAL_DATE.test(project.launchWindow))
    ) {
      fail(`${label}.launchWindow must be null, YYYY-MM or YYYY-QN`);
    }

    const provenance = project.provenance;
    if (
      !provenance ||
      typeof provenance !== 'object' ||
      Array.isArray(provenance)
    ) {
      fail(`${label}.provenance must be an object`);
    } else {
      for (const group of PROVENANCE_GROUPS) {
        const sourceIds = provenance[group];
        if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
          fail(`${label}.provenance.${group} requires at least one source`);
          continue;
        }
        for (const sourceId of sourceIds) {
          if (!sources?.[sourceId]) {
            fail(
              `${label}.provenance.${group} references unknown source ${sourceId}`,
            );
          }
        }
      }
    }

    for (const field of DYNAMIC_FIELDS) {
      const dynamic = project[field];
      if (!dynamic || typeof dynamic !== 'object' || Array.isArray(dynamic)) {
        fail(`${label}.${field} must be an object`);
        continue;
      }
      if (dynamic.value === null) {
        if (dynamic.asOf !== null) {
          fail(`${label}.${field}.asOf must be null when value is null`);
        }
        continue;
      }
      if (typeof dynamic.value !== 'number' || !Number.isFinite(dynamic.value)) {
        fail(`${label}.${field}.value must be a number or null`);
        continue;
      }
      if (field === 'soldPercent') {
        if (dynamic.value < 0 || dynamic.value > 100) {
          fail(`${label}.soldPercent.value must be between 0 and 100`);
        }
      } else if (dynamic.value <= 0) {
        fail(`${label}.${field}.value must be greater than zero`);
      }
      if (!isIsoDate(dynamic.asOf)) {
        fail(`${label}.${field}.asOf must be a real ISO date`);
        continue;
      }
      const age = ageInDays(dynamic.asOf, today);
      if (age < 0) {
        fail(`${label}.${field} is dated in the future`);
      } else if (age > data.dynamicFreshnessDays) {
        fail(
          `${label}.${field} is ${Math.floor(age)} days old; ` +
            `maximum is ${data.dynamicFreshnessDays}`,
        );
      }
    }

    if (project.inventoryYear < 2026) {
      const evidence = project.legacyInventoryEvidence;
      if (
        !evidence ||
        evidence.remainingInventoryVerified !== true ||
        !isIsoDate(evidence.checkedAt) ||
        !Array.isArray(evidence.sourceIds) ||
        evidence.sourceIds.length === 0
      ) {
        fail(
          `${label}.legacyInventoryEvidence must verify remaining inventory`,
        );
      } else {
        for (const sourceId of evidence.sourceIds) {
          if (!sources?.[sourceId]) {
            fail(
              `${label}.legacyInventoryEvidence references unknown source ${sourceId}`,
            );
          }
        }
      }
    } else if (project.legacyInventoryEvidence !== null) {
      fail(`${label}.legacyInventoryEvidence must be null for 2026 projects`);
    }
  }

  for (const name of EXPECTED_2026_PROJECTS) {
    const matches = data.projects.filter(
      (project) => project.inventoryYear === 2026 && project.name === name,
    );
    if (matches.length !== 1) {
      fail(`expected one 2026 record for ${name}; found ${matches.length}`);
    }
  }

  if (!Array.isArray(data.legacyReview)) {
    fail('legacyReview must be an array');
  } else {
    const reviewSlugs = new Set();
    for (const review of data.legacyReview) {
      const label = `legacyReview.${review?.slug || 'unknown'}`;
      if (
        !review ||
        typeof review.slug !== 'string' ||
        !review.slug.trim()
      ) {
        fail(`${label}.slug is required`);
        continue;
      }
      if (reviewSlugs.has(review.slug)) {
        fail(`${label}.slug is duplicated`);
      }
      reviewSlugs.add(review.slug);
      if (!['retained', 'excluded', 'superseded'].includes(review.disposition)) {
        fail(`${label}.disposition is invalid`);
      }
      if (typeof review.reason !== 'string' || !review.reason.trim()) {
        fail(`${label}.reason is required`);
      }
      if (!isIsoDate(review.checkedAt)) {
        fail(`${label}.checkedAt must be a real ISO date`);
      }
      if (!Array.isArray(review.sourceIds) || review.sourceIds.length === 0) {
        fail(`${label}.sourceIds requires at least one source`);
      } else {
        for (const sourceId of review.sourceIds) {
          if (!sources?.[sourceId]) {
            fail(`${label}.sourceIds references unknown source ${sourceId}`);
          }
        }
      }
      const inProjects = seenSlugs.has(review.slug);
      if (review.disposition === 'retained' && !inProjects) {
        fail(`${label} is retained but missing from projects`);
      }
      if (review.disposition !== 'retained' && inProjects) {
        fail(`${label} is ${review.disposition} but present in projects`);
      }
      if (
        review.disposition === 'superseded' &&
        (!review.replacementSlug || !seenSlugs.has(review.replacementSlug))
      ) {
        fail(`${label}.replacementSlug must reference a retained project`);
      }
    }
  }

  return errors;
}

export function readNewLaunchData(file = DATA_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let data;
  try {
    data = readNewLaunchData();
  } catch (error) {
    console.error(`::error file=new-launches/projects.json::${error.message}`);
    process.exit(1);
  }

  const errors = validateNewLaunchData(data);
  for (const error of errors) {
    console.error(`::error file=new-launches/projects.json::${error}`);
  }
  if (errors.length) process.exit(1);
  console.log(
    `Validated ${data.projects.length} new-launch records ` +
      `(${EXPECTED_2026_PROJECTS.length} from the 2026 inventory)`,
  );
}
