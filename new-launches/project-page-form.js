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
    if(Date.now() - loadedAt < 2000) return;
    if(!form.checkValidity()){
      form.reportValidity();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Sending…';
    var payload = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      interest: form.elements.interest.value,
      project: project,
      landing_page: landingPage,
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
