// Temporary: shows why the API failed to start (remove the "reason" line later)
export default async function handler(req, res) {
  try {
    const { default: app } = await import('../server/app.js');
    return app(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'API failed to start', reason: String(err.message) }));
  }
}
