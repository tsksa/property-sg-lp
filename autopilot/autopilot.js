const STATE_KEY = "homelah-autopilot-state-v1";
const DECISIONS_KEY = "homelah-autopilot-decisions-v1";
const EVIDENCE_KEY = "homelah-autopilot-evidence-v1";
const DOSSIER_KEY = "homelah-autopilot-dossier-v1";
const ONEMAP_API = "https://www.onemap.gov.sg/api/common/elastic/search";
const DATASTORE_API = "https://data.gov.sg/api/action/datastore_search";
const HDB_RESALE_DATASET = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";
const HDB_RENT_DATASET = "d_c9f57187485a850908655db0e8cfe651";
const PDFJS_MODULE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";
const TESSERACT_MODULE = "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js";
const SQM_TO_SQFT = 10.7639;
const datasetCache = new Map();
const ROAD_ABBREVIATIONS = Object.freeze({
  AVENUE: "AVE",
  BUKIT: "BT",
  CENTRAL: "CTRL",
  CLOSE: "CL",
  COMMONWEALTH: "C'WEALTH",
  CRESCENT: "CRES",
  DRIVE: "DR",
  GARDENS: "GDNS",
  HEIGHTS: "HTS",
  JALAN: "JLN",
  KAMPONG: "KG",
  LORONG: "LOR",
  NORTH: "NTH",
  PARK: "PK",
  PLACE: "PL",
  ROAD: "RD",
  SOUTH: "STH",
  STREET: "ST",
  TANJONG: "TG",
  TERRACE: "TER",
  UPPER: "UPP",
  SAINT: "ST."
});

const exampleState = Object.freeze({
  profileName: "Joe household",
  citizenship: "sc",
  propertiesOwned: "0",
  monthlyIncome: 24000,
  monthlyDebt: 1800,
  cash: 500000,
  cpf: 320000,
  objective: "investment",
  risk: "balanced",
  propertyName: "Example: Alexandra residence",
  address: "Alexandra Road, Singapore",
  propertyType: "private",
  flatType: "5 ROOM",
  size: 1184,
  price: 2200000,
  valuation: 2150000,
  remainingLease: 92,
  expectedRent: 7200,
  maintenance: 480,
  renovation: 90000,
  downPayment: 25,
  loanYears: 25,
  interest: 3.2,
  growth: 2.4,
  vacancy: 5,
  hold: 10,
  sellingCost: 2,
  legalFees: 4500,
  annualOtherCosts: 9000
});

const numericFields = new Set([
  "monthlyIncome", "monthlyDebt", "cash", "cpf", "size", "price", "valuation",
  "remainingLease", "expectedRent", "maintenance", "renovation", "downPayment",
  "loanYears", "interest", "growth", "vacancy", "hold", "sellingCost", "legalFees",
  "annualOtherCosts"
]);

const form = document.querySelector("#decision-form");
const tabs = [...document.querySelectorAll(".form-tab")];
const panels = [...document.querySelectorAll(".tab-panel")];
const inputIds = Object.keys(exampleState);
let activeTab = 0;
let currentState = loadState();
let currentAnalysis = null;
let currentEvidence = loadEvidence();
let currentDossier = loadDossier();
let evidenceRequestId = 0;
let dossierMode = "text";
let selectedDossierFile = null;
let pdfJsPromise = null;
let tesseractPromise = null;
let toastTimer;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    return { ...exampleState, ...saved };
  } catch {
    return { ...exampleState };
  }
}

function getDecisions() {
  try {
    const decisions = JSON.parse(localStorage.getItem(DECISIONS_KEY));
    return Array.isArray(decisions) ? decisions : [];
  } catch {
    return [];
  }
}

function loadEvidence() {
  try {
    const evidence = JSON.parse(localStorage.getItem(EVIDENCE_KEY));
    return evidence && typeof evidence === "object" ? evidence : null;
  } catch {
    return null;
  }
}

function loadDossier() {
  try {
    const dossier = JSON.parse(localStorage.getItem(DOSSIER_KEY));
    return dossier && typeof dossier === "object" ? dossier : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function fillForm(state) {
  inputIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = state[id];
  });
}

function readForm() {
  const state = {};
  inputIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    state[id] = numericFields.has(id) ? finiteNumber(input.value) : input.value.trim();
  });
  return state;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function currency(value, compact = false) {
  const amount = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (compact && absolute >= 1000000) {
    return `${sign}S$${(absolute / 1000000).toFixed(absolute >= 10000000 ? 1 : 2)}m`;
  }
  if (compact && absolute >= 1000) {
    return `${sign}S$${Math.round(absolute / 1000)}k`;
  }
  return `${sign}S$${new Intl.NumberFormat("en-SG", {
    maximumFractionDigits: 0
  }).format(absolute)}`;
}

function percent(value, digits = 1) {
  return `${finiteNumber(value).toFixed(digits)}%`;
}

function normalizeText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function abbreviateRoad(value) {
  return normalizeText(value)
    .split(" ")
    .map((token) => ROAD_ABBREVIATIONS[token] || token)
    .join(" ");
}

function normalizeFlatType(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function quantile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function roundTo(value, increment) {
  return Math.round(value / increment) * increment;
}

function formatMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return String(value || "—");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat("en-SG", {
    month: "short",
    year: "numeric"
  }).format(date);
}

function monthAge(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return 999;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - Number(match[1])) * 12 +
    now.getMonth() - (Number(match[2]) - 1));
}

function recordPsf(record) {
  const price = finiteNumber(record.resale_price);
  const squareMetres = finiteNumber(record.floor_area_sqm);
  if (!price || !squareMetres) return null;
  return price / (squareMetres * SQM_TO_SQFT);
}

function remainingLeaseYears(value) {
  const match = String(value || "").match(/(\d+)\s+year/i);
  return match ? Number(match[1]) : null;
}

