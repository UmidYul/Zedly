require('dotenv').config();

process.env.SERVE_API = 'true';
process.env.SERVE_FRONTEND = 'false';

const app = require('./server');

const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`[api] Server listening on ${HOST}:${PORT}`);
});
