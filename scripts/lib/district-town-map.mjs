// URA postal district -> HDB towns with resale flats inside that district's
// postal sectors. Drives the "Nearby HDB towns" block on /condo-prices/dNN/.
//
// Built from evidence, not from memory:
// - POSTAL_SECTORS is URA's "List of Postal Districts" (postal district ->
//   first two digits of the six-digit postal code, source: SingPost),
//   https://www.ura.gov.sg/realEstateIIWeb/resources/misc/list_of_postal_districts.htm
//   as archived on 9 Mar 2023 (the live URL now returns 404).
// - Each town carries one sample HDB block: the town and street come from a
//   row in data.gov.sg's HDB Resale Flat Prices dataset, and the postal code
//   from OneMap (SLA) for that block. Checked 30 Oct 2026. The block's postal
//   sector must sit in the district's sectors; tests/condo-stats.test.mjs
//   asserts that, and that every town has a page under /hdb-prices/.
//
// A town listed here has at least one HDB estate in the district. It does not
// mean the town and the district share a boundary, which is why the page block
// says "Nearby HDB towns". Districts with no evidenced HDB town (D06, D09,
// D11, D24, D26) are left out rather than guessed; that is not a claim that
// they have no HDB blocks.

export const POSTAL_SECTORS = {
  '01': ['01', '02', '03', '04', '05', '06'],
  '02': ['07', '08'],
  '03': ['14', '15', '16'],
  '04': ['09', '10'],
  '05': ['11', '12', '13'],
  '06': ['17'],
  '07': ['18', '19'],
  '08': ['20', '21'],
  '09': ['22', '23'],
  '10': ['24', '25', '26', '27'],
  '11': ['28', '29', '30'],
  '12': ['31', '32', '33'],
  '13': ['34', '35', '36', '37'],
  '14': ['38', '39', '40', '41'],
  '15': ['42', '43', '44', '45'],
  '16': ['46', '47', '48'],
  '17': ['49', '50', '81'],
  '18': ['51', '52'],
  '19': ['53', '54', '55', '82'],
  '20': ['56', '57'],
  '21': ['58', '59'],
  '22': ['60', '61', '62', '63', '64'],
  '23': ['65', '66', '67', '68'],
  '24': ['69', '70', '71'],
  '25': ['72', '73'],
  '26': ['77', '78'],
  '27': ['75', '76'],
  '28': ['79', '80'],
};

// slug = /hdb-prices/<slug>/, name = the town as the HDB dataset spells it
// (title case), sample = the evidence block described above.
const t = (slug, name, sample, postal) => ({ slug, name, sample, postal });

export const DISTRICT_TOWNS = {
  '01': [t('central-area', 'Central Area', 'Blk 335A Smith Street', '051335')],
  '02': [t('central-area', 'Central Area', 'Blk 5 Tanjong Pagar Plaza', '081005')],
  '03': [
    t('queenstown', 'Queenstown', 'Blk 171 Stirling Road', '140171'),
    t('bukit-merah', 'Bukit Merah', 'Blk 24 Tiong Bahru Road', '164024'),
  ],
  '04': [t('bukit-merah', 'Bukit Merah', 'Blk 63 Telok Blangah Heights', '100063')],
  '05': [
    t('clementi', 'Clementi', 'Blk 449 Clementi Avenue 3', '120449'),
    t('queenstown', 'Queenstown', 'Blk 18 Dover Crescent', '130018'),
  ],
  '07': [
    t('kallang-whampoa', 'Kallang/Whampoa', 'Blk 1 Beach Road', '190001'),
    t('central-area', 'Central Area', 'Blk 10 Selegie Road', '180010'),
  ],
  '08': [t('kallang-whampoa', 'Kallang/Whampoa', 'Blk 801 French Road', '200801')],
  '10': [
    t('bukit-timah', 'Bukit Timah', 'Blk 5 Farrer Road', '260005'),
    t('queenstown', 'Queenstown', 'Blk 3 Ghim Moh Road', '270003'),
  ],
  '12': [
    t('toa-payoh', 'Toa Payoh', 'Blk 163 Lorong 1 Toa Payoh', '310163'),
    t('kallang-whampoa', 'Kallang/Whampoa', 'Blk 74 Whampoa Drive', '320074'),
  ],
  '13': [
    t('geylang', 'Geylang', 'Blk 82 Macpherson Lane', '360082'),
    t('toa-payoh', 'Toa Payoh', 'Blk 119 Potong Pasir Avenue 1', '350119'),
  ],
  '14': [t('geylang', 'Geylang', 'Blk 24 Eunos Crescent', '400024')],
  '15': [t('marine-parade', 'Marine Parade', 'Blk 81 Marine Parade Central', '440081')],
  '16': [t('bedok', 'Bedok', 'Blk 214 Bedok North Street 1', '460214')],
  '17': [t('pasir-ris', 'Pasir Ris', 'Blk 4 Changi Village Road', '500004')],
  '18': [
    t('tampines', 'Tampines', 'Blk 261 Tampines Street 21', '520261'),
    t('pasir-ris', 'Pasir Ris', 'Blk 109 Pasir Ris Street 11', '510109'),
  ],
  '19': [
    t('hougang', 'Hougang', 'Blk 108 Hougang Avenue 1', '530108'),
    t('sengkang', 'Sengkang', 'Blk 257A Compassvale Road', '541257'),
    t('serangoon', 'Serangoon', 'Blk 101 Serangoon North Avenue 1', '550101'),
    t('punggol', 'Punggol', 'Blk 203B Punggol Field', '822203'),
  ],
  '20': [
    t('ang-mo-kio', 'Ang Mo Kio', 'Blk 571 Ang Mo Kio Avenue 3', '560571'),
    t('bishan', 'Bishan', 'Blk 167 Bishan Street 13', '570167'),
  ],
  '21': [t('bukit-timah', 'Bukit Timah', 'Blk 4 Toh Yi Drive', '590004')],
  '22': [
    t('jurong-east', 'Jurong East', 'Blk 231 Jurong East Street 21', '600231'),
    t('jurong-west', 'Jurong West', 'Blk 476 Jurong West Street 41', '640476'),
  ],
  '23': [
    t('bukit-batok', 'Bukit Batok', 'Blk 213 Bukit Batok Street 21', '650213'),
    t('bukit-panjang', 'Bukit Panjang', 'Blk 214 Petir Road', '670214'),
    t('choa-chu-kang', 'Choa Chu Kang', 'Blk 404 Choa Chu Kang Avenue 3', '680404'),
  ],
  '25': [t('woodlands', 'Woodlands', 'Blk 103 Woodlands Street 13', '730103')],
  '27': [
    t('yishun', 'Yishun', 'Blk 451 Yishun Ring Road', '760451'),
    t('sembawang', 'Sembawang', 'Blk 477 Sembawang Drive', '750477'),
  ],
  '28': [t('sengkang', 'Sengkang', 'Blk 441B Fernvale Road', '792441')],
};

/** HDB towns for a district key ('15'), or [] when none is mapped. */
export function hdbTownsForDistrict(d) {
  return DISTRICT_TOWNS[d] ?? [];
}
