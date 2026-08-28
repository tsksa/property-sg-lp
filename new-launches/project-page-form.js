(function(){
  'use strict';

  var form = document.getElementById('projectForm');
  if(!form || !form.hasAttribute('data-project')) return;

  var loadedAt = Date.now();
  var params = new URLSearchParams(window.location.search);
  var project = form.getAttribute('data-project');
  var landingPage = form.getAttribute('data-landing-page');

  form.addEventListener('submit', function(event){
    event.preventDefault();
    var submit = form.querySelector('button[type="submit"]');
    var honeypot = form.querySelector('[name="company_website"]');
    if(honeypot && honeypot.value) return;
    if(typeof window.jtValidateLeadForm === 'function' && !window.jtValidateLeadForm(form, [
      {name:'name',message:'Please enter your name.'},
      {name:'phone',message:'Enter an 8-digit Singapore phone number starting with 6, 8, or 9.'},
      {name:'email',message:'Enter a valid email address.'},
      {name:'interest',message:'Select your bedroom preference.'}
    ])) return;
    if(typeof window.jtValidateLeadForm !== 'function' && !form.checkValidity()){
      form.reportValidity();
      return;
    }
    // Must be >= submit-lead.js's time-on-form floor (currently 3000ms). The server
    // returns a silent HTTP 200 for anything under it — indistinguishable from a real
    // success — so if this gate ever opens sooner, a genuine fast submit gets shown
    // "Enquiry received" while the lead is dropped. tests/project-pages.test.mjs pins this.
    if(typeof window.jtWaitForSpamFloor === 'function' && !window.jtWaitForSpamFloor(form,loadedAt,3000,function(){
      if(typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', {cancelable:true}));
    })) return;
    if(typeof window.jtWaitForSpamFloor !== 'function' && Date.now() - loadedAt < 3000){
      setTimeout(function(){
        if(typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.dispatchEvent(new Event('submit', {cancelable:true}));
      },3000-(Date.now()-loadedAt));
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Sending…';
    // Field names are a contract with netlify/functions/submit-lead.js, which requires
    // full_name and mobile_number. Sending name/phone returns 400 "Missing field" and
    // the visitor is told to start over on WhatsApp. Mirrors new-launches.js.
    var payload = {
      lead_type: 'new_launch_registration',
      request_type: form.getAttribute('data-request-type') || 'interest',
      full_name: form.elements.name.value.trim(),
      mobile_number: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      interest: form.elements.interest.value,
      project: project,
      source_site: 'joetay.com',
      landing_page: landingPage,
      submitted_at: new Date().toISOString(),
      time_on_form_ms: Date.now() - loadedAt,
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_term: params.get('utm_term') || '',
      utm_content: params.get('utm_content') || ''
    };

    var tokenPromise = window.getRecaptchaToken
      ? window.getRecaptchaToken('project_enquiry')
      : Promise.resolve('');

    tokenPromise.then(function(token){
      payload.recaptcha_token = token;
      return fetch('/.netlify/functions/submit-lead', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
    }).then(function(response){
      if(!response.ok) throw new Error('Lead request failed');
      form.innerHTML = '<div class="pf-success" role="status" aria-live="polite"><div class="pf-success-icon" aria-hidden="true">✓</div><h3 tabindex="-1">Enquiry received.</h3><p>Joe will follow up with the latest verified information for ' + project.replace(/[&<>"']/g, '') + '.</p></div>';
      var successHeading = form.querySelector('h3');
      if(successHeading) successHeading.focus();
      if(window.gtag) window.gtag('event', 'generate_lead', {project: project});
    }).catch(function(){
      submit.disabled = false;
      submit.textContent = 'Send enquiry →';
      if(typeof window.jtShowFormRecovery === 'function') window.jtShowFormRecovery(form, {
        submit: submit,
        leadType: 'new_launch_registration',
        ctaLocation: 'project_form_recovery',
        whatsappText: 'Hi Joe, I tried to enquire about ' + project + ' on joetay.com but the form did not go through. Can you help?'
      });
    });
  });
})();
