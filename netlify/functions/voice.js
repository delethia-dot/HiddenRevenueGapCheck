/* ============================================================
   Hidden Revenue Gap Check  -  voice (text to speech)
   Netlify Function  ->  place at:  netlify/functions/voice.js

   Speaks the interview questions in a real ElevenLabs voice.

   Environment variables (Netlify > Site settings > Environment):
     ELEVENLABS_API_KEY    (required for real voice)
     ELEVENLABS_VOICE_ID   (required for real voice)
     ELEVENLABS_MODEL      (optional, defaults to eleven_turbo_v2_5)

   If the variables are absent, this returns 503 and the page
   falls back to the browser voice on its own. The interview
   still works either way.
   ============================================================ */

const DEFAULT_MODEL = 'eleven_turbo_v2_5';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors(), body: 'Method not allowed' };
  }

  let text = '';
  try {
    text = String((JSON.parse(event.body || '{}').text) || '').trim().slice(0, 800);
  } catch (e) {
    return { statusCode: 400, headers: cors(), body: 'Bad request' };
  }
  if (!text) {
    return { statusCode: 400, headers: cors(), body: 'No text provided' };
  }

  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

  /* not configured yet: tell the page to use its browser-voice fallback */
  if (!key || !voiceId) {
    return { statusCode: 503, headers: cors(), body: 'Voice not configured' };
  }

  try {
    const res = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId + '?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: text,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!res.ok) {
      return { statusCode: 502, headers: cors(), body: 'Voice service error ' + res.status };
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: Object.assign(cors(), {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400'
      }),
      body: audio.toString('base64'),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, headers: cors(), body: 'Voice generation failed' };
  }
};

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}
