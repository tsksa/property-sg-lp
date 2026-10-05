import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'valuation.html'), 'utf8');
const homepage = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('both valuation entry points allow optional unit number and backup email', () => {
  for (const [source, unitId, emailId] of [[homepage, 'valUnitNumber', 'valEmail'], [html, 'unitNumber', 'email']]) {
    const unit = source.match(new RegExp(`<input[^>]*id="${unitId}"[^>]*>`))?.[0];
    assert.ok(unit);
    assert.doesNotMatch(unit, /\brequired\b/);
    const email = source.match(new RegExp(`<input[^>]*id="${emailId}"[^>]*>`))?.[0];
    assert.ok(email);
    assert.doesNotMatch(email, /\brequired\b/);
    assert.match(source, /email is used as a backup copy/);
  }
  assert.match(homepage, /Unit number \(optional\)/);
  assert.match(homepage, /aria-describedby="valEmailHelp"/);
  assert.match(html, /Unit no\. <span[^>]*>\(optional\)/);
});

test('popup submits a blank unit once and retains postal and email validation', () => {
  const handler = homepage.match(/valPopupForm\.addEventListener\('submit',e=>\{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(handler);
  for (const [unit, postal, email, emailValid, expectedError] of [
    ['', '520123', '', true, null], ['', '520123', 'test@example.com', true, null],
    ['#12-34', '520123', 'test@example.com', true, null],
    ['', '123', '', true, /postal code/], ['', '520123', 'invalid', false, /email address/],
  ]) {
    const errors = [], submissions = [];
    const form = {company_website:{value:''}, postal_code:{value:postal}, unit_number:{value:unit}, email:{value:email,checkValidity:()=>emailValid}};
    vm.runInNewContext(`(e=>{${handler}})({target:form,preventDefault(){}})`, {
      form, valContactWrap:{style:{display:'none'}},
      valContext:{fullName:'Test',mobile:'81234567',propType:'Condo',newsletter_opt_in:0},
      valDetectedAddress:'', valPostalInput:form.postal_code,
      clearValErr(){}, showValErr:message=>errors.push(message),
      handleFormSubmit:(_form,data)=>submissions.push(data),
    });
    if (expectedError) { assert.match(errors[0], expectedError); assert.equal(submissions.length,0); }
    else { assert.equal(errors.length,0); assert.equal(submissions.length,1); assert.equal(submissions[0].unit_number,unit); }
  }
});

function step(number) {
  const match = html.match(
    new RegExp(`<section class="val-step(?: active)?" data-step="${number}"[\\s\\S]*?<\\/section>`),
  );
  assert.ok(match, `missing valuation step ${number}`);
  return match[0];
}

test('valuation page presents the promised three short sections', () => {
  const numberedSteps = [...html.matchAll(/<section class="val-step(?: active)?" data-step="(\d)"/g)];

  assert.deepEqual(numberedSteps.map((match) => match[1]), ['1', '2', '3']);
  assert.match(html, /role="progressbar"[^>]+aria-valuemax="3"[^>]+aria-valuenow="1"/);
  assert.match(html, /Step <span id="stepNum">1<\/span> of 3/);
});

test('property, contact, and consent fields are split into focused steps', () => {
  const property = step(1);
  const contact = step(2);
  const review = step(3);

  for (const field of ['propType', 'postalCode', 'unitNumber']) {
    assert.match(property, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(property, /name="(?:fullName|mobile|email|consent)"/);

  for (const field of ['fullName', 'mobile', 'email']) {
    assert.match(contact, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(contact, /name="consent"/);

  assert.match(review, /class="val-review"/);
  assert.match(review, /name="consent"[^>]+required/);
  assert.match(review, /type="submit"[^>]+id="submitBtn"/);
});

test('step changes are accessible and funnel tracking stays privacy-safe', () => {
  assert.match(html, /steps\[current\]\.querySelector\('h2'\)\?\.focus/);
  assert.match(html, /progressBar\.setAttribute\('aria-valuetext'/);
  assert.match(html, /jtObserveLeadForm\(form,\{leadType:'valuation'\}\)/);
  assert.match(html, /jtTrackConversion\('lead_form_step_view',\{/);

  const trackingPayload = html.match(/jtTrackConversion\('lead_form_step_view',\{([\s\S]*?)\}\);/)?.[1];
  assert.ok(trackingPayload, 'missing step-view tracking payload');
  assert.doesNotMatch(trackingPayload, /fullName|mobile|email|postal|address/);
});

test('fast valid submissions wait for the spam floor instead of appearing stuck', () => {
  assert.match(
    html,
    /jtWaitForSpamFloor\(form,PAGE_LOADED_AT,3000,\(\)=>form\.requestSubmit\(\)\)/,
  );
});

test('standalone contact validation accepts blank backup email and rejects a malformed supplied address', () => {
  const handler = html.match(/function validateStep\(index\)\{([\s\S]*?)\n\}\n\nfunction showSuccess/)?.[1];
  assert.ok(handler);
  for (const [value, valid] of [['', true], ['test@example.com', true], ['invalid', false]]) {
    const errors = [];
    const email = { name:'email', type:'email', value, required:false, checkValidity:()=>valid };
    const fields = [{name:'fullName',type:'text',value:'Test',required:true,checkValidity:()=>true}, email];
    const result = vm.runInNewContext(`(index=>{${handler}})(0)`, {
      steps:[{querySelectorAll:selector=>fields.filter(field=>field.required || selector.includes('email'))}],
      form:{}, window:{}, clearErrors(){}, showFieldError:(_form,field)=>errors.push(field.name),
    });
    assert.equal(result, valid, value || '(blank)');
    assert.deepEqual(errors, valid ? [] : ['email']);
  }
});

test('review shows only the current property type and retains the unit after address lookup', () => {
  const review = html.match(/function updateReview\(\)\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(review);
  for (const [type, address, unit, expectedProperty, expectedLocation] of [
    ['HDB', '1 TEST ROAD, Singapore 123456', '#12-34', 'HDB · 4-room', '1 TEST ROAD, Singapore 123456 · #12-34'],
    ['Condo / Apartment', '1 TEST ROAD, Singapore 123456', '#12-34', 'Condo / Apartment', '1 TEST ROAD, Singapore 123456 · #12-34'],
    ['Landed', '', '', 'Landed', '123456'],
    ['HDB', '', '#12-34', 'HDB · 4-room', '123456 · #12-34'],
  ]) {
    const outputs = {};
    const field = value => ({value});
    vm.runInNewContext(review, {
      form: {propType:field(type), postalCode:field('123456'), unitNumber:field(unit), fullName:field('Test'), mobile:field('81234567'), email:field(''), querySelector:()=>field('4-room')},
      detectedAddress: address,
      document:{getElementById:id=>(outputs[id] ||= {})},
    });
    assert.equal(outputs.reviewProperty.textContent, expectedProperty);
    assert.equal(outputs.reviewLocation.textContent, expectedLocation);
    assert.equal(outputs.reviewContact.textContent, 'Test · 81234567');
  }
});

test('enquiry forms require an explicit successful JSON response before confirming delivery', async () => {
  const seller = fs.readFileSync(path.join(ROOT, 'sell-hdb/singapore/index.html'), 'utf8');
  for (const [page, source] of [['homepage', homepage], ['valuation', html], ['HDB seller', seller]]) {
    const responseCheck = source.match(/const result\s*=\s*await res\.json\(\)[\s\S]*?throw new Error\('submit failed'\);/)?.[0];
    assert.ok(responseCheck, page);
    for (const [status, payload, accepted] of [
      [200, '{"ok":true}', true], [201, '{"ok":true}', true],
      [200, '<html>upstream error</html>', false], [204, '', false],
      [200, '{}', false], [200, 'null', false], [200, '{"ok":"true"}', false],
      [200, '{"ok":false}', false], [503, '{"ok":true}', false],
    ]) {
      const res = {ok:status>=200 && status<300, json:async()=>JSON.parse(payload)};
      const check = vm.runInNewContext(`(async()=>{${responseCheck}})()`, {res});
      if (accepted) await assert.doesNotReject(check, `${page}: ${status} ${payload}`);
      else await assert.rejects(check, `${page}: ${status} ${payload}`);
    }
  }
});
