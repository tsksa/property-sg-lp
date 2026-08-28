const DEFAULT_ORIGIN = 'https://joetay.com';

export const RESOURCE_CONTRACTS = [
  {
    path: '/',
    markers: ['id="heroForm"', 'id="finalForm"', '/assets/conversion-tracking.js'],
  },
  {
    path: '/valuation.html',
    markers: ['id="valForm"', 'valuation_form_recovery', '/assets/conversion-tracking.js'],
  },
  {
    path: '/sell/',
    markers: ['id="sellForm"', 'id="sellFormFinal"', 'seller_form_recovery', '/assets/conversion-tracking.js'],
  },
  {
    path: '/rent-out/',
    markers: ['id="rentForm"', 'id="rentFormFinal"', 'landlord_form_recovery', '/assets/conversion-tracking.js'],
  },
  {
    path: '/new-launches/',
    markers: ['new-launches.js', '/assets/conversion-tracking.js'],
  },
  {
    path: '/new-launches/keppel-bay-plot-6.html',
    markers: ['id="projectForm"', 'project-page-form.js', '/assets/conversion-tracking.js'],
  },
  {
    path: '/assets/conversion-tracking.js',
    markers: ['window.jtShowFormRecovery', 'data-jt-form-recovery', 'data-cta-location', 'data-lead-type'],
  },
  {
    path: '/new-launches/new-launches.js',
    markers: ['full_name:', 'mobile_number:', 'new_launch_modal_recovery', 'jtShowFormRecovery'],
  },
  {
    path: '/new-launches/project-page-form.js',
    markers: ['full_name:', 'mobile_number:', 'project_form_recovery', 'jtShowFormRecovery'],
  },
];

function cleanOrigin(value) {
  const origin = new URL(value || DEFAULT_ORIGIN).origin;
  if (!/^https:\/\//.test(origin)) throw new Error('production form health origin must use HTTPS');
  return origin;
}

async function fetchResource(fetchImpl, origin, contract) {
  const response = await fetchImpl(origin + contract.path, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 200) {
    throw new Error(`${contract.path} returned HTTP ${response.status}`);
  }

  const body = await response.text();
  for (const marker of contract.markers) {
    if (!body.includes(marker)) throw new Error(`${contract.path} is missing required form marker: ${marker}`);
  }
  return contract.path;
}

async function checkPreflight(fetchImpl, origin) {
  const response = await fetchImpl(origin + '/api/submit-lead', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status !== 204) throw new Error(`/api/submit-lead OPTIONS returned HTTP ${response.status}`);

  const allowedOrigin = response.headers.get('access-control-allow-origin');
  if (allowedOrigin !== origin) {
    throw new Error(`/api/submit-lead returned unexpected Access-Control-Allow-Origin: ${allowedOrigin || 'missing'}`);
  }
}

export async function runProductionFormHealth({
  origin = DEFAULT_ORIGIN,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const checkedOrigin = cleanOrigin(origin);
  const checked = [];

  // Deliberately GET/OPTIONS-only: this monitor never submits a lead payload.
  for (const contract of RESOURCE_CONTRACTS) {
    checked.push(await fetchResource(fetchImpl, checkedOrigin, contract));
    log(`OK ${contract.path}`);
  }
  await checkPreflight(fetchImpl, checkedOrigin);
  log('OK /api/submit-lead OPTIONS + CORS');

  return { origin: checkedOrigin, resources: checked, preflight: true };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  runProductionFormHealth({ origin: process.env.FORM_HEALTH_ORIGIN || DEFAULT_ORIGIN })
    .then((result) => {
      console.log(`Production form health passed: ${result.resources.length} resources, no lead submitted.`);
    })
    .catch((error) => {
      console.error(`::error::Production form health failed: ${error.message}`);
      process.exitCode = 1;
    });
}
