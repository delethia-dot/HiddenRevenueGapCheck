/* ============================================================
   Hidden Revenue Gap Check  -  report generator
   Netlify Function  ->  place at:  netlify/functions/gap-report.js

   This function does ONE thing: turn the interview answers into
   the personalized Hidden Revenue Gap report.

   Lead capture is handled separately by capture.js, which the
   page calls first. Keeping capture out of here means a slow or
   failed report can never cost a lead.

   Environment variable (Netlify > Site settings > Environment):
     ANTHROPIC_API_KEY   (required)

   If the report cannot be generated, the page falls back to its
   own built-in report, so the visitor never hits a dead end.
   ============================================================ */

const MODEL = 'claude-sonnet-4-6';

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

  const answers = payload.answers || {};
  const estimate = payload.estimate || { low: 0, high: 0 };

  let report = null;
  try {
    report = await generateReport(answers, estimate);
  } catch (e) {
    report = null; /* the page has its own fallback report */
  }

  return { statusCode: 200, headers, body: JSON.stringify({ report: report }) };
};

/* ---------------------------------------------------------- */
/*  Report generation via the Anthropic API                    */
/* ---------------------------------------------------------- */
async function generateReport(answers, estimate) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('No API key');

  const system =
`You are the diagnostic engine behind the Hidden Revenue Gap Check, a free assessment from Delethia Johnson of Ink & Prosper, an AI strategy and automation consulting firm that works with service businesses.

A business owner has just finished a short interview. Using only their answers, write a sharp, honest diagnostic report that names where revenue is most likely leaking and what to address first.

VOICE AND STYLE, follow exactly:
- Warm, direct, plain spoken, confident. Short sentences. Speak to the owner as "you".
- Never use the word "help" or the phrase "I help". Use "partner with", "equip", "guide", "build", or "work with" instead.
- Never use em dashes anywhere. Use commas, periods, colons, or parentheses.
- No hype, no buzzwords, no claims that AI is revolutionary. Calm and credible, like a trusted advisor.
- Do not mention any framework, methodology, or program by name.

THE ESTIMATE:
You are given a monthly revenue at risk band (a low and a high number). Use that band as given. Do not invent a materially different figure. Frame it honestly as a directional estimate based on typical patterns, not a precise measurement.

OUTPUT:
Return only valid JSON. No preamble, no markdown, no code fences. Use exactly this shape:
{
  "headline": "6 to 10 words naming the single biggest gap",
  "summary": "2 to 3 sentences diagnosing the pattern in their answers",
  "estimateLow": <integer, the low number you were given>,
  "estimateHigh": <integer, the high number you were given>,
  "estimateNote": "one sentence framing the figure as directional, not precise",
  "frictionPoints": [
    { "title": "3 to 6 words", "detail": "one sentence tied to their actual answers" }
  ],
  "firstMove": "one sentence naming the single highest leverage fix to start with",
  "closingLine": "one warm, forward looking sentence, no pitch and no call to action"
}
frictionPoints must contain 2 or 3 items.`;

  const userMsg =
`Here is what the business owner told me.

Type of business: ${answers.business || 'not given'}
Biggest time drain each week: ${answers.timeEater || 'not given'}
Can customers reach a real response quickly: ${answers.reachability || 'not given'}
How fast new leads hear back: ${answers.responseSpeed || 'not given'}
Where leads most likely slip through: ${answers.leakArea || 'not given'}
New leads per month: ${answers.leadsPerMonth || 'not given'}
Typical job or customer value: ${answers.jobValue || 'not given'}
Reactivation of past customers: ${answers.reactivation || 'not given'}
The one thing they would fix tomorrow: ${answers.oneFix || 'not given'}

Computed monthly revenue at risk band: ${estimate.low} to ${estimate.high} US dollars.

Write the report as JSON now.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1100,
      system: system,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!res.ok) throw new Error('Anthropic API error ' + res.status);
  const data = await res.json();

  const text = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n')
    .trim();

  const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const report = JSON.parse(clean);

  /* keep the estimate band exactly as computed */
  report.estimateLow = estimate.low;
  report.estimateHigh = estimate.high;
  return report;
}
