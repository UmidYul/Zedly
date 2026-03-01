const https = require('https');
const { EventEmitter } = require('events');

const DEFAULT_POLL_TIMEOUT_SECONDS = 25;
const DEFAULT_POLL_RETRY_MS = 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 35000;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTelegramApiError(statusCode, body, fallbackMessage) {
    const description = body && typeof body === 'object'
        ? String(body.description || fallbackMessage || 'Telegram API request failed')
        : String(fallbackMessage || 'Telegram API request failed');
    const prefix = statusCode ? `${statusCode} ` : '';
    const error = new Error(`${prefix}${description}`);
    error.code = 'ETELEGRAM';
    error.response = {
        statusCode,
        body
    };
    return error;
}

class TelegramClient extends EventEmitter {
    constructor(token, options = {}) {
        super();

        const normalizedToken = String(token || '').trim();
        if (!normalizedToken) {
            throw new Error('Telegram token is required');
        }

        this.token = normalizedToken;
        this.baseUrl = `https://api.telegram.org/bot${this.token}`;
        this.pollTimeoutSeconds = Number.isFinite(options.pollTimeoutSeconds)
            ? Math.max(1, options.pollTimeoutSeconds)
            : DEFAULT_POLL_TIMEOUT_SECONDS;
        this.pollRetryMs = Number.isFinite(options.pollRetryMs)
            ? Math.max(100, options.pollRetryMs)
            : DEFAULT_POLL_RETRY_MS;
        this.requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
            ? Math.max(1000, options.requestTimeoutMs)
            : DEFAULT_REQUEST_TIMEOUT_MS;

        this.pollOffset = 0;
        this.pollingActive = false;
        this.pollingPromise = null;
        this.currentPollRequest = null;
        this.textHandlers = [];

        if (options.polling) {
            this.startPolling();
        }
    }

    onText(regex, callback) {
        if (!(regex instanceof RegExp)) {
            throw new TypeError('onText expects RegExp as the first argument');
        }
        if (typeof callback !== 'function') {
            throw new TypeError('onText expects function as the second argument');
        }

        this.textHandlers.push({ regex, callback });
        return callback;
    }

    async startPolling() {
        if (this.pollingActive) {
            return this.pollingPromise;
        }

        this.pollingActive = true;
        this.pollingPromise = this.pollLoop();
        return this.pollingPromise;
    }

    async stopPolling() {
        this.pollingActive = false;

        if (this.currentPollRequest && !this.currentPollRequest.destroyed) {
            this.currentPollRequest.destroy(new Error('Telegram polling stopped'));
        }

        if (this.pollingPromise) {
            await this.pollingPromise.catch(() => {});
        }
    }

    async sendMessage(chatId, text, options = {}) {
        return this.apiRequest('sendMessage', {
            chat_id: chatId,
            text,
            ...options
        });
    }

    async getMe() {
        return this.apiRequest('getMe');
    }

    async getWebHookInfo() {
        return this.apiRequest('getWebhookInfo');
    }

    async pollLoop() {
        while (this.pollingActive) {
            try {
                const updates = await this.apiRequest(
                    'getUpdates',
                    {
                        offset: this.pollOffset,
                        timeout: this.pollTimeoutSeconds,
                        allowed_updates: ['message']
                    },
                    { isPolling: true }
                );

                if (!Array.isArray(updates)) {
                    continue;
                }

                for (const update of updates) {
                    if (!update || typeof update.update_id !== 'number') {
                        continue;
                    }

                    this.pollOffset = Math.max(this.pollOffset, update.update_id + 1);
                    const message = update.message;
                    if (!message) {
                        continue;
                    }

                    this.emit('message', message);
                    this.dispatchTextHandlers(message);
                }
            } catch (error) {
                if (!this.pollingActive) {
                    break;
                }

                this.emit('polling_error', error);

                if (!this.pollingActive) {
                    break;
                }

                await delay(this.pollRetryMs);
            }
        }
    }

    dispatchTextHandlers(message) {
        const text = typeof message?.text === 'string' ? message.text : '';
        if (!text) {
            return;
        }

        for (const handler of this.textHandlers) {
            const match = text.match(handler.regex);
            if (!match) {
                continue;
            }

            Promise.resolve()
                .then(() => handler.callback(message, match))
                .catch((error) => this.emit('polling_error', error));
        }
    }

    apiRequest(method, payload = {}, options = {}) {
        const isPolling = !!options.isPolling;
        const requestBody = JSON.stringify(payload || {});
        const requestOptions = {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(requestBody)
            }
        };

        return new Promise((resolve, reject) => {
            let settled = false;
            const url = `${this.baseUrl}/${method}`;
            const request = https.request(url, requestOptions, (response) => {
                let responseData = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    responseData += chunk;
                });
                response.on('end', () => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    if (isPolling && this.currentPollRequest === request) {
                        this.currentPollRequest = null;
                    }

                    let parsedBody = null;
                    if (responseData) {
                        try {
                            parsedBody = JSON.parse(responseData);
                        } catch (error) {
                            reject(new Error(`Telegram API ${method} returned invalid JSON`));
                            return;
                        }
                    } else {
                        parsedBody = {};
                    }

                    const statusCode = Number(response.statusCode || 0);
                    if (statusCode >= 400 || !parsedBody.ok) {
                        reject(
                            createTelegramApiError(
                                statusCode,
                                parsedBody,
                                `Telegram API ${method} request failed`
                            )
                        );
                        return;
                    }

                    resolve(parsedBody.result);
                });
            });

            if (isPolling) {
                this.currentPollRequest = request;
            }

            request.setTimeout(this.requestTimeoutMs, () => {
                request.destroy(new Error(`Telegram API ${method} request timeout`));
            });

            request.on('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (isPolling && this.currentPollRequest === request) {
                    this.currentPollRequest = null;
                }
                reject(error);
            });

            request.write(requestBody);
            request.end();
        });
    }
}

module.exports = TelegramClient;
