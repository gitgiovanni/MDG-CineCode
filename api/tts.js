function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada na Vercel.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = String(body.text || '').trim().slice(0, 600);
    const allowedVoices = ['Puck', 'Fenrir', 'Charon', 'Kore', 'Aoede', 'Orus', 'Zephyr'];
    const voiceName = allowedVoices.includes(body.voice) ? body.voice : 'Puck';

    if (!text) {
      return res.status(400).json({ error: 'Texto vazio.' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Narre em português brasileiro de forma natural, clara e com ritmo ágil de vídeo curto: ${text}`
          }]
        }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).json({ error: `Gemini TTS falhou: ${errText.slice(0, 180)}` });
    }

    const data = await upstream.json();
    const audioPart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!audioPart?.inlineData?.data) {
      return res.status(502).json({ error: 'API não retornou áudio.' });
    }

    const rawBuf = Buffer.from(audioPart.inlineData.data, 'base64');
    const mime = String(audioPart.inlineData.mimeType || '').toLowerCase();

    if (mime.includes('l16') || mime.includes('pcm')) {
      const rateMatch = mime.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      const wavBuf = pcmToWav(rawBuf, sampleRate);
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(wavBuf);
    }

    res.setHeader('Content-Type', audioPart.inlineData.mimeType || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(rawBuf);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no TTS.' });
  }
};