async function fetchJson(url, timeoutMs = 15000) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 429 && attempt < 2) {
        const retryAfter = finiteNumber(response.headers.get("retry-after"));
        await new Promise((resolve) =>
          window.setTimeout(resolve, retryAfter ? retryAfter * 1000 : 1000 * (attempt + 1)));
        continue;
      }
      if (response.status === 429) {
        throw new Error("The official source is busy. Wait a minute and try again");
      }
      if (!response.ok) throw new Error(`Data source returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The data source took too long to respond");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw new Error("The data source is temporarily rate-limiting requests");
}

async function lookupAddressCandidates(query) {
  const params = new URLSearchParams({
    searchVal: query,
    returnGeom: "Y",
    getAddrDetails: "Y",
    pageNum: "1"
  });
  const data = await fetchJson(`${ONEMAP_API}?${params}`);
  const seen = new Set();
  return (data.results || []).map((result) => {
    const candidate = {
      address: String(result.ADDRESS || result.SEARCHVAL || "").trim(),
      block: String(result.BLK_NO || "").trim(),
      road: String(result.ROAD_NAME || "").trim(),
      building: String(result.BUILDING || "").trim(),
      postal: String(result.POSTAL || "").trim(),
      latitude: String(result.LATITUDE || "").trim(),
      longitude: String(result.LONGITUDE || "").trim()
    };
    const key = `${normalizeText(candidate.address)}|${candidate.postal}`;
    if (!candidate.address || seen.has(key)) return null;
    seen.add(key);
    return candidate;
  }).filter(Boolean).slice(0, 8);
}

async function queryDataset(datasetId, filters, sortField, limit = 500) {
  const params = new URLSearchParams({
    resource_id: datasetId,
    filters: JSON.stringify(filters),
    sort: `${sortField} desc`,
    limit: String(limit)
  });
  const cacheKey = `${datasetId}|${params}`;
  if (datasetCache.has(cacheKey)) return datasetCache.get(cacheKey);
  const data = await fetchJson(`${DATASTORE_API}?${params}`);
  if (!data || data.success !== true || !data.result) {
    throw new Error("The official dataset returned an unexpected response");
  }
  const records = data.result.records || [];
  datasetCache.set(cacheKey, records);
  return records;
}

async function queryAddressRecords(datasetId, block, road, sortField, includeBlock) {
  const fullRoad = normalizeText(road);
  const roadVariants = [...new Set([abbreviateRoad(fullRoad), fullRoad])].filter(Boolean);
  let lastResult = { records: [], datasetRoad: roadVariants[0] || fullRoad };
  for (const datasetRoad of roadVariants) {
    const filters = { street_name: datasetRoad };
    if (includeBlock && block) filters.block = String(block).trim().toUpperCase();
    const records = await queryDataset(datasetId, filters, sortField);
    lastResult = { records, datasetRoad };
    if (records.length) return lastResult;
  }
  return lastResult;
}

function uniqueRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = String(record._id || [
      record.month || record.rent_approval_date,
      record.block,
      record.street_name,
      record.flat_type,
      record.resale_price || record.monthly_rent,
      record.floor_area_sqm || ""
    ].join("|"));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferFlatType(records, subjectSqft, preferredType) {
  const groups = new Map();
  records.forEach((record) => {
    const type = normalizeFlatType(record.flat_type);
    const size = finiteNumber(record.floor_area_sqm) * SQM_TO_SQFT;
    if (!type || !size) return;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(size);
  });

  const preferred = normalizeFlatType(preferredType);
  if (currentState.propertyType === "hdb" && groups.has(preferred)) return preferred;
  if (!groups.size) return preferred || "HDB";
  if (!subjectSqft) {
    return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  }

  return [...groups.entries()]
    .map(([type, sizes]) => ({ type, distance: Math.abs(median(sizes) - subjectSqft) }))
    .sort((a, b) => a.distance - b.distance)[0].type;
}

function selectSaleComparables(records, flatType, subjectSqft, block) {
  const typeMatches = records.filter((record) => normalizeFlatType(record.flat_type) === flatType);
  const sizeDifference = (record) => {
    const size = finiteNumber(record.floor_area_sqm) * SQM_TO_SQFT;
    return subjectSqft && size ? Math.abs(size - subjectSqft) / subjectSqft : 0;
  };
  const recentAndSized = typeMatches.filter((record) =>
    monthAge(record.month) <= 24 && sizeDifference(record) <= 0.2);
  const recent = typeMatches.filter((record) => monthAge(record.month) <= 24);
  const pool = recentAndSized.length >= 3
    ? recentAndSized
    : recent.length >= 3
      ? recent
      : typeMatches;

  return pool
    .filter((record) => recordPsf(record))
    .sort((a, b) => {
      const score = (record) => {
        const blockPenalty = normalizeText(record.block) === normalizeText(block) ? -24 : 0;
        return blockPenalty + monthAge(record.month) + sizeDifference(record) * 80;
      };
      return score(a) - score(b);
    })
    .slice(0, 30);
}

function buildRentEstimate(records, flatType, block) {
  const typeMatches = records.filter((record) =>
    normalizeFlatType(record.flat_type) === flatType && finiteNumber(record.monthly_rent) > 0);
  const recent = typeMatches.filter((record) => monthAge(record.rent_approval_date) <= 24);
  const sameBlockRecent = recent.filter((record) =>
    normalizeText(record.block) === normalizeText(block));
  const sameBlockAll = typeMatches.filter((record) =>
    normalizeText(record.block) === normalizeText(block));

  let pool = recent;
  let scope = "Same street";
  if (sameBlockRecent.length >= 3) {
    pool = sameBlockRecent;
    scope = "Same block";
  } else if (recent.length < 3 && sameBlockAll.length >= 3) {
    pool = sameBlockAll;
    scope = "Same block, older records";
  } else if (recent.length < 3) {
    pool = typeMatches;
    scope = "Same street, expanded period";
  }

  const rents = pool.map((record) => finiteNumber(record.monthly_rent)).filter(Boolean);
  return {
    estimate: rents.length ? roundTo(median(rents), 50) : 0,
    low: rents.length ? roundTo(quantile(rents, 0.25), 50) : 0,
    high: rents.length ? roundTo(quantile(rents, 0.75), 50) : 0,
    count: rents.length,
    scope
  };
}

function evidenceConfidence(comparables, rentCount, subjectSqft, block) {
  const sameBlockCount = comparables.filter((record) =>
    normalizeText(record.block) === normalizeText(block)).length;
  const latestAge = Math.min(...comparables.map((record) => monthAge(record.month)), 999);
  const medianSize = median(comparables.map((record) =>
    finiteNumber(record.floor_area_sqm) * SQM_TO_SQFT));
  const sizeDifference = subjectSqft && medianSize
    ? Math.abs(medianSize - subjectSqft) / subjectSqft
    : 0.5;

  const score = Math.round(
    clamp(comparables.length / 8 * 30, 0, 30) +
    clamp(sameBlockCount / 4 * 20, 0, 20) +
    clamp(20 - latestAge * 0.8, 0, 20) +
    clamp(20 - sizeDifference * 80, 0, 20) +
    clamp(rentCount / 5 * 10, 0, 10)
  );
  return {
    score,
    label: score >= 80 ? "High confidence" : score >= 60 ? "Medium confidence" : "Low confidence",
    level: score >= 80 ? "high" : score >= 60 ? "medium" : "low",
    sameBlockCount
  };
}

async function buildAddressEvidence(candidate) {
  if (!candidate.block || !candidate.road) {
    return {
      kind: "address-only",
      candidate,
      fetchedAt: new Date().toISOString(),
      applied: false
    };
  }

  const streetSales = await queryAddressRecords(
    HDB_RESALE_DATASET,
    candidate.block,
    candidate.road,
    "month",
    false
  );
  const sales = uniqueRecords(streetSales.records);
  if (!sales.length) {
    return {
      kind: "address-only",
      candidate,
      fetchedAt: new Date().toISOString(),
      applied: false
    };
  }

  let rents = [];
  let rentSourceAvailable = true;
  try {
    const streetRents = await queryAddressRecords(
      HDB_RENT_DATASET,
      candidate.block,
      candidate.road,
      "rent_approval_date",
      false
    );
    rents = uniqueRecords(streetRents.records);
  } catch {
    rentSourceAvailable = false;
  }
  const subjectSqft = Math.max(1, finiteNumber(currentState.size));
  const flatType = inferFlatType(sales, subjectSqft, currentState.flatType);
  const comparables = selectSaleComparables(sales, flatType, subjectSqft, candidate.block);
  if (!comparables.length) {
    return {
      kind: "address-only",
      candidate,
      fetchedAt: new Date().toISOString(),
      applied: false
    };
  }

  const psfValues = comparables.map(recordPsf).filter(Number.isFinite);
  const estimatedValue = roundTo(median(psfValues) * subjectSqft, 5000);
  const valueLow = roundTo(quantile(psfValues, 0.25) * subjectSqft, 5000);
  const valueHigh = roundTo(quantile(psfValues, 0.75) * subjectSqft, 5000);
  const rent = buildRentEstimate(rents, flatType, candidate.block);
  const confidence = evidenceConfidence(comparables, rent.count, subjectSqft, candidate.block);
  const leases = comparables.map((record) => remainingLeaseYears(record.remaining_lease))
    .filter(Number.isFinite);
  const latestSale = comparables.reduce((latest, record) =>
    String(record.month) > String(latest) ? record.month : latest, "");

  return {
    kind: "hdb",
    candidate,
    flatType,
    subjectSqft,
    estimatedValue,
    valueLow: Math.min(valueLow, valueHigh),
    valueHigh: Math.max(valueLow, valueHigh),
    estimatedRent: rent.estimate,
    rentLow: Math.min(rent.low, rent.high),
    rentHigh: Math.max(rent.low, rent.high),
    rentCount: rent.count,
    rentScope: rent.scope,
    rentSourceAvailable,
    saleCount: comparables.length,
    sameBlockCount: confidence.sameBlockCount,
    latestSale,
    remainingLease: leases.length ? Math.round(median(leases)) : 0,
    confidenceScore: confidence.score,
    confidenceLabel: confidence.label,
    confidenceLevel: confidence.level,
    datasetRoad: streetSales.datasetRoad,
    comparables: comparables.slice(0, 6).map((record) => ({
      id: String(record._id || ""),
      month: String(record.month || ""),
      block: String(record.block || ""),
      street: String(record.street_name || ""),
      flatType: normalizeFlatType(record.flat_type),
      storey: String(record.storey_range || ""),
      floorAreaSqm: finiteNumber(record.floor_area_sqm),
      price: finiteNumber(record.resale_price),
      psf: Math.round(recordPsf(record))
    })),
    fetchedAt: new Date().toISOString(),
    applied: false
  };
}

function saveEvidence(evidence) {
  currentEvidence = evidence;
  if (evidence) localStorage.setItem(EVIDENCE_KEY, JSON.stringify(evidence));
  else localStorage.removeItem(EVIDENCE_KEY);
}

function setEvidenceStatus(message, isError = false) {
  const status = document.querySelector("#evidence-status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setEvidenceBusy(isBusy, label = "Find evidence") {
  const button = document.querySelector("#find-evidence");
  button.disabled = isBusy;
  button.classList.toggle("is-loading", isBusy);
  button.innerHTML = isBusy
    ? '<i data-lucide="loader-circle" aria-hidden="true"></i> Loading records'
    : `<i data-lucide="search" aria-hidden="true"></i> ${label}`;
  window.lucide?.createIcons();
}

function resetEvidenceUi() {
  document.querySelector("#address-candidates").hidden = true;
  document.querySelector("#address-candidates").textContent = "";
  document.querySelector("#evidence-result").hidden = true;
  document.querySelector("#evidence-query").value = "";
  setEvidenceStatus("Resolve the exact address before loading comparable sales and rents.");
}

function handleEvidenceFailure(message) {
  const appliedEvidence = activeEvidenceFor(readForm());
  if (appliedEvidence) renderEvidence(appliedEvidence);
  else {
    saveEvidence(null);
    document.querySelector("#evidence-result").hidden = true;
  }
  setEvidenceStatus(message, true);
}

function renderAddressCandidates(candidates) {
  const container = document.querySelector("#address-candidates");
  container.textContent = "";
  candidates.forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "address-candidate";
    button.dataset.candidateIndex = String(index);

    const copy = document.createElement("span");
    const title = document.createElement("span");
    title.textContent = candidate.address;
    const meta = document.createElement("small");
    meta.textContent = candidate.postal
      ? `Singapore ${candidate.postal}${candidate.building && candidate.building !== "NIL" ? ` · ${candidate.building}` : ""}`
      : candidate.building || "OneMap address match";
    copy.append(title, meta);

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "arrow-right");
    icon.setAttribute("aria-hidden", "true");
    button.append(copy, icon);
    container.append(button);
  });
  container.hidden = false;
  container._candidates = candidates;
  window.lucide?.createIcons();
}

function renderComparableRows(comparables) {
  const body = document.querySelector("#evidence-comparables");
  body.textContent = "";
  comparables.forEach((comparable) => {
    const row = document.createElement("tr");
    const squareFeet = Math.round(comparable.floorAreaSqm * SQM_TO_SQFT);
    const cells = [
      formatMonth(comparable.month),
      `Blk ${comparable.block}`,
      `${new Intl.NumberFormat("en-SG").format(squareFeet)} sq ft`,
      comparable.storey.replace(/\s*TO\s*/i, "–") || "—",
      currency(comparable.price),
      `${currency(comparable.psf)}/psf`
    ];
    cells.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
}

function renderEvidence(evidence) {
  if (!evidence || !evidence.candidate) {
    resetEvidenceUi();
    return;
  }

  const result = document.querySelector("#evidence-result");
  const hdbEvidence = document.querySelector("#hdb-evidence");
  const privateEvidence = document.querySelector("#private-evidence");
  const confidence = document.querySelector("#evidence-confidence");
  const candidate = evidence.candidate;

  result.hidden = false;
  const queryInput = document.querySelector("#evidence-query");
  if (!queryInput.value) queryInput.value = candidate.postal || candidate.address;
  document.querySelector("#resolved-address-name").textContent = candidate.address;
  document.querySelector("#resolved-address-meta").textContent = candidate.postal
    ? `OneMap verified · Singapore ${candidate.postal}`
    : "OneMap verified address";

  confidence.className = "confidence-badge";
  if (evidence.kind !== "hdb") {
    hdbEvidence.hidden = true;
    privateEvidence.hidden = false;
    confidence.textContent = "Address verified";
    confidence.classList.add("verified");
    setEvidenceStatus("Exact address resolved. No matching HDB resale records were found.");
    window.lucide?.createIcons();
    return;
  }

  hdbEvidence.hidden = false;
  privateEvidence.hidden = true;
  confidence.textContent = `${evidence.confidenceLabel} · ${evidence.confidenceScore}/100`;
  confidence.classList.add(evidence.confidenceLevel);
  document.querySelector("#evidence-value").textContent = currency(evidence.estimatedValue, true);
  document.querySelector("#evidence-value-range").textContent =
    `${currency(evidence.valueLow, true)}–${currency(evidence.valueHigh, true)}`;
  document.querySelector("#evidence-rent").textContent = evidence.estimatedRent
    ? `${currency(evidence.estimatedRent)}/mo`
    : evidence.rentSourceAvailable === false
      ? "Source unavailable"
      : "No close match";
  document.querySelector("#evidence-rent-range").textContent = evidence.estimatedRent
    ? `${currency(evidence.rentLow)}–${currency(evidence.rentHigh)} · ${evidence.rentScope}`
    : evidence.rentSourceAvailable === false
      ? "Keep your manual rent assumption"
      : "No matching approved rentals";
  document.querySelector("#evidence-sales-count").textContent = String(evidence.saleCount);
  document.querySelector("#evidence-sales-freshness").textContent =
    `Latest ${formatMonth(evidence.latestSale)}`;
  document.querySelector("#evidence-flat-type").textContent = evidence.flatType;
  document.querySelector("#evidence-source-scope").textContent =
    evidence.rentSourceAvailable === false
      ? `${evidence.sameBlockCount} same-block · Rent source unavailable`
      : `${evidence.sameBlockCount} same-block · ${evidence.rentCount} rents`;
  document.querySelector("#evidence-method").textContent =
    `Value uses median PSF from ${evidence.saleCount} selected ${evidence.flatType.toLowerCase()} sales near ${Math.round(evidence.subjectSqft).toLocaleString("en-SG")} sq ft.`;
  document.querySelector("#apply-evidence").disabled = false;
  renderComparableRows(evidence.comparables);
  setEvidenceStatus(evidence.applied
    ? "Evidence is applied to this decision. Re-run the lookup after changing the subject size."
    : evidence.rentSourceAvailable === false
      ? "Sale evidence is ready. The rental source is temporarily unavailable, so rent was not changed."
      : "Evidence ready. Review the comparable set before applying it to the decision.");
  window.lucide?.createIcons();
}

async function selectAddressCandidate(candidate, requestId) {
  document.querySelector("#address-candidates").hidden = true;
  document.querySelector("#evidence-result").hidden = true;
  setEvidenceBusy(true);
  setEvidenceStatus(`Loading official records for ${candidate.address}…`);
  try {
    const evidence = await buildAddressEvidence(candidate);
    if (requestId !== evidenceRequestId) return;
    saveEvidence(evidence);
    renderEvidence(evidence);
  } catch (error) {
    if (requestId !== evidenceRequestId) return;
    handleEvidenceFailure(
      `The address was resolved, but official records could not be loaded. ${error.message}.`
    );
  } finally {
    if (requestId === evidenceRequestId) setEvidenceBusy(false);
  }
}

async function findEvidence() {
  const query = document.querySelector("#evidence-query").value.trim();
  if (query.length < 3) {
    setEvidenceStatus("Enter a 6-digit postal code or at least 3 address characters.", true);
    document.querySelector("#evidence-query").focus();
    return;
  }

  const requestId = ++evidenceRequestId;
  document.querySelector("#address-candidates").hidden = true;
  document.querySelector("#evidence-result").hidden = true;
  setEvidenceBusy(true);
  setEvidenceStatus("Resolving the address with OneMap…");

  try {
    const candidates = await lookupAddressCandidates(query);
    if (requestId !== evidenceRequestId) return;
    if (!candidates.length) {
      handleEvidenceFailure("No Singapore address matched that search. Try the 6-digit postal code.");
      setEvidenceBusy(false);
      return;
    }

    const exactPostal = /^\d{6}$/.test(query)
      ? candidates.find((candidate) => candidate.postal === query)
      : null;
    if (exactPostal || candidates.length === 1) {
      await selectAddressCandidate(exactPostal || candidates[0], requestId);
      return;
    }

    renderAddressCandidates(candidates);
    setEvidenceStatus(`${candidates.length} possible addresses found. Select the exact property.`);
    setEvidenceBusy(false, "Search again");
  } catch (error) {
    if (requestId !== evidenceRequestId) return;
    handleEvidenceFailure(`Address lookup failed. ${error.message}.`);
    setEvidenceBusy(false);
  }
}

function applyEvidence() {
  if (!currentEvidence || currentEvidence.kind !== "hdb") return;
  const state = readForm();
  const replacingExample =
    state.propertyName === exampleState.propertyName &&
    state.address === exampleState.address &&
    state.price === exampleState.price;
  const candidate = currentEvidence.candidate;
  const propertyLabel = `Blk ${candidate.block} ${candidate.road}`;

  currentEvidence = {
    ...currentEvidence,
    applied: true,
    appliedAt: new Date().toISOString()
  };
  saveEvidence(currentEvidence);
  currentState = {
    ...state,
    propertyName: propertyLabel,
    address: candidate.address,
    propertyType: "hdb",
    flatType: currentEvidence.flatType,
    price: replacingExample ? currentEvidence.estimatedValue : state.price,
    valuation: currentEvidence.estimatedValue,
    remainingLease: currentEvidence.remainingLease || state.remainingLease,
    expectedRent: currentEvidence.estimatedRent || state.expectedRent,
    maintenance: replacingExample ? 100 : state.maintenance
  };
  fillForm(currentState);
  updateFlatTypeVisibility();
  saveState(currentState);
  updateAnalysis(currentState, analyze(currentState));
  renderEvidence(currentEvidence);
  showToast("Official evidence applied to the decision");
}

function updateFlatTypeVisibility() {
  const field = document.querySelector("#flat-type-field");
  field.hidden = document.querySelector("#propertyType").value !== "hdb";
}

function saveDossier(dossier) {
  currentDossier = dossier;
  if (dossier) localStorage.setItem(DOSSIER_KEY, JSON.stringify(dossier));
  else localStorage.removeItem(DOSSIER_KEY);
}

function setDossierStatus(message, tone = "") {
  const status = document.querySelector("#dossier-status");
  status.textContent = message;
  status.className = `dossier-status${tone ? ` ${tone}` : ""}`;
}

function setDossierBusy(isBusy) {
  const button = document.querySelector("#analyze-dossier");
  button.disabled = isBusy;
  button.classList.toggle("is-loading", isBusy);
  button.innerHTML = isBusy
    ? '<i data-lucide="loader-circle" aria-hidden="true"></i> Analyzing'
    : '<i data-lucide="scan-text" aria-hidden="true"></i> Analyze source';
  window.lucide?.createIcons();
}

function setDossierMode(mode) {
  dossierMode = mode;
  document.querySelectorAll("[data-dossier-mode]").forEach((button) => {
    const active = button.dataset.dossierMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-dossier-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.dossierPanel !== mode;
  });
}

function normalizeSourceText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function flattenJson(value, prefix = "", lines = [], depth = 0) {
  if (depth > 6 || lines.length > 1000) return lines;
  if (Array.isArray(value)) {
    value.slice(0, 60).forEach((item, index) =>
      flattenJson(item, `${prefix}[${index}]`, lines, depth + 1));
    return lines;
  }
  if (value && typeof value === "object") {
    Object.entries(value).slice(0, 100).forEach(([key, item]) =>
      flattenJson(item, prefix ? `${prefix}.${key}` : key, lines, depth + 1));
    return lines;
  }
  if (value !== null && value !== undefined && String(value).trim()) {
    lines.push(`${prefix}: ${String(value).trim()}`);
  }
  return lines;
}

function htmlToSource(html) {
  const documentNode = new DOMParser().parseFromString(String(html || ""), "text/html");
  const title = normalizeSourceText(
    documentNode.querySelector('meta[property="og:title"]')?.content ||
    documentNode.querySelector("title")?.textContent ||
    "Public listing"
  );
  const description = [
    documentNode.querySelector('meta[name="description"]')?.content,
    documentNode.querySelector('meta[property="og:description"]')?.content
  ].filter(Boolean);
  const structured = [];
  documentNode.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      flattenJson(JSON.parse(script.textContent || ""), "", structured);
    } catch {
      // Invalid publisher JSON-LD is ignored; visible page text remains available.
    }
  });
  documentNode.querySelectorAll("script, style, noscript, svg, template").forEach((node) => node.remove());
  const bodyText = documentNode.body?.textContent || "";
  return {
    title,
    text: normalizeSourceText([title, ...description, ...structured, bodyText].filter(Boolean).join("\n"))
      .slice(0, 500000)
  };
}

function validateDossierFile(file) {
  if (!file) throw new Error("Choose a file first");
  const name = String(file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/.test(name);
  const isText = file.type.startsWith("text/") || file.type === "application/json" ||
    /\.(txt|json|html?|md)$/.test(name);
  if (!isPdf && !isImage && !isText) {
    throw new Error("Use a PDF, PNG, JPG, WebP, TXT, JSON or HTML file");
  }
  const maximum = isPdf ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maximum) {
    throw new Error(`${isPdf ? "PDF" : "File"} exceeds the ${isPdf ? "20" : "10"} MB limit`);
  }
  return { isPdf, isImage, isText };
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_MODULE).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function extractPdfText(file) {
  setDossierStatus("Loading the PDF text layer…", "progress");
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const documentNode = await task.promise;
  const pageLimit = Math.min(documentNode.numPages, 40);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    setDossierStatus(`Reading PDF page ${pageNumber} of ${pageLimit}…`, "progress");
    const page = await documentNode.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || "").join(" "));
  }
  const text = normalizeSourceText(pages.join("\n"));
  if (text.length < 30) {
    throw new Error("This PDF has no readable text layer. Upload a page screenshot for OCR");
  }
  return {
    text,
    detail: `${pageLimit} PDF page${pageLimit === 1 ? "" : "s"}${documentNode.numPages > pageLimit ? " · first 40 read" : ""}`
  };
}

async function loadTesseract() {
  if (!tesseractPromise) tesseractPromise = import(TESSERACT_MODULE);
  return tesseractPromise;
}

async function extractImageText(file) {
  setDossierStatus("Loading English screenshot recognition…", "progress");
  const tesseract = await loadTesseract();
  const worker = await tesseract.createWorker("eng", 1, {
    logger: (message) => {
      if (message.status !== "recognizing text") return;
      const progress = Math.round(finiteNumber(message.progress) * 100);
      setDossierStatus(`Reading screenshot text · ${progress}%`, "progress");
    }
  });
  try {
    const result = await worker.recognize(file);
    const text = normalizeSourceText(result.data?.text);
    if (text.length < 20) throw new Error("No readable listing text was detected in the screenshot");
    return { text, detail: "English screenshot OCR" };
  } finally {
    await worker.terminate();
  }
}

async function extractFileSource(file) {
  const kind = validateDossierFile(file);
  if (kind.isPdf) return extractPdfText(file);
  if (kind.isImage) return extractImageText(file);

  const raw = await file.text();
  if (file.type === "application/json" || file.name.toLowerCase().endsWith(".json")) {
    try {
      return {
        text: normalizeSourceText(flattenJson(JSON.parse(raw)).join("\n")),
        detail: "Structured JSON"
      };
    } catch {
      throw new Error("The selected JSON file is invalid");
    }
  }
  if (file.type === "text/html" || /\.html?$/.test(file.name.toLowerCase())) {
    const parsed = htmlToSource(raw);
    return { text: parsed.text, detail: "Saved web page" };
  }
  return { text: normalizeSourceText(raw), detail: "Text document" };
}

function normalizePublicListingUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("Enter a complete public URL beginning with https://");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public HTTP and HTTPS URLs are supported");
  }
  if (url.username || url.password || !["", "80", "443"].includes(url.port)) {
    throw new Error("URLs with credentials or non-standard ports are blocked");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const privateIpv4 = ipv4 && (
    Number(ipv4[1]) === 10 ||
    Number(ipv4[1]) === 127 ||
    Number(ipv4[1]) === 0 ||
    (Number(ipv4[1]) === 169 && Number(ipv4[2]) === 254) ||
    (Number(ipv4[1]) === 192 && Number(ipv4[2]) === 168) ||
    (Number(ipv4[1]) === 172 && Number(ipv4[2]) >= 16 && Number(ipv4[2]) <= 31)
  );
  if (
    privateIpv4 ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Private and local-network URLs are blocked");
  }
  url.hash = "";
  return url.toString();
}

async function directListingFetch(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html,application/json,text/plain" }
    });
    if (!response.ok) throw new Error(`Listing page returned HTTP ${response.status}`);
    const contentLength = finiteNumber(response.headers.get("content-length"));
    if (contentLength > 2000000) throw new Error("Listing page exceeds the 2 MB extraction limit");
    const raw = (await response.text()).slice(0, 2000000);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json")) {
      return {
        title: new URL(response.url || url).hostname,
        text: normalizeSourceText(flattenJson(JSON.parse(raw)).join("\n")),
        finalUrl: response.url || url
      };
    }
    const parsed = htmlToSource(raw);
    return { ...parsed, finalUrl: response.url || url };
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The listing page took too long to respond");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchListingSource(value) {
  const url = normalizePublicListingUrl(value);
  setDossierStatus("Fetching the public listing page…", "progress");
  let functionError = null;

  if (window.location.protocol !== "file:") {
    try {
      const response = await fetch("/api/extract-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `URL importer returned HTTP ${response.status}`);
      }
      const parsed = htmlToSource(payload.html || "");
      return {
        text: parsed.text,
        sourceName: parsed.title || new URL(payload.finalUrl || url).hostname,
        sourceUrl: payload.finalUrl || url,
        detail: "Public listing URL"
      };
    } catch (error) {
      functionError = error;
    }
  }

  try {
    const direct = await directListingFetch(url);
    return {
      text: direct.text,
      sourceName: direct.title || new URL(direct.finalUrl || url).hostname,
      sourceUrl: direct.finalUrl || url,
      detail: "Public listing URL · direct browser fetch"
    };
  } catch {
    throw new Error(
      window.location.protocol === "file:"
        ? "URL import needs the deployed site or a page that permits browser access"
        : functionError?.message || "The listing page could not be read"
    );
  }
}

async function acquireDossierSource() {
  if (dossierMode === "text") {
    const text = normalizeSourceText(document.querySelector("#dossier-text").value);
    if (text.length < 30) throw new Error("Paste at least 30 characters of listing or document text");
    return {
      text: text.slice(0, 500000),
      sourceName: "Pasted listing text",
      sourceType: "text",
      detail: `${text.length.toLocaleString("en-SG")} characters`
    };
  }
  if (dossierMode === "file") {
    const extracted = await extractFileSource(selectedDossierFile);
    return {
      text: extracted.text.slice(0, 500000),
      sourceName: selectedDossierFile.name,
      sourceType: selectedDossierFile.type.startsWith("image/")
        ? "image"
        : selectedDossierFile.name.toLowerCase().endsWith(".pdf")
          ? "pdf"
          : "file",
      detail: extracted.detail
    };
  }
  const source = await fetchListingSource(document.querySelector("#dossier-url").value);
  return { ...source, sourceType: "url" };
}

function excerptAround(text, index, length = 0) {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + length + 90);
  return normalizeSourceText(text.slice(start, end)).slice(0, 180);
}

function firstPatternMatch(text, patterns) {
  for (const entry of patterns) {
    const match = entry.pattern.exec(text);
    if (!match) continue;
    return {
      match,
      value: match[entry.group || 1],
      confidence: entry.confidence,
      excerpt: excerptAround(text, match.index, match[0].length)
    };
  }
  return null;
}

function parseMoneyValue(value) {
  const normalized = String(value || "").toLowerCase().replace(/,/g, "").trim();
  const number = Number.parseFloat(normalized.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number)) return 0;
  if (/\b(?:m|mn|million)\b/.test(normalized)) return Math.round(number * 1000000);
  if (/\b(?:k|thousand)\b/.test(normalized)) return Math.round(number * 1000);
  return Math.round(number);
}

function confidenceLevel(score) {
  return score >= 80 ? "high" : score >= 60 ? "medium" : "low";
}

function factDisplay(key, value) {
  if (["price", "expectedRent", "maintenance"].includes(key)) {
    return key === "price" ? currency(value) : `${currency(value)}/mo`;
  }
  if (key === "size") return `${Math.round(value).toLocaleString("en-SG")} sq ft`;
  if (key === "remainingLease") return value >= 999 ? "Freehold" : `${Math.round(value)} years remaining`;
  if (key === "propertyType") return propertyTypeLabel(value);
  if (key === "flatType") return String(value).replace(" ROOM", "-room").toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
  return String(value);
}

function createFact({
  id,
  stateKey = null,
  label,
  value,
  confidence,
  excerpt,
  applyable = Boolean(stateKey)
}) {
  return {
    id,
    stateKey,
    label,
    value,
    display: factDisplay(stateKey || id, value),
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    excerpt: normalizeSourceText(excerpt).slice(0, 180),
    applyable
  };
}

function extractPropertyType(text) {
  const match = firstPatternMatch(text, [
    { pattern: /\b(HDB|DBSS)\b/i, confidence: 92 },
    { pattern: /\b(executive condominium)\b/i, confidence: 92 },
    { pattern: /\b(EC)\b/i, confidence: 76 },
    { pattern: /\b(condominium|condo|apartment|landed|terrace house|semi[- ]detached|bungalow)\b/i, confidence: 82 }
  ]);
  if (!match) return null;
  const value = /HDB|DBSS/i.test(match.value)
    ? "hdb"
    : /executive condominium|^EC$/i.test(match.value)
      ? "ec"
      : "private";
  return createFact({
    id: "propertyType",
    stateKey: "propertyType",
    label: "Property type",
    value,
    confidence: match.confidence,
    excerpt: match.excerpt
  });
}

function extractFlatType(text) {
  const room = /\b([2-5])[\s-]*(?:room|rm)\b/i.exec(text);
  if (room) {
    return createFact({
      id: "flatType",
      stateKey: "flatType",
      label: "HDB flat type",
      value: `${room[1]} ROOM`,
      confidence: 92,
      excerpt: excerptAround(text, room.index, room[0].length)
    });
  }
  const special = /\b(multi[\s-]?generation|executive maisonette|executive apartment)\b/i.exec(text);
  if (!special) return null;
  return createFact({
    id: "flatType",
    stateKey: "flatType",
    label: "HDB flat type",
    value: /multi/i.test(special[1]) ? "MULTI-GENERATION" : "EXECUTIVE",
    confidence: 88,
    excerpt: excerptAround(text, special.index, special[0].length)
  });
}

function cleanAddress(value) {
  return normalizeSourceText(value)
    .replace(/^[\s:,-]+|[\s,;.-]+$/g, "")
    .replace(/\s+(?:asking|price|size|floor area|for sale)\b.*$/i, "")
    .slice(0, 160);
}

function extractAddress(text) {
  const match = firstPatternMatch(text, [
    {
      pattern: /(?:address|location)\s*[:\-]\s*([^\n|]{6,150})/i,
      confidence: 94
    },
    {
      pattern: /\b(?:located at|situated at|at)\s+((?:blk|block)?\s*[0-9]{1,5}[A-Z]?\s+[A-Z][A-Z0-9 .'-]{3,90}?)(?=,\s*(?:\d|asking|price|size|floor)|\n|$)/i,
      confidence: 82
    },
    {
      pattern: /\b((?:BLK|BLOCK)\s+[0-9]{1,5}[A-Z]?\s+[^\n,|]{4,100}(?:SINGAPORE\s+\d{6})?)/i,
      confidence: 86
    }
  ]);
  if (!match) return null;
  const value = cleanAddress(match.value);
  if (value.length < 6) return null;
  return createFact({
    id: "address",
    stateKey: "address",
    label: "Address",
    value,
    confidence: match.confidence,
    excerpt: match.excerpt
  });
}

function extractPropertyName(text, source) {
  const labelled = firstPatternMatch(text, [
    {
      pattern: /(?:project|development|property name|listing title)\s*[:\-]\s*([^\n|]{3,100})/i,
      confidence: 90
    }
  ]);
  if (labelled) {
    return createFact({
      id: "propertyName",
      stateKey: "propertyName",
      label: "Property label",
      value: normalizeSourceText(labelled.value).slice(0, 100),
      confidence: labelled.confidence,
      excerpt: labelled.excerpt
    });
  }
  if (source.sourceType !== "url" || !source.sourceName || source.sourceName === "Public listing") return null;
  const value = source.sourceName
    .replace(/\s*[|–—-]\s*(?:PropertyGuru|99\.co|EdgeProp|SRX|Ohmyhome).*$/i, "")
    .replace(/\s+(?:for sale|for rent)\b.*$/i, "")
    .trim()
    .slice(0, 100);
  if (value.length < 3) return null;
  return createFact({
    id: "propertyName",
    stateKey: "propertyName",
    label: "Property label",
    value,
    confidence: 58,
    excerpt: `Page title: ${source.sourceName}`
  });
}

function extractAskingPrice(text) {
  let match = firstPatternMatch(text, [
    {
      pattern: /(?:asking(?: price)?|listing price|guide price|sale price|listed at)\s*[:\-]?\s*(?:S\$|SGD|\$)?\s*([\d,.]+(?:\s*(?:m|mn|million|k|thousand))?)/i,
      confidence: 94
    },
    {
      pattern: /(?:for sale|offers? from)\s*(?:at|from)?\s*(?:S\$|SGD|\$)\s*([\d,.]+(?:\s*(?:m|mn|million|k|thousand))?)/i,
      confidence: 86
    }
  ]);
  if (!match) {
    const generic = /(?:S\$|SGD)\s*([\d,.]+(?:\s*(?:m|mn|million|k|thousand))?)/ig;
    for (const candidate of text.matchAll(generic)) {
      const context = text.slice(Math.max(0, candidate.index - 35), candidate.index + candidate[0].length + 30);
      if (/\b(?:rent|maintenance|mortgage|per month|p\/m|monthly)\b/i.test(context)) continue;
      match = {
        value: candidate[1],
        confidence: 68,
        excerpt: excerptAround(text, candidate.index, candidate[0].length)
      };
      break;
    }
  }
  if (!match) return null;
  const value = parseMoneyValue(match.value);
  if (value < 100000 || value > 100000000) return null;
  return createFact({
    id: "price",
    stateKey: "price",
    label: "Asking price",
    value,
    confidence: match.confidence,
    excerpt: match.excerpt
  });
}

function extractFloorArea(text) {
  let match = firstPatternMatch(text, [
    {
      pattern: /(?:floor area|built[\s-]?up|internal area|unit size|size)\s*[:\-]?\s*([\d,.]+)\s*(sq\.?\s*ft|sqft|square feet|sqm|sq\.?\s*m|square metres?)/i,
      group: 1,
      confidence: 94
    },
    {
      pattern: /\b([\d,.]+)\s*(sq\.?\s*ft|sqft|square feet)\b/i,
      group: 1,
      confidence: 78
    },
    {
      pattern: /\b([\d,.]+)\s*(sqm|sq\.?\s*m|square metres?)\b/i,
      group: 1,
      confidence: 76
    }
  ]);
  if (!match) return null;
  let value = finiteNumber(String(match.value).replace(/,/g, ""));
  const unit = match.match[2] || "";
  if (/sqm|sq\.?\s*m|metre/i.test(unit)) value *= SQM_TO_SQFT;
  if (value < 200 || value > 30000) return null;
  return createFact({
    id: "size",
    stateKey: "size",
    label: "Floor area",
    value: Math.round(value),
    confidence: match.confidence,
    excerpt: match.excerpt
  });
}

function extractRemainingLease(text) {
  const freehold = /\b(freehold|estate in perpetuity)\b/i.exec(text);
  if (freehold) {
    return createFact({
      id: "remainingLease",
      stateKey: "remainingLease",
      label: "Tenure",
      value: 999,
      confidence: 96,
      excerpt: excerptAround(text, freehold.index, freehold[0].length)
    });
  }

  const remaining = /remaining lease\s*[:\-]?\s*(\d{1,3})\s*years?/i.exec(text);
  if (remaining) {
    return createFact({
      id: "remainingLease",
      stateKey: "remainingLease",
      label: "Remaining lease",
      value: Number(remaining[1]),
      confidence: 94,
      excerpt: excerptAround(text, remaining.index, remaining[0].length)
    });
  }

  const lease = /(\d{2,3})[\s-]*year(?:s)?\s+lease(?:hold)?(?:\s+(?:from|commencing|starting|wef)\s+(?:year\s*)?(\d{4}))?/i.exec(text);
  if (!lease) return null;
  const term = Number(lease[1]);
  const startYear = Number(lease[2]);
  const value = startYear
    ? clamp(term - (new Date().getFullYear() - startYear), 1, 999)
    : term;
  return createFact({
    id: "remainingLease",
    stateKey: "remainingLease",
    label: startYear ? "Remaining lease" : "Lease term",
    value,
    confidence: startYear ? 90 : 62,
    excerpt: excerptAround(text, lease.index, lease[0].length)
  });
}

function extractRent(text) {
  let match = firstPatternMatch(text, [
    {
      pattern: /(?:expected|estimated|current|asking|achievable)?\s*(?:monthly\s+)?rent(?:al)?(?: income)?\s*[:\-]?\s*(?:S\$|SGD|\$)?\s*([\d,.]+(?:\s*(?:k|thousand))?)/i,
      confidence: 86
    },
    {
      pattern: /(?:S\$|SGD|\$)\s*([\d,.]+(?:\s*(?:k|thousand))?)\s*(?:\/\s*month|per month|monthly|p\/m|pm)\b/i,
      confidence: 72
    }
  ]);
  if (!match) return null;
  const value = parseMoneyValue(match.value);
  if (value < 300 || value > 100000) return null;
  return createFact({
    id: "expectedRent",
    stateKey: "expectedRent",
    label: "Monthly rent",
    value,
    confidence: match.confidence,
    excerpt: match.excerpt
  });
}

function extractMaintenance(text) {
  const match = firstPatternMatch(text, [
    {
      pattern: /(?:maintenance(?: fee)?|management fee|service charge)\s*[:\-]?\s*(?:S\$|SGD|\$)?\s*([\d,.]+)\s*(?:\/\s*)?(monthly|per month|quarterly|per quarter|annually|per year)?/i,
      confidence: 88
    }
  ]);
  if (!match) return null;
  let value = parseMoneyValue(match.value);
  const period = String(match.match[2] || "monthly");
  if (/quarter/i.test(period)) value /= 3;
  if (/annual|year/i.test(period)) value /= 12;
  value = roundTo(value, 5);
  if (value < 10 || value > 20000) return null;
  return createFact({
    id: "maintenance",
    stateKey: "maintenance",
    label: "Maintenance",
    value,
    confidence: match.confidence,
    excerpt: match.excerpt
  });
}

function extractReferenceFacts(text) {
  const facts = [];
  const bedroom = /\b(\d{1,2})\s*(?:bed|beds|bedroom|bedrooms)\b/i.exec(text);
  if (bedroom) {
    facts.push(createFact({
      id: "bedrooms",
      label: "Bedrooms",
      value: `${bedroom[1]} bedrooms`,
      confidence: 84,
      excerpt: excerptAround(text, bedroom.index, bedroom[0].length),
      applyable: false
    }));
  }
  const bathroom = /\b(\d{1,2})\s*(?:bath|baths|bathroom|bathrooms)\b/i.exec(text);
  if (bathroom) {
    facts.push(createFact({
      id: "bathrooms",
      label: "Bathrooms",
      value: `${bathroom[1]} bathrooms`,
      confidence: 84,
      excerpt: excerptAround(text, bathroom.index, bathroom[0].length),
      applyable: false
    }));
  }
  const floor = /\b(high floor|mid floor|middle floor|low floor|ground floor|(?:on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+floor|storey\s+\d{1,2})\b/i.exec(text);
  if (floor) {
    facts.push(createFact({
      id: "floorLevel",
      label: "Floor level",
      value: floor[1].replace(/^on\s+/i, ""),
      confidence: 78,
      excerpt: excerptAround(text, floor.index, floor[0].length),
      applyable: false
    }));
  }
  return facts;
}

function extractDossierFacts(source) {
  const text = source.text;
  const candidates = [
    extractPropertyName(text, source),
    extractAddress(text),
    extractPropertyType(text),
    extractFlatType(text),
    extractAskingPrice(text),
    extractFloorArea(text),
    extractRemainingLease(text),
    extractRent(text),
    extractMaintenance(text),
    ...extractReferenceFacts(text)
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);
    return true;
  });
}

function isExampleDecision(state) {
  return state.propertyName === exampleState.propertyName &&
    state.address === exampleState.address &&
    state.price === exampleState.price;
}

function factConflict(fact, state) {
  if (!fact.applyable || isExampleDecision(state)) return false;
  const existing = state[fact.stateKey];
  if (existing === "" || existing === 0 || existing === null || existing === undefined) return false;
  if (typeof fact.value === "number") {
    const tolerances = {
      price: 0.03,
      size: 0.03,
      remainingLease: 0.04,
      expectedRent: 0.08,
      maintenance: 0.1
    };
    const tolerance = tolerances[fact.stateKey] || 0.03;
    return Math.abs(fact.value - finiteNumber(existing)) / Math.max(1, finiteNumber(existing)) > tolerance;
  }
  return normalizeText(fact.value) !== normalizeText(existing);
}

function buildDossier(source) {
  const facts = extractDossierFacts(source);
  if (!facts.length) {
    throw new Error("No reliable property facts were found. Add clearer labels such as asking price, size, address and tenure");
  }
  const overall = Math.round(facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length);
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    sourceUrl: source.sourceUrl || "",
    sourceDetail: source.detail,
    textLength: source.text.length,
    facts,
    confidenceScore: overall,
    confidenceLabel: overall >= 80 ? "High extraction" : overall >= 60 ? "Medium extraction" : "Low extraction",
    confidenceLevel: confidenceLevel(overall),
    extractedAt: new Date().toISOString(),
    applied: false,
    appliedFactIds: []
  };
}

function activeDossierFor(state) {
  if (!currentDossier?.applied || !currentDossier.appliedFactIds?.length) return null;
  const matched = currentDossier.facts.some((fact) => {
    if (!currentDossier.appliedFactIds.includes(fact.id) || !fact.stateKey) return false;
    const current = state[fact.stateKey];
    if (typeof fact.value === "number") {
      return Math.abs(finiteNumber(current) - fact.value) < 1;
    }
    return normalizeText(current) === normalizeText(fact.value);
  });
  return matched ? currentDossier : null;
}

function dossierBriefFor(state) {
  const dossier = activeDossierFor(state);
  if (!dossier) return "";
  return ` Dossier review applied ${dossier.appliedFactIds.length} source-backed field${dossier.appliedFactIds.length === 1 ? "" : "s"} from ${dossier.sourceName}.`;
}

function updateDossierSelectionSummary() {
  const checkboxes = [...document.querySelectorAll("#dossier-fields input[data-dossier-fact]")];
  const selected = checkboxes.filter((checkbox) => checkbox.checked).length;
  document.querySelector("#dossier-method").textContent = selected
    ? `${selected} extracted field${selected === 1 ? "" : "s"} selected. Unchecked facts remain reference-only.`
    : "Select at least one extracted field to update the underwriting form.";
  document.querySelector("#apply-dossier").disabled = selected === 0;
}

function renderDossier(dossier) {
  if (!dossier) {
    document.querySelector("#dossier-review").hidden = true;
    return;
  }

  const review = document.querySelector("#dossier-review");
  const confidence = document.querySelector("#dossier-confidence");
  const fields = document.querySelector("#dossier-fields");
  const state = readForm();
  const conflicts = dossier.facts.filter((fact) => factConflict(fact, state));

  review.hidden = false;
  document.querySelector("#dossier-source-name").textContent = dossier.sourceName;
  document.querySelector("#dossier-source-meta").textContent =
    `${dossier.sourceDetail} · ${dossier.facts.length} extracted fact${dossier.facts.length === 1 ? "" : "s"}`;
  confidence.className = `confidence-badge ${dossier.confidenceLevel}`;
  confidence.textContent = `${dossier.confidenceLabel} · ${dossier.confidenceScore}/100`;

  const conflictBox = document.querySelector("#dossier-conflicts");
  conflictBox.hidden = conflicts.length === 0;
  document.querySelector("#dossier-conflicts-copy").textContent = conflicts.length
    ? `${conflicts.length} field${conflicts.length === 1 ? "" : "s"} differ from the current form: ${conflicts.map((fact) => fact.label).join(", ")}. Review before applying.`
    : "";

  fields.textContent = "";
  dossier.facts.forEach((fact) => {
    const conflict = conflicts.some((candidate) => candidate.id === fact.id);
    const row = document.createElement("div");
    row.className = `dossier-field-row${conflict ? " conflict" : ""}`;

    if (fact.applyable) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.dossierFact = fact.id;
      checkbox.setAttribute("aria-label", `Apply ${fact.label}`);
      checkbox.checked = dossier.applied
        ? dossier.appliedFactIds.includes(fact.id)
        : fact.confidence >= 60;
      row.append(checkbox);
    } else {
      const marker = document.createElement("span");
      marker.className = "dossier-field-marker";
      marker.setAttribute("aria-label", "Reference only");
      const markerIcon = document.createElement("i");
      markerIcon.setAttribute("data-lucide", "info");
      markerIcon.setAttribute("aria-hidden", "true");
      marker.append(markerIcon);
      row.append(marker);
    }

    const main = document.createElement("div");
    main.className = "dossier-field-main";
    const top = document.createElement("div");
    top.className = "dossier-field-top";
    const label = document.createElement("span");
    label.className = "dossier-field-label";
    label.textContent = fact.label;
    const value = document.createElement("strong");
    value.className = "dossier-field-value";
    value.textContent = fact.display;
    const factConfidence = document.createElement("span");
    factConfidence.className = `field-confidence ${fact.confidenceLevel}`;
    factConfidence.textContent = fact.applyable
      ? `${fact.confidence}%`
      : `Reference · ${fact.confidence}%`;
    top.append(label, value, factConfidence);

    const excerpt = document.createElement("small");
    excerpt.className = "dossier-field-excerpt";
    excerpt.textContent = `Source: “${fact.excerpt}”`;
    main.append(top, excerpt);
    row.append(main);
    fields.append(row);
  });

  setDossierStatus(dossier.applied
    ? "Selected dossier facts are applied. Re-analyze when the source document changes."
    : "Extraction ready. Check each fact and its source excerpt before applying.");
  updateDossierSelectionSummary();
  window.lucide?.createIcons();
}

function clearDossier() {
  saveDossier(null);
  selectedDossierFile = null;
  document.querySelector("#dossier-file").value = "";
  document.querySelector("#selected-file").textContent = "No file selected";
  document.querySelector("#dossier-text").value = "";
  document.querySelector("#dossier-url").value = "";
  document.querySelector("#dossier-review").hidden = true;
  setDossierStatus("Dossier cleared. Add another source when ready.");
}

function handleDossierFailure(message) {
  const applied = activeDossierFor(readForm());
  if (applied) renderDossier(applied);
  else {
    saveDossier(null);
    document.querySelector("#dossier-review").hidden = true;
  }
  setDossierStatus(message, "error");
}

async function analyzeDossierSource() {
  setDossierBusy(true);
  setDossierStatus("Preparing the source…", "progress");
  try {
    const source = await acquireDossierSource();
    const dossier = buildDossier(source);
    saveDossier(dossier);
    renderDossier(dossier);
  } catch (error) {
    handleDossierFailure(error.message);
  } finally {
    setDossierBusy(false);
  }
}

function applyDossier() {
  if (!currentDossier) return;
  const selectedIds = [...document.querySelectorAll("#dossier-fields input[data-dossier-fact]:checked")]
    .map((checkbox) => checkbox.dataset.dossierFact);
  const selectedFacts = currentDossier.facts.filter((fact) =>
    selectedIds.includes(fact.id) && fact.applyable && fact.stateKey);
  if (!selectedFacts.length) {
    setDossierStatus("Select at least one extracted field before applying.", "error");
    return;
  }

  const existing = readForm();
  const replacingExample = isExampleDecision(existing);
  const nextState = { ...existing };
  selectedFacts.forEach((fact) => {
    nextState[fact.stateKey] = fact.value;
  });

  if (selectedIds.includes("flatType") && !selectedIds.includes("propertyType")) {
    nextState.propertyType = "hdb";
  }
  if (selectedIds.includes("address") && !selectedIds.includes("propertyName") &&
      (!existing.propertyName || existing.propertyName === exampleState.propertyName)) {
    nextState.propertyName = nextState.address;
  }
  if (replacingExample && selectedIds.includes("price")) {
    nextState.valuation = nextState.price;
  }
  if (replacingExample && nextState.propertyType === "hdb" && !selectedIds.includes("maintenance")) {
    nextState.maintenance = 100;
  }

  const addressChanged = normalizeText(nextState.address) !== normalizeText(existing.address);
  currentDossier = {
    ...currentDossier,
    applied: true,
    appliedAt: new Date().toISOString(),
    appliedFactIds: selectedIds
  };
  saveDossier(currentDossier);
  currentState = nextState;
  fillForm(currentState);
  updateFlatTypeVisibility();
  saveState(currentState);

  if (addressChanged) {
    saveEvidence(null);
    resetEvidenceUi();
    document.querySelector("#evidence-query").value = currentState.address;
  }

  updateAnalysis(currentState, analyze(currentState));
  renderDossier(currentDossier);
  showToast(`${selectedFacts.length} dossier field${selectedFacts.length === 1 ? "" : "s"} applied`);
}

function selectDossierFile(file) {
  try {
    validateDossierFile(file);
    selectedDossierFile = file;
    document.querySelector("#selected-file").textContent =
      `${file.name} · ${(file.size / 1024 / 1024).toFixed(file.size >= 1024 * 1024 ? 1 : 2)} MB`;
    setDossierStatus("File ready. Analyze it to extract property facts.");
  } catch (error) {
    selectedDossierFile = null;
    document.querySelector("#dossier-file").value = "";
    document.querySelector("#selected-file").textContent = "No file selected";
    setDossierStatus(error.message, "error");
  }
}

function monthlyPayment(principal, annualRate, years) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return principal / months;
  const factor = (1 + monthlyRate) ** months;
  return principal * monthlyRate * factor / (factor - 1);
}

function remainingBalance(principal, annualRate, years, paidMonths) {
  const totalMonths = Math.max(1, Math.round(years * 12));
  const months = clamp(Math.round(paidMonths), 0, totalMonths);
  if (months >= totalMonths) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (!monthlyRate) return principal * (1 - months / totalMonths);
  const payment = monthlyPayment(principal, annualRate, years);
  return Math.max(0, principal * (1 + monthlyRate) ** months -
    payment * (((1 + monthlyRate) ** months - 1) / monthlyRate));
}

function residentialBsd(value) {
  const tiers = [
    [180000, 0.01],
    [180000, 0.02],
    [640000, 0.03],
    [500000, 0.04],
    [1500000, 0.05],
    [Infinity, 0.06]
  ];
  let remaining = Math.max(0, value);
  let duty = 0;
  for (const [band, rate] of tiers) {
    const taxable = Math.min(remaining, band);
    duty += taxable * rate;
    remaining -= taxable;
    if (remaining <= 0) break;
  }
  return Math.floor(duty);
}

function absdRate(citizenship, propertiesOwned) {
  const count = finiteNumber(propertiesOwned);
  if (citizenship === "sc") return count === 0 ? 0 : count === 1 ? 0.2 : 0.3;
  if (citizenship === "pr") return count === 0 ? 0.05 : count === 1 ? 0.3 : 0.35;
  if (citizenship === "foreigner") return 0.6;
  return 0.65;
}

function ssdRate(holdingYears) {
  if (holdingYears <= 1) return 0.16;
  if (holdingYears <= 2) return 0.12;
  if (holdingYears <= 3) return 0.08;
  if (holdingYears <= 4) return 0.04;
  return 0;
}

function scoreFromRange(value, good, bad, invert = true) {
  if (invert) return clamp((bad - value) / (bad - good) * 100, 0, 100);
  return clamp((value - bad) / (good - bad) * 100, 0, 100);
}

function analyze(state) {
  const purchaseBase = Math.max(state.price, state.valuation);
  const lendingBase = Math.min(state.price, state.valuation);
  const ltvLoan = lendingBase * 0.75;
  const requestedLoan = state.price * (1 - state.downPayment / 100);
  const loan = clamp(Math.min(requestedLoan, ltvLoan), 0, state.price);
  const equityDeposit = state.price - loan;
  const bsd = residentialBsd(purchaseBase);
  const absd = purchaseBase * absdRate(state.citizenship, state.propertiesOwned);
  const upfront = equityDeposit + bsd + absd + state.renovation + state.legalFees;
  const deployableCapital = state.cash + state.cpf;
  const capitalAfter = deployableCapital - upfront;
  const minimumCash = lendingBase * 0.05 + Math.max(0, state.price - state.valuation) + state.legalFees;
  const cashAfterMinimum = state.cash - minimumCash - state.renovation;

  const mortgage = monthlyPayment(loan, state.interest, state.loanYears);
  const tdsr = state.monthlyIncome > 0
    ? (state.monthlyDebt + mortgage) / state.monthlyIncome * 100
    : 100;
  const stressRate = state.interest + 2;
  const stressMortgage = monthlyPayment(loan, stressRate, state.loanYears);
  const stressTdsr = state.monthlyIncome > 0
    ? (state.monthlyDebt + stressMortgage) / state.monthlyIncome * 100
    : 100;

  const occupiedRent = state.expectedRent * (1 - state.vacancy / 100);
  const monthlyNetRent = occupiedRent - state.maintenance - state.annualOtherCosts / 12;
  const annualNetRent = monthlyNetRent * 12;
  const grossYield = state.price > 0 ? state.expectedRent * 12 / state.price * 100 : 0;
  const netYield = state.price > 0 ? annualNetRent / state.price * 100 : 0;
  const monthlyCashflow = state.objective === "own-stay" ? -mortgage : monthlyNetRent - mortgage;

  const holdYears = Math.max(1, state.hold);
  const holdMonths = holdYears * 12;
  const futureValue = state.price * (1 + state.growth / 100) ** holdYears;
  const exitLoan = remainingBalance(loan, state.interest, state.loanYears, holdMonths);
  const saleCosts = futureValue * state.sellingCost / 100;
  const sellerStampDuty = futureValue * ssdRate(holdYears);
  const exitProceeds = futureValue - exitLoan - saleCosts - sellerStampDuty;
  const cumulativeCashflow = monthlyCashflow * holdMonths;
  const netOutcome = exitProceeds + cumulativeCashflow - upfront;
  const roi = upfront > 0 ? netOutcome / upfront * 100 : 0;

  const reserveMonths = state.monthlyIncome > 0 ? capitalAfter / state.monthlyIncome : 0;
  const affordability = Math.round(
    scoreFromRange(tdsr, 35, 58) * 0.65 +
    scoreFromRange(upfront / Math.max(1, deployableCapital) * 100, 55, 105) * 0.35
  );
  const cashSafety = Math.round(
    scoreFromRange(reserveMonths, 12, 0, false) * 0.7 +
    (cashAfterMinimum >= 0 ? 30 : 0)
  );
  const yieldScore = Math.round(scoreFromRange(netYield, 4.2, 1.5, false));
  const upside = Math.round(scoreFromRange(roi, 70, -10, false));
  const resilience = Math.round(
    scoreFromRange(stressTdsr, 45, 65) * 0.7 +
    scoreFromRange((state.price - state.valuation) / Math.max(1, state.valuation) * 100, 0, 12) * 0.3
  );

  const riskAdjustment = state.risk === "conservative" ? -4 : state.risk === "growth" ? 2 : 0;
  const score = Math.round(clamp(
    affordability * 0.3 +
    cashSafety * 0.2 +
    yieldScore * 0.15 +
    upside * 0.2 +
    resilience * 0.15 +
    riskAdjustment,
    0,
    100
  ));

  let recommendation = "Avoid";
  let tone = "coral";
  if (score >= 78 && tdsr <= 55 && capitalAfter >= 0) {
    recommendation = "Proceed to diligence";
    tone = "emerald";
  } else if (score >= 62 && tdsr <= 58 && capitalAfter >= 0) {
    recommendation = "Negotiate";
    tone = "gold";
  } else if (score >= 45 && capitalAfter >= 0) {
    recommendation = "Watch";
    tone = "gold";
  }

  const targetPrice = findTargetPrice(state, 72);
  const scoreParts = { affordability, cashSafety, yieldScore, upside, resilience };

  return {
    purchaseBase, lendingBase, ltvLoan, loan, equityDeposit, bsd, absd, upfront,
    deployableCapital, capitalAfter, minimumCash, cashAfterMinimum, mortgage,
    tdsr, stressRate, stressMortgage, stressTdsr, occupiedRent, monthlyNetRent,
    annualNetRent, grossYield, netYield, monthlyCashflow, futureValue, exitLoan,
    saleCosts, sellerStampDuty, exitProceeds, cumulativeCashflow, netOutcome, roi, reserveMonths,
    scoreParts, score, recommendation, tone, targetPrice, holdYears
  };
}

function quickScoreAtPrice(state, price) {
  const adjusted = {
    ...state,
    price,
    renovation: state.renovation
  };
  const purchaseBase = Math.max(adjusted.price, adjusted.valuation);
  const lendingBase = Math.min(adjusted.price, adjusted.valuation);
  const loan = Math.min(adjusted.price * (1 - adjusted.downPayment / 100), lendingBase * 0.75);
  const upfront = adjusted.price - loan + residentialBsd(purchaseBase) +
    purchaseBase * absdRate(adjusted.citizenship, adjusted.propertiesOwned) +
    adjusted.renovation + adjusted.legalFees;
  const mortgage = monthlyPayment(loan, adjusted.interest, adjusted.loanYears);
  const tdsr = adjusted.monthlyIncome > 0
    ? (adjusted.monthlyDebt + mortgage) / adjusted.monthlyIncome * 100
    : 100;
  const annualNetRent = (adjusted.expectedRent * (1 - adjusted.vacancy / 100) -
    adjusted.maintenance) * 12 - adjusted.annualOtherCosts;
  const netYield = price > 0 ? annualNetRent / price * 100 : 0;
  const capitalAfter = adjusted.cash + adjusted.cpf - upfront;
  return {
    viable: tdsr <= 55 && capitalAfter >= 0,
    strength: scoreFromRange(tdsr, 35, 58) * 0.45 +
      scoreFromRange(netYield, 4.2, 1.5, false) * 0.25 +
      scoreFromRange(upfront / Math.max(1, adjusted.cash + adjusted.cpf) * 100, 55, 105) * 0.3
  };
}

function findTargetPrice(state, targetStrength) {
  let low = Math.max(100000, state.price * 0.6);
  let high = state.price;
  let target = low;
  for (let index = 0; index < 24; index += 1) {
    const midpoint = (low + high) / 2;
    const result = quickScoreAtPrice(state, midpoint);
    if (result.viable && result.strength >= targetStrength) {
      target = midpoint;
      low = midpoint;
    } else {
      high = midpoint;
    }
  }
  return Math.min(state.price, Math.round(target / 5000) * 5000);
}

function briefFor(state, analysis) {
  const concerns = [];
  if (analysis.tdsr > 55) concerns.push(`estimated TDSR reaches ${percent(analysis.tdsr)}`);
  if (analysis.capitalAfter < 0) concerns.push(`upfront funds are short by ${currency(-analysis.capitalAfter, true)}`);
  if (analysis.stressTdsr > 55) concerns.push(`a two-point rate shock lifts TDSR to ${percent(analysis.stressTdsr)}`);
  if (analysis.netYield < 2.5 && state.objective !== "own-stay") concerns.push(`net yield is only ${percent(analysis.netYield)}`);
  if (state.price > state.valuation) concerns.push(`asking is ${percent((state.price / state.valuation - 1) * 100)} above the working valuation`);

  if (!concerns.length) {
    return `The base case is financially resilient. Keep the offer at or below ${currency(analysis.targetPrice)} and verify the valuation and rent evidence before committing.`;
  }

  const lead = concerns.slice(0, 2).join(" and ");
  const action = analysis.targetPrice < state.price * 0.99
    ? `A price near ${currency(analysis.targetPrice)} creates a safer entry.`
    : "Reduce leverage or strengthen cash reserves before proceeding.";
  return `The main pressure is that ${lead}. ${action}`;
}

function activeEvidenceFor(state) {
  if (!currentEvidence || currentEvidence.kind !== "hdb" || !currentEvidence.applied) return null;
  return normalizeText(currentEvidence.candidate.address) === normalizeText(state.address)
    ? currentEvidence
    : null;
}

function evidenceBriefFor(state) {
  const evidence = activeEvidenceFor(state);
  if (!evidence) return "";
  return ` Official evidence is ${evidence.confidenceLabel.toLowerCase()} (${evidence.confidenceScore}/100) from ${evidence.saleCount} selected sales, latest ${formatMonth(evidence.latestSale)}.`;
}

function subtitleFor(analysis) {
  if (analysis.recommendation === "Proceed to diligence") {
    return "The base case clears the financial checks. Validate the evidence before making an offer.";
  }
  if (analysis.recommendation === "Negotiate") {
    return "The purchase can work, but the entry terms leave limited margin for error.";
  }
  if (analysis.recommendation === "Watch") {
    return "The case needs better pricing, stronger income, or lower leverage before it is ready.";
  }
  return "The current structure fails the affordability or downside-resilience checks.";
}

function propertyTypeLabel(value) {
  return {
    private: "Private residential",
    hdb: "HDB resale",
    ec: "Executive condominium"
  }[value] || "Residential";
}

function updateAnalysis(state, analysis) {
  currentAnalysis = analysis;
  document.querySelector("#visual-property-type").textContent = propertyTypeLabel(state.propertyType);
  document.querySelector("#visual-property-name").textContent = state.propertyName || "Unnamed property";
  document.querySelector("#visual-address").textContent = state.address || "Address not entered";

  const title = document.querySelector("#decision-title");
  title.textContent = analysis.recommendation;
  title.style.color = analysis.tone === "emerald"
    ? "var(--emerald)"
    : analysis.tone === "coral"
      ? "var(--coral)"
      : "var(--gold)";
  document.querySelector("#decision-subtitle").textContent = subtitleFor(analysis);

  const gauge = document.querySelector("#score-gauge");
  gauge.style.setProperty("--score", analysis.score);
  gauge.style.setProperty("--gauge-color",
    analysis.tone === "emerald" ? "var(--emerald)" :
      analysis.tone === "coral" ? "var(--coral)" : "var(--gold)");
  gauge.setAttribute("aria-label", `Decision score ${analysis.score} out of 100`);
  document.querySelector("#decision-score").textContent = analysis.score;

  document.querySelector("#metric-upfront").textContent = currency(analysis.upfront, true);
  document.querySelector("#metric-capital-use").textContent =
    `${percent(analysis.upfront / Math.max(1, analysis.deployableCapital) * 100, 0)} of cash + CPF`;
  document.querySelector("#metric-mortgage").textContent = `${currency(analysis.mortgage, true)}/mo`;
  document.querySelector("#metric-tdsr").textContent = `${percent(analysis.tdsr)} estimated TDSR`;
  document.querySelector("#metric-yield").textContent = percent(analysis.netYield);
  const cashflowElement = document.querySelector("#metric-cashflow");
  cashflowElement.textContent = `${analysis.monthlyCashflow >= 0 ? "+" : ""}${currency(analysis.monthlyCashflow, true)}/mo`;
  cashflowElement.className = analysis.monthlyCashflow >= 0 ? "positive" : "negative";
  document.querySelector("#metric-profit-label").textContent = `${analysis.holdYears}-year modelled outcome`;
  document.querySelector("#metric-profit").textContent = currency(analysis.netOutcome, true);
  const roiElement = document.querySelector("#metric-roi");
  roiElement.textContent = `${analysis.roi >= 0 ? "+" : ""}${percent(analysis.roi)} on upfront`;
  roiElement.className = analysis.roi >= 0 ? "positive" : "negative";
  document.querySelector("#brief-copy").textContent =
    `${briefFor(state, analysis)}${dossierBriefFor(state)}${evidenceBriefFor(state)}`;

  updateScenarioControls(state);
  updateStressResult(state, analysis);
  updateScoreBreakdown(analysis.scoreParts);
  updateTransactionTable(state, analysis);
  drawChart(state, analysis);

  if (window.lucide) window.lucide.createIcons();
}

function updateScenarioControls(state) {
  const interest = document.querySelector("#scenario-interest");
  const growth = document.querySelector("#scenario-growth");
  const rent = document.querySelector("#scenario-rent");
  interest.value = clamp(state.interest, finiteNumber(interest.min), finiteNumber(interest.max));
  growth.value = clamp(state.growth, finiteNumber(growth.min), finiteNumber(growth.max));
  rent.max = Math.max(15000, Math.ceil(state.expectedRent * 1.8 / 1000) * 1000);
  rent.value = clamp(state.expectedRent, finiteNumber(rent.min), finiteNumber(rent.max));
  document.querySelector("#scenario-interest-output").textContent = percent(state.interest);
  document.querySelector("#scenario-growth-output").textContent = percent(state.growth);
  document.querySelector("#scenario-rent-output").textContent = currency(state.expectedRent);
}

function updateStressResult(state, analysis) {
  const title = document.querySelector("#stress-result-title");
  const copy = document.querySelector("#stress-result-copy");
  const resilient = analysis.stressTdsr <= 55 && analysis.capitalAfter >= 0;
  title.textContent = resilient ? "Buffer remains intact" : "Financing pressure";
  copy.textContent = `${percent(analysis.stressRate)} mortgage stress gives ${currency(analysis.stressMortgage)}/mo and ${percent(analysis.stressTdsr)} TDSR.`;
  const box = title.closest(".stress-result");
  box.style.borderLeftColor = resilient ? "var(--emerald)" : "var(--coral)";
  box.style.background = resilient ? "var(--emerald-soft)" : "var(--coral-soft)";
}

function updateScoreBreakdown(parts) {
  const labels = [
    ["Affordability", parts.affordability],
    ["Cash safety", parts.cashSafety],
    ["Rental yield", parts.yieldScore],
    ["Long-term upside", parts.upside],
    ["Downside resilience", parts.resilience]
  ];
  document.querySelector("#score-breakdown").innerHTML = labels.map(([label, value]) => `
    <div class="score-row">
      <span>${label}</span>
      <span class="score-track"><span style="width:${value}%"></span></span>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function updateTransactionTable(state, analysis) {
  const rows = [
    ["Maximum loan at 75% LTV", currency(analysis.ltvLoan)],
    ["Modelled loan", currency(analysis.loan)],
    ["Buyer’s Stamp Duty", currency(analysis.bsd)],
    [`ABSD (${percent(absdRate(state.citizenship, state.propertiesOwned) * 100, 0)})`, currency(analysis.absd)],
    ["Minimum cash component", currency(analysis.minimumCash)],
    ["Other annual ownership costs", currency(state.annualOtherCosts)],
    [`Estimated value in year ${analysis.holdYears}`, currency(analysis.futureValue)],
    ["Outstanding loan at exit", currency(analysis.exitLoan)],
    ["Estimated sale costs", currency(analysis.saleCosts)],
    [`Seller’s Stamp Duty (${percent(ssdRate(analysis.holdYears) * 100, 0)})`, currency(analysis.sellerStampDuty)]
  ];
  document.querySelector("#transaction-body").innerHTML = rows.map(([label, value]) => `
    <tr><th scope="row">${label}</th><td>${value}</td></tr>
  `).join("");
}

function drawChart(state, analysis) {
  const canvas = document.querySelector("#equity-chart");
  const width = Math.max(320, Math.floor(canvas.getBoundingClientRect().width || 760));
  const height = Math.max(220, Math.floor(canvas.getBoundingClientRect().height || 280));
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.scale(scale, scale);

  const padding = { top: 18, right: 18, bottom: 34, left: 62 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const years = Array.from({ length: analysis.holdYears + 1 }, (_, year) => year);
  const values = years.map((year) => state.price * (1 + state.growth / 100) ** year);
  const balances = years.map((year) => remainingBalance(analysis.loan, state.interest, state.loanYears, year * 12));
  const equities = values.map((value, index) => value - balances[index]);
  const maxValue = Math.max(...values) * 1.08;

  const x = (index) => padding.left + index / Math.max(1, years.length - 1) * chartWidth;
  const y = (value) => padding.top + chartHeight - value / maxValue * chartHeight;

  context.clearRect(0, 0, width, height);
  context.font = "11px Inter, system-ui, sans-serif";
  context.fillStyle = "#667085";
  context.strokeStyle = "#e2e7ed";
  context.lineWidth = 1;

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = maxValue * tick / 4;
    const py = y(value);
    context.beginPath();
    context.moveTo(padding.left, py);
    context.lineTo(width - padding.right, py);
    context.stroke();
    context.fillText(currency(value, true), 4, py + 4);
  }

  const tickEvery = Math.max(1, Math.ceil(analysis.holdYears / 5));
  years.forEach((year, index) => {
    if (year % tickEvery !== 0 && year !== analysis.holdYears) return;
    context.fillText(`Y${year}`, x(index) - 7, height - 10);
  });

  const plot = (series, color, dash = []) => {
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.setLineDash(dash);
    series.forEach((value, index) => {
      if (index === 0) context.moveTo(x(index), y(value));
      else context.lineTo(x(index), y(value));
    });
    context.stroke();
    context.setLineDash([]);
  };

  context.beginPath();
  context.moveTo(x(0), y(equities[0]));
  equities.forEach((value, index) => context.lineTo(x(index), y(value)));
  context.lineTo(x(equities.length - 1), y(0));
  context.lineTo(x(0), y(0));
  context.closePath();
  context.fillStyle = "rgba(11, 143, 106, 0.09)";
  context.fill();

  plot(values, "#0b1e3f");
  plot(equities, "#0b8f6a");
}

function setActiveTab(index) {
  activeTab = clamp(index, 0, tabs.length - 1);
  tabs.forEach((tab, tabIndex) => {
    const active = tabIndex === activeTab;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  panels.forEach((panel, panelIndex) => {
    const active = panelIndex === activeTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
  document.querySelector("#previous-step").hidden = activeTab === 0;
  document.querySelector("#next-step").hidden = activeTab === tabs.length - 1;
  document.querySelector("#run-analysis").hidden = activeTab !== tabs.length - 1;
}

function runAnalysis({ moveToTop = false, announce = false } = {}) {
  currentState = readForm();
  saveState(currentState);
  const analysis = analyze(currentState);
  updateAnalysis(currentState, analysis);
  if (moveToTop) {
    document.querySelector(".analysis-pane").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (announce) showToast("Analysis updated");
}

function showView(viewName) {
  const workspace = document.querySelector("#workspace-view");
  const decisions = document.querySelector("#decisions-view");
  const showWorkspace = viewName === "workspace";
  workspace.hidden = !showWorkspace;
  decisions.hidden = showWorkspace;
  workspace.classList.toggle("active", showWorkspace);
  decisions.classList.toggle("active", !showWorkspace);
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    const active = button.dataset.viewTarget === viewName && button.classList.contains("nav-item");
    button.classList.toggle("active", active);
    if (button.classList.contains("nav-item")) {
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  if (!showWorkspace) renderDecisions();
  window.scrollTo({ top: 0, behavior: "smooth" });
  closeMobileMenu();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}

function saveDecision() {
  if (!currentAnalysis) runAnalysis();
  const decisions = getDecisions();
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    savedAt: new Date().toISOString(),
    state: currentState,
    dossier: activeDossierFor(currentState),
    evidence: activeEvidenceFor(currentState),
    result: {
      score: currentAnalysis.score,
      recommendation: currentAnalysis.recommendation,
      upfront: currentAnalysis.upfront,
      mortgage: currentAnalysis.mortgage,
      netYield: currentAnalysis.netYield,
      netOutcome: currentAnalysis.netOutcome
    }
  };
  decisions.unshift(entry);
  localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions.slice(0, 30)));
  updateDecisionCount();
  showToast("Decision saved locally");
}

function updateDecisionCount() {
  document.querySelector("#decision-count").textContent = getDecisions().length;
}

function renderDecisions() {
  const decisions = getDecisions();
  const list = document.querySelector("#decision-list");
  const empty = document.querySelector("#decision-empty");
  empty.hidden = decisions.length > 0;
  list.hidden = decisions.length === 0;
  list.innerHTML = decisions.map((entry) => {
    const date = new Intl.DateTimeFormat("en-SG", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date(entry.savedAt));
    const evidenceBadge = entry.evidence?.kind === "hdb"
      ? `<span class="saved-evidence-badge">Source-backed · ${finiteNumber(entry.evidence.confidenceScore)}/100</span>`
      : "";
    const dossierBadge = entry.dossier?.applied
      ? `<span class="saved-dossier-badge">Dossier · ${entry.dossier.appliedFactIds?.length || 0} fields</span>`
      : "";
    return `
      <article class="saved-decision">
        <div class="saved-head">
          <span class="saved-recommendation">${entry.result.recommendation}</span>
          <span class="saved-score">${entry.result.score}/100</span>
        </div>
        <h2>${escapeHtml(entry.state.propertyName || "Unnamed property")}</h2>
        <p>${escapeHtml(entry.state.address || "No address")}</p>
        ${dossierBadge}
        ${evidenceBadge}
        <div class="saved-metrics">
          <div><span>Asking</span><strong>${currency(entry.state.price, true)}</strong></div>
          <div><span>Modelled outcome</span><strong>${currency(entry.result.netOutcome, true)}</strong></div>
          <div><span>Mortgage</span><strong>${currency(entry.result.mortgage, true)}/mo</strong></div>
          <div><span>Operating yield</span><strong>${percent(entry.result.netYield)}</strong></div>
        </div>
        <div class="saved-actions">
          <span class="saved-date">${date}</span>
          <span>
            <button type="button" data-load-id="${entry.id}">Open</button>
            <button type="button" data-delete-id="${entry.id}">Delete</button>
          </span>
        </div>
      </article>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadDecision(id) {
  const entry = getDecisions().find((decision) => decision.id === id);
  if (!entry) return;
  currentState = { ...exampleState, ...entry.state };
  saveDossier(entry.dossier || null);
  saveEvidence(entry.evidence || null);
  fillForm(currentState);
  updateFlatTypeVisibility();
  renderDossier(currentDossier);
  renderEvidence(currentEvidence);
  saveState(currentState);
  runAnalysis();
  showView("workspace");
  showToast("Saved decision loaded");
}

function deleteDecision(id) {
  const decisions = getDecisions();
  const entry = decisions.find((decision) => decision.id === id);
  if (!entry) return;
  if (!window.confirm(`Delete the saved decision for “${entry.state.propertyName}”?`)) return;
  localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions.filter((decision) => decision.id !== id)));
  updateDecisionCount();
  renderDecisions();
  showToast("Saved decision deleted");
}

function closeMobileMenu() {
  document.querySelector(".sidebar").classList.remove("open");
  document.querySelector("#mobile-menu-button").setAttribute("aria-expanded", "false");
}

tabs.forEach((tab, index) => tab.addEventListener("click", () => setActiveTab(index)));

document.querySelector("#next-step").addEventListener("click", () => setActiveTab(activeTab + 1));
document.querySelector("#previous-step").addEventListener("click", () => setActiveTab(activeTab - 1));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runAnalysis({ moveToTop: true, announce: true });
});

form.addEventListener("input", () => {
  currentState = readForm();
  saveState(currentState);
});

document.querySelector("#propertyType").addEventListener("change", updateFlatTypeVisibility);

document.querySelectorAll("[data-dossier-mode]").forEach((button) => {
  button.addEventListener("click", () => setDossierMode(button.dataset.dossierMode));
});
document.querySelector("#analyze-dossier").addEventListener("click", analyzeDossierSource);
document.querySelector("#apply-dossier").addEventListener("click", applyDossier);
document.querySelector("#clear-dossier").addEventListener("click", clearDossier);
document.querySelector("#dossier-fields").addEventListener("change", updateDossierSelectionSummary);
document.querySelector("#dossier-file").addEventListener("change", (event) => {
  selectDossierFile(event.target.files?.[0] || null);
});
document.querySelector("#dossier-url").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  analyzeDossierSource();
});
const dossierDropzone = document.querySelector(".dossier-dropzone");
["dragenter", "dragover"].forEach((name) => {
  dossierDropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dossierDropzone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((name) => {
  dossierDropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dossierDropzone.classList.remove("dragging");
  });
});
dossierDropzone.addEventListener("drop", (event) => {
  selectDossierFile(event.dataTransfer?.files?.[0] || null);
});

document.querySelector("#find-evidence").addEventListener("click", findEvidence);
document.querySelector("#evidence-query").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  findEvidence();
});
document.querySelector("#address-candidates").addEventListener("click", (event) => {
  const button = event.target.closest("[data-candidate-index]");
  if (!button) return;
  const candidates = event.currentTarget._candidates || [];
  const candidate = candidates[finiteNumber(button.dataset.candidateIndex)];
  if (candidate) selectAddressCandidate(candidate, evidenceRequestId);
});
document.querySelector("#apply-evidence").addEventListener("click", applyEvidence);

document.querySelector("#load-example").addEventListener("click", () => {
  currentState = { ...exampleState };
  clearDossier();
  saveEvidence(null);
  fillForm(currentState);
  updateFlatTypeVisibility();
  resetEvidenceUi();
  saveState(currentState);
  runAnalysis({ announce: true });
  setActiveTab(0);
});

document.querySelector("#save-decision").addEventListener("click", saveDecision);
document.querySelector("#print-decision").addEventListener("click", () => window.print());

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewTarget));
});

document.querySelectorAll("[data-form-target]").forEach((button) => {
  button.addEventListener("click", () => {
    showView("workspace");
    setActiveTab(button.dataset.formTarget === "household" ? 0 : 1);
    const target = button.dataset.formTarget === "dossier"
      ? document.querySelector("#dossier-workbench")
      : document.querySelector(".input-pane");
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => {
    showView("workspace");
    document.getElementById(button.dataset.scrollTarget).scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelector("#decision-list").addEventListener("click", (event) => {
  const loadButton = event.target.closest("[data-load-id]");
  const deleteButton = event.target.closest("[data-delete-id]");
  if (loadButton) loadDecision(loadButton.dataset.loadId);
  if (deleteButton) deleteDecision(deleteButton.dataset.deleteId);
});

["interest", "growth", "rent"].forEach((name) => {
  const slider = document.querySelector(`#scenario-${name}`);
  slider.addEventListener("input", () => {
    const field = name === "rent" ? "expectedRent" : name;
    document.getElementById(field).value = slider.value;
    currentState = readForm();
    saveState(currentState);
    updateAnalysis(currentState, analyze(currentState));
  });
});

document.querySelector("#toggle-detail").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const content = document.querySelector("#detail-content");
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  button.setAttribute("aria-label", expanded ? "Expand underwriting details" : "Collapse underwriting details");
  content.hidden = expanded;
  button.innerHTML = `<i data-lucide="${expanded ? "chevron-down" : "chevron-up"}" aria-hidden="true"></i>`;
  if (window.lucide) window.lucide.createIcons();
});

document.querySelector("#mobile-menu-button").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const open = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!open));
  document.querySelector(".sidebar").classList.toggle("open", !open);
});

window.addEventListener("resize", () => {
  if (currentAnalysis) drawChart(currentState, currentAnalysis);
});

fillForm(currentState);
updateFlatTypeVisibility();
if (currentDossier) renderDossier(currentDossier);
if (currentEvidence) renderEvidence(currentEvidence);
setActiveTab(0);
updateDecisionCount();
updateAnalysis(currentState, analyze(currentState));
if (window.lucide) window.lucide.createIcons();
else window.addEventListener("load", () => window.lucide?.createIcons());
