// Shared public HDB retrieval for the homepage widget and sold-prices page.
// Both consumers receive the same sorted records, limits and truncation flags.
import { abbrevRoad } from './block-estimate-core.mjs';

export const SALES_FETCH_LIMITS = Object.freeze({ block: 200, street: 600 });
const DATASET_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc';
const DATA_API = 'https://data.gov.sg/api/action/datastore_search';
const FIELDS = 'month,town,flat_type,block,street_name,storey_range,floor_area_sqm,resale_price';

async function queryTransactions(filters, limit, fetchJSON) {
  const url = `${DATA_API}?resource_id=${DATASET_ID}&filters=${encodeURIComponent(JSON.stringify(filters))}&fields=${FIELDS}&sort=${encodeURIComponent('month desc')}&limit=${limit}`;
  const data = await fetchJSON(url);
  if (data?.success !== true || !Array.isArray(data.result?.records)) throw new Error('bad response');
  const records = data.result.records;
  const total = data.result.total;
  const truncated = Number.isInteger(total) && total >= 0 ? total > records.length : records.length >= limit;
  return { records, truncated };
}

export async function fetchSales(addr, fetchJSON) {
  let road = abbrevRoad(addr.road);
  if (!addr.block) return { road, block: [], street: [], blockTruncated: false, streetTruncated: false };
  let block = await queryTransactions({ block: addr.block, street_name: road }, SALES_FETCH_LIMITS.block, fetchJSON);
  if (!block.records.length && addr.road.toUpperCase() !== road) {
    const rawRoad = addr.road.toUpperCase();
    const alternate = await queryTransactions({ block: addr.block, street_name: rawRoad }, SALES_FETCH_LIMITS.block, fetchJSON);
    if (alternate.records.length) { block = alternate; road = rawRoad; }
  }
  const street = await queryTransactions({ street_name: road }, SALES_FETCH_LIMITS.street, fetchJSON);
  return { road, block: block.records, street: street.records, blockTruncated: block.truncated, streetTruncated: street.truncated };
}
