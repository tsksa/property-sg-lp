export function attachResultCopy({ button, status, fields, buildSummary, calculator, clipboard = navigator.clipboard, track = (...args) => window.jtTrackConversion?.(...args) }) {
  let revision = 0;
  const clearStatus = () => { revision += 1; status.textContent = ''; };
  fields.forEach(field => {
    field.addEventListener('input', clearStatus);
    field.addEventListener('change', clearStatus);
  });
  button.hidden = false;
  button.addEventListener('click', async () => {
    const invalid = fields.find(field => field.type === 'number' && (
      field.value.trim() === '' || !Number.isFinite(field.valueAsNumber) ||
      field.validity.rangeUnderflow || field.validity.rangeOverflow || field.validity.badInput
    ));
    if (invalid) {
      status.textContent = 'Enter valid numbers before copying your result.';
      invalid.focus();
      return;
    }
    const summary = buildSummary(); // Recalculate now, even during an input debounce.
    if (!summary) {
      status.textContent = 'Enter your numbers to produce an estimate before copying.';
      return;
    }
    const copiedRevision = revision;
    button.disabled = true;
    try {
      await clipboard.writeText(summary);
    } catch {
      if (revision === copiedRevision) status.textContent = 'Could not copy automatically. Please try again or select the result text manually.';
      return;
    } finally {
      button.disabled = false;
    }
    if (revision === copiedRevision) status.textContent = 'Result copied. You can paste it into your notes or a message.';
    try { track('calculator_result_copied', { calculator }); } catch { /* Analytics must not affect copying. */ }
  });
}
