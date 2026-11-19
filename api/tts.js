const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const ALLOWED_VOICES = new Set([
  'pt-BR-AntonioNeural',
  'pt-BR-FranciscaNeural',
  'pt-BR-ThalitaMultilingualNeural',
  'pt-BR-HumbertoNeural',
  'pt-BR-FabioNeural',
  'pt-BR-BrendaNeural'
]);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let tts = null;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = String(body.text || '').trim().slice(0, 600);
    if (!text) return res.status(400).json({ error: 'Texto vazio.' });

    const voice = ALLOWED_VOICES.has(body.voice) ? body.voice : 'pt-BR-AntonioNeural';
    const rateNum = Math.max(-30, Math.min(50, Math.round(Number(body.ratePct) || 0)));
    const pitchNum = Math.max(-20, Math.min(20, Math.round(Number(body.pitchHz) || 0)));
    const rate = `${rateNum >= 0 ? '+' : ''}${rateNum}%`;
    const pitch = `${pitchNum >= 0 ? '+' : ''}${pitchNum}Hz`;

    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const streamRes = tts.toStream(text, { rate, pitch });
    const audioStream = streamRes.audioStream || streamRes;

    const chunks = [];
    await new Promise((resolve, reject) => {
      audioStream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      audioStream.on('end', resolve);
      audioStream.on('error', reject);
    });

    const mp3 = Buffer.concat(chunks);
    if (!mp3.length) throw new Error('Áudio vazio retornado.');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(mp3);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Falha ao sintetizar voz.' });
  } finally {
    if (tts) {
      try { tts.close(); } catch (e) {}
    }
  }
};
