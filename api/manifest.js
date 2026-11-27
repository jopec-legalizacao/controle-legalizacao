// Manifesto do app para quem instala pelo LINK PÚBLICO: abre direto no andamento
// (com o token), em vez da tela de login. Usado em /?p=TOKEN.
module.exports = (req, res) => {
  const t = String((req.query && req.query.p) || '').replace(/[^a-z0-9]/gi, '').slice(0, 64);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end(JSON.stringify({
    name: 'JOPEC · Andamento da Legalização',
    short_name: 'Legalização',
    id: '/?p=' + t,
    start_url: '/?p=' + t,
    scope: '/',
    display: 'standalone',
    background_color: '#f5f4f4',
    theme_color: '#a23133',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }));
};
