/* ============================================================
   Hidden Revenue Gap Check  -  lead capture
   Netlify Function  ->  place at:  netlify/functions/capture.js

   The page calls this the instant the visitor submits the gate,
   before and independent of the report. A slow or failed report
   can never cost a lead.

   It writes the lead to BOTH destinations:
     - GoHighLevel  (the contact, for nurture and follow-up)
     - Airtable     (the full diagnostic record, for analysis)
   Each destination is independent. One failing does not stop the other.

   Environment variables (Netlify > Site settings > Environment):
     GHL_WEBHOOK_URL    GoHighLevel inbound webhook URL (from a workflow)
     AIRTABLE_TOKEN     Airtable personal access token
     AIRTABLE_BASE_ID   the Airtable base id (app...)
     AIRTABLE_TABLE     table name, defaults to "Gap Check Leads"

   Any destination whose variables are not set is skipped quietly.
   ============================================================ */

const SOURCE = 'Hidden Revenue Gap Check';

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request' }) };
  }

  const lead = payload.lead || {};
  const answers = payload.answers || {};
  const estimate = payload.estimate || { low: 0, high: 0 };
  const variant = payload.variant || 'AI-Led Interview';
  const gap = primaryGap(answers);

  /* both destinations run together, neither blocks the other */
  const outcome = await Promise.allSettled([
    sendToGHL(lead, answers, estimate, variant, gap),
    sendToAirtable(lead, answers, estimate, variant, gap)
  ]);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      ghl: settle(outcome[0]),
      airtable: settle(outcome[1])
    })
  };
};

function settle(r) {
  return r.status === 'fulfilled' ? r.value : 'failed';
}

/* a plain-language label for the biggest gap, from their answers */
function primaryGap(a) {
  const map = {
    'missed calls': 'Missed calls',
    'after-hours inquiries': 'After-hours inquiries',
    'slow follow-up': 'Slow follow-up',
    'quotes that go unanswered': 'Unanswered quotes',
    'dormant past customers': 'Dormant past customers',
    'unsure where leads are lost': 'Unidentified leak'
  };
  return map[a.leakArea] || 'Response speed';
}

/* ---------------------------------------------------------- */
/*  GoHighLevel  (inbound webhook)                             */
/* ---------------------------------------------------------- */
async function sendToGHL(lead, answers, estimate, variant, gap) {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return 'skipped';

  const name = String(lead.name || '').trim();
  const sp = name.indexOf(' ');
  const first = sp > -1 ? name.slice(0, sp) : name;
  const last = sp > -1 ? name.slice(sp + 1) : '';

  const body = {
    first_name: first,
    last_name: last,
    full_name: name,
    email: lead.email || '',
    contact_source: SOURCE,
    tags: [SOURCE, variant],
    lead_magnet: SOURCE,
    lead_magnet_variant: variant,
    business: answers.business || '',
    primary_gap: gap,
    estimate_low: estimate.low || 0,
    estimate_high: estimate.high || 0,
    response_speed: answers.responseSpeed || '',
    leak_area: answers.leakArea || '',
    leads_per_month: answers.leadsPerMonth || '',
    job_value: answers.jobValue || '',
    reactivation: answers.reactivation || '',
    one_fix: answers.oneFix || ''
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('GHL ' + res.status);
  return 'ok';
}

/* ---------------------------------------------------------- */
/*  Airtable  (full diagnostic record)                         */
/* ---------------------------------------------------------- */
async function sendToAirtable(lead, answers, estimate, variant, gap) {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token || !baseId) return 'skipped';

  const table = process.env.AIRTABLE_TABLE || 'Gap Check Leads';
  const url = 'https://api.airtable.com/v0/' + baseId + '/' + encodeURIComponent(table);

  const fields = {
    'Name': lead.name || '',
    'Email': lead.email || '',
    'Business': answers.business || '',
    'Biggest Time Drain': answers.timeEater || '',
    'Reachability': answers.reachability || '',
    'Response Speed': answers.responseSpeed || '',
    'Leak Area': answers.leakArea || '',
    'Leads Per Month': answers.leadsPerMonth || '',
    'Job Value': answers.jobValue || '',
    'Reactivation': answers.reactivation || '',
    'One Fix': answers.oneFix || '',
    'Primary Gap': gap,
    'Estimate Low': estimate.low || 0,
    'Estimate High': estimate.high || 0,
    'Variant': variant,
    'Source': SOURCE,
    'Submitted': new Date().toISOString()
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ records: [{ fields: fields }], typecast: true })
  });
  if (!res.ok) throw new Error('Airtable ' + res.status);
  return 'ok';
}
