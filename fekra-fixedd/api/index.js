export default async function handler(req, res) {
  try {
    const { default: app } = await import('../server/app.js');
    return app(req, res);
  } catch (err) {
    console.error(err); // details stay in the Vercel logs, not on the page
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The server could not start. Please try again later.' }));
  }
}
