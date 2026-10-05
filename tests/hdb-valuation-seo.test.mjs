import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, ROOT), 'utf8');
const ARTICLE = 'insights/hdb-valuation-explained.html';
const ARTICLE_URL = `https://joetay.com/${ARTICLE}`;
const html = read(ARTICLE);
const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const schemas = [...html.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)]
  .map(match => JSON.parse(match[1]));
const text = value => value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

test('Chinese valuation guidance and FAQ preserve the corrected financing rules', () => {
  const zh = read('zh/insights/hdb-valuation-explained.html');
  const zhSchemas = [...zh.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(match => JSON.parse(match[1]));
  const section = zh.split('<h2 id="faq">')[1].split('<h2 id="sources">')[0];
  const pairs = [...section.matchAll(/<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map(([, question, answer]) => ({ question, answer: text(answer) }));
  assert.equal(pairs.length, 5);
  assert.deepEqual(zhSchemas.find(schema => schema['@type'] === 'FAQPage').mainEntity.map(item => ({ question: item.name, answer: item.acceptedAnswer.text })), pairs);
  assert.match(zh, /建屋局会决定是否需要进行估价/);
  assert.match(zh, /并非每宗申请都会有估价师到访/);
  assert.match(zh, /议定成交价与估价两者中的较低者/);
  assert.match(zh, /不能使用公积金或房屋贷款/);
  assert.match(zh, /通常在 1 小时内回复/);
  assert.doesNotMatch(zh, /通常 10 分钟|建屋局派持牌估价师上门|估价 \+ COV|滞后 2 到 4 周|损失两三万元|交易在 4 到 6 周内完成/);
  for (const source of [...visible.matchAll(/href="(https:\/\/(?:www\.hdb|www\.cpf)\.gov\.sg\/[^"#]+)"/g)].map(match => match[1])) {
    assert.ok(zh.includes(`href="${source}"`), `Chinese guide is missing ${source}`);
  }
});

test('Chinese worked amounts match the English examples and reconcile', () => {
  const zh = read('zh/insights/hdb-valuation-explained.html');
  const example = zh.split('<h2 id="worked-example">')[1].split('<h2 id="common-mistakes">')[0];
  assert.match(example, /仅作计算示例，并非真实交易/);
  const rows = [...example.matchAll(/<tr><th scope="row">[^<]+<\/th>([\s\S]*?)<\/tr>/g)]
    .map(([, cells]) => [...cells.matchAll(/<td>([\d,]+) 元<\/td>/g)].map(match => Number(match[1].replaceAll(',', ''))));
  const enTable = visible.match(/<table aria-label="Illustrative HDB price and valuation examples">([\s\S]*?)<\/table>/)[1];
  const enRows = [...enTable.matchAll(/<tr><th scope="row">[^<]+<\/th>([\s\S]*?)<\/tr>/g)]
    .map(([, cells]) => [...cells.matchAll(/<td>\$([\d,]+)<\/td>/g)].map(match => Number(match[1].replaceAll(',', ''))));
  assert.deepEqual(rows, enRows);
  const [prices, values, bases, cash] = rows;
  for (let i = 0; i < 2; i++) {
    assert.equal(bases[i], Math.min(prices[i], values[i]));
    assert.equal(cash[i], Math.max(0, prices[i] - values[i]));
  }
});

test('Chinese article keeps publication history, locale links and current metadata', () => {
  const zh = read('zh/insights/hdb-valuation-explained.html');
  const article = [...zh.matchAll(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/g)].map(match => JSON.parse(match[1])).find(schema => schema['@type'] === 'Article');
  const description = zh.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.equal(article.description, description);
  assert.equal(article.datePublished, '2026-04-21');
  assert.equal(article.dateModified, '2026-10-05');
  assert.match(zh, /2026 年 10 月 5 日更新/);
  for (const key of ['og:description', 'twitter:description']) assert.ok(zh.includes(`="${key}" content="${description}"`));
  const languageLinks = [...zh.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
  assert.deepEqual(languageLinks.map(match => match[1]).sort(), ['en-SG', 'x-default', 'zh-Hans']);
  assert.ok(zh.includes(`href="${ARTICLE_URL}"`));
  assert.ok(zh.includes('href="/zh/sell-hdb/"'));
  assert.ok(zh.includes('<link rel="canonical" href="https://joetay.com/zh/insights/hdb-valuation-explained.html">'));
  const headings = [...zh.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map(match => [match[1], match[2]]);
  const toc = zh.split('<nav class="article-toc"')[1].split('</nav>')[0];
  for (const [id, heading] of headings) assert.ok(toc.includes(`<a href="#${id}">${heading}</a>`));
});

test('valuation guidance distinguishes a conditional valuation from financing limits', () => {
  assert.match(visible, /HDB decides whether a valuation is required/);
  assert.match(visible, /a visit is not automatic/);
  assert.match(visible, /lower of the agreed purchase price or valuation/);
  assert.match(visible, /CPF usage also has limits/);
  assert.match(visible, /Neither figure means the whole purchase can be funded/);
  assert.match(visible, /next working day after the Option Date/);
  assert.match(visible, /three months from availability in the HDB Flat Portal/);
  assert.doesNotMatch(visible, /HDB sends a licensed valuer|how much loan\/CPF can cover|valuation \+ any COV/);
  for (const source of [
    'https://www.hdb.gov.sg/e-resale/valuation-request',
    'https://www.hdb.gov.sg/e-resale/resale-purchase-of-an-hdb-resale-flat',
    'https://www.cpf.gov.sg/member/infohub/educational-resources/3-differences-between-hdb-loan-and-bank-loan',
    'https://www.cpf.gov.sg/member/infohub/educational-resources/how-much-cpf-savings-you-can-use-for-your-home-purchase',
    'https://www.hdb.gov.sg/managing-my-home/selling-a-flat/process-for-selling-a-flat/resale-flat-completion',
  ]) assert.ok(visible.includes(`href="${source}"`), source);
});

test('published illustrative amounts reconcile for purchases above and below valuation', () => {
  const example = visible.split('<h2 id="a-worked-example">')[1].split('<h2 id="the-common-mistakes">')[0];
  assert.match(example, /Illustrative figures only, not actual transactions/);
  assert.match(example, /Loan approval and CPF usage limits are separate checks/);
  const table = example.match(/<table aria-label="Illustrative HDB price and valuation examples">([\s\S]*?)<\/table>/)[1];
  const rows = Object.fromEntries([...table.matchAll(/<tr><th scope="row">([^<]+)<\/th>([\s\S]*?)<\/tr>/g)]
    .map(([, label, cells]) => [label, [...cells.matchAll(/<td>\$([\d,]+)<\/td>/g)].map(match => Number(match[1].replaceAll(',', '')))]));
  const prices = rows['Agreed purchase price'];
  const values = rows['Value determined through HDB'];
  const bases = rows['Lower of price or valuation'];
  const cash = rows['COV payable in cash'];
  for (const amounts of [prices, values, bases, cash]) assert.equal(amounts.length, 2);
  assert.ok(prices[0] > values[0], 'first case must demonstrate positive COV');
  assert.ok(prices[1] < values[1], 'second case must demonstrate a price below valuation');
  for (let i = 0; i < prices.length; i++) {
    assert.equal(bases[i], Math.min(prices[i], values[i]));
    assert.equal(cash[i], Math.max(0, prices[i] - values[i]));
  }
  assert.match(example, /about eight weeks after acceptance of the resale application/);
  assert.doesNotMatch(example, /Feb 2026|SRX X-Value|Realistic outcome|closing in 4–6 weeks/);
});

test('FAQ schema exactly matches the visible questions and answers', () => {
  const faqs = schemas.filter(schema => schema['@type'] === 'FAQPage');
  assert.equal(faqs.length, 1);
  const section = visible.split('<h2 id="frequently-asked-questions">')[1].split('<h2 id="sources-and-review-date">')[0];
  const pairs = [...section.matchAll(/<h3>([^<]+)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)]
    .map(([, question, answer]) => ({ question: text(question), answer: text(answer) }));
  assert.equal(pairs.length, 5);
  assert.deepEqual(faqs[0].mainEntity.map(item => ({ question: item.name, answer: item.acceptedAnswer.text })), pairs);
  const cov = pairs.find(item => item.question === 'What is Cash Over Valuation (COV)?').answer;
  assert.match(cov, /without CPF or a housing loan/);
  assert.match(cov, /at or below valuation has no COV/);
});

test('valuation copy preserves the seller journey without unsupported outcome claims', () => {
  assert.ok(html.includes(`<link rel="canonical" href="${ARTICLE_URL}">`));
  assert.ok(visible.includes('href="/sell-hdb/singapore/"'));
  assert.ok(visible.includes('href="/valuation.html"'));
  assert.match(visible, /Typically within 1 hour during 9am–9pm/);
  assert.match(visible, /500\+ properties sold and rented/);
  assert.match(visible, /Recent registered HDB resale transactions/);
  assert.doesNotMatch(visible, /within 10 minutes|\$18k above|losing \$20|\$30,000 apart|fast sale above expectations|URA \+ SRX/);
});

test('review date and descriptions stay aligned across the article, card and feeds', () => {
  const article = schemas.find(schema => schema['@type'] === 'Article');
  const description = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.equal(article.datePublished, '2026-04-21');
  assert.equal(article.dateModified, '2026-10-05');
  assert.equal(article.description, description);
  assert.ok(visible.includes('<time datetime="2026-10-05">Updated Oct 5, 2026</time>'));
  assert.match(visible, /Reviewed 5 Oct 2026/);
  for (const key of ['og:description', 'twitter:description']) assert.ok(html.includes(`="${key}" content="${description}"`));
  assert.ok(html.includes('property="article:modified_time" content="2026-10-05"'));
  const card = read('insights/index.html').split('<a href="hdb-valuation-explained.html" class="blog-card">')[1].split('</a>')[0];
  assert.ok(card.includes(description));
  const item = JSON.parse(read('insights/feed.json')).items.find(item => item.url === ARTICLE_URL);
  assert.equal(item.summary, description);
  assert.equal(item.content_text, description);
  assert.equal(item.date_published, '2026-04-21T00:00:00+08:00');
  assert.equal(item.date_modified, '2026-10-05T00:00:00+08:00');
  const xml = read('insights/feed.xml');
  const entry = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].find(match => match[1].includes(ARTICLE_URL))[1];
  assert.ok(entry.includes(`<summary type="text">${description}</summary>`));
  assert.ok(entry.includes('<published>2026-04-21T00:00:00+08:00</published>'));
  assert.ok(entry.includes('<updated>2026-10-05T00:00:00+08:00</updated>'));
  assert.match(xml.split('<entry>')[0], /<updated>2026-10-05T00:00:00\+08:00<\/updated>/);
});
