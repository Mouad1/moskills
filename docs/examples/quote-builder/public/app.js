'use strict';
const form = document.querySelector('#quote-form');
const services = document.querySelector('#services');
const paper = document.querySelector('#quote-paper');
const error = document.querySelector('#form-error');
const status = document.querySelector('#preview-status');
const print = document.querySelector('#print');
let sequence = 0;
let timer;
let nextId = 0;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function money(cents) {
  const value = BigInt(cents);
  return `€${(value / 100n).toLocaleString('en-IE')}.${(value % 100n).toString().padStart(2, '0')}`;
}
function addService(service = '', unitPrice = '', quantity = '1') {
  const id = ++nextId;
  const row = element('div', undefined, 'service-row');
  const details = element('div', undefined, 'line-details');
  const fields = [['service', 'Service name', service], ['unitPrice', 'Unit price (€)', unitPrice], ['quantity', 'Quantity', quantity]];
  for (const [key, label, value] of fields) {
    const wrap = element('div');
    const input = element('input');
    input.id = `${key}-${id}`;
    input.dataset.key = key;
    input.value = value;
    input.required = true;
    input.maxLength = key === 'service' ? 120 : 32;
    const labelNode = element('label', label);
    labelNode.htmlFor = input.id;
    if (key !== 'service') input.inputMode = key === 'quantity' ? 'numeric' : 'decimal';
    if (key === 'unitPrice') input.setAttribute('aria-describedby', 'money-help');
    wrap.append(labelNode, input);
    (key === 'service' ? row : details).append(wrap);
  }
  row.append(details);
  const remove = element('button', 'Remove service', 'secondary remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Remove service ${id}`);
  remove.addEventListener('click', () => {
    row.remove();
    document.querySelector('#add-service').focus();
    schedule();
  });
  row.append(remove);
  services.append(row);
  return row;
}
function payload() {
  return { business: form.elements.business.value, client: form.elements.client.value, discount: form.elements.discount.value,
    items: [...services.children].map(row => Object.fromEntries([...row.querySelectorAll('input')].map(input => [input.dataset.key, input.value]))) };
}
function render(quote) {
  const head = element('header', undefined, 'document-head');
  const identity = element('div');
  identity.append(element('h3', quote.business), element('p', 'Prepared for your next project'));
  head.append(identity, element('div', 'Quote', 'quote-title'));
  const client = element('div', 'Prepared for', 'client-block');
  client.append(element('strong', quote.client));
  const lines = element('dl', undefined, 'quote-lines');
  for (const item of quote.items) {
    const row = element('div', undefined, 'quote-line');
    const name = element('dt', item.service);
    name.append(element('small', `${item.quantity} × ${money(item.unitPriceCents)}`));
    row.append(name, element('dd', money(item.totalCents)));
    lines.append(row);
  }
  const totals = element('dl', undefined, 'totals');
  for (const [label, value, className] of [['Subtotal', money(quote.subtotalCents)], [`Discount (${quote.discountPercent}%)`, `−${money(quote.discountCents)}`], ['Total', money(quote.totalCents), 'grand']]) {
    const row = element('div', undefined, className);
    row.append(element('dt', label), element('dd', value));
    totals.append(row);
  }
  paper.replaceChildren(head, client, lines, totals, element('footer', 'All amounts in EUR. Tax is not calculated. Thank you for considering this proposal.', 'document-footer'));
}
function invalidate(message) {
  print.disabled = true;
  status.textContent = message;
  paper.replaceChildren(element('p', 'Your quote will appear here when all details are valid.'));
}
async function update() {
  clearTimeout(timer);
  const request = ++sequence;
  error.hidden = true;
  for (const input of form.querySelectorAll('input')) input.removeAttribute('aria-invalid');
  invalidate('Updating preview…');
  try {
    const response = await fetch('/api/quote', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload()) });
    const result = await response.json();
    if (request !== sequence) return;
    if (!response.ok) throw new Error(result.error || 'Check your quote details.');
    render(result);
    status.textContent = 'Preview up to date.';
    print.disabled = false;
  } catch (problem) {
    if (request !== sequence) return;
    error.textContent = problem.message === 'Failed to fetch' ? 'Could not update the quote. Check that the local server is running.' : problem.message;
    error.hidden = false;
    invalidate('Preview needs valid details.');
    for (const input of form.querySelectorAll('input')) if (!input.value.trim()) input.setAttribute('aria-invalid', 'true');
  }
}
function schedule() {
  ++sequence;
  clearTimeout(timer);
  invalidate('Details changed. Updating preview…');
  timer = setTimeout(update, 350);
}
form.addEventListener('input', schedule);
form.addEventListener('submit', event => { event.preventDefault(); update(); });
document.querySelector('#add-service').addEventListener('click', () => { const row = addService(); row.querySelector('input').focus(); schedule(); });
document.querySelector('#clear').addEventListener('click', () => {
  ++sequence;
  clearTimeout(timer);
  form.elements.business.value = '';
  form.elements.client.value = '';
  form.elements.discount.value = '0';
  services.replaceChildren();
  addService();
  error.hidden = true;
  invalidate('New draft. Add your business, client and services.');
  form.elements.business.focus();
});
print.addEventListener('click', () => window.print());
addService('Photography', '200', '1');
addService('Editing', '100', '1');
update();
