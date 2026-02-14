// cPanel/Passenger startup entrypoint
// Use this file as "Application startup file" in cPanel.
const app = require('./src/server');

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`[cpanel] Server listening on ${HOST}:${PORT}`);
});

module.exports = app;
