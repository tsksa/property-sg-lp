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
    // Must be >= submit-lead.js's time-on-form floor (currently 3000ms). The server
    // returns a silent HTTP 200 for anything under it — indistinguishable from a real
    // success — so if this gate ever opens sooner, a genuine fast submit gets shown
    // "Enquiry received" while the lead is dropped. tests/project-pages.test.mjs pins this.
    if(Date.now() - loadedAt < 3000) return;
    if(!form.checkValidity()){
      form.reportValidity();
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
      form.innerHTML = '<div class="pf-success"><div class="pf-success-icon">✓</div><h3>Enquiry received.</h3><p>Joe will follow up with the latest verified information for ' + project.replace(/[&<>"']/g, '') + '.</p></div>';
      if(window.gtag) window.gtag('event', 'generate_lead', {project: project});
    }).catch(function(){
      submit.disabled = false;
      submit.textContent = 'Send enquiry →';
      var existing = form.querySelector('.pf-error');
      if(!existing){
        var error = document.createElement('p');
        error.className = 'pf-error';
        error.setAttribute('role', 'alert');
        error.textContent = 'Could not send this enquiry. Please WhatsApp Joe on +65 8188 1488.';
        form.appendChild(error);
      }
    });
  });
})();
