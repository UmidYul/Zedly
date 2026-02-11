const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

/**
 * GET /api/telegram/status
 * Check Telegram bot connection status
 */
router.get('/status', authenticate, authorize('superadmin', 'school_admin'), async (req, res) => {
    try {
        const { telegramBot } = require('../utils/notifications');

        if (!process.env.TELEGRAM_BOT_TOKEN) {
            return res.json({
                configured: false,
                connected: false,
                message: 'Telegram bot token not configured in .env file',
                details: {
                    token: false,
                    bot: null
                }
            });
        }

        if (!telegramBot) {
            return res.json({
                configured: true,
                connected: false,
                message: 'Telegram bot failed to initialize',
                details: {
                    token: true,
                    bot: false
                }
            });
        }

        // Try to get bot info to verify connection
        try {
            const botInfo = await telegramBot.getMe();

            return res.json({
                configured: true,
                connected: true,
                message: 'Telegram bot is connected and working',
                details: {
                    token: true,
                    bot: true,
                    info: {
                        username: botInfo.username,
                        first_name: botInfo.first_name,
                        id: botInfo.id,
                        can_join_groups: botInfo.can_join_groups,
                        can_read_all_group_messages: botInfo.can_read_all_group_messages,
                        supports_inline_queries: botInfo.supports_inline_queries
                    }
                }
            });
        } catch (botError) {
            return res.json({
                configured: true,
                connected: false,
                message: 'Failed to connect to Telegram API',
                error: botError.message,
                details: {
                    token: true,
                    bot: false,
                    error: botError.message
                }
            });
        }
    } catch (error) {
        console.error('Telegram status check error:', error);
        res.status(500).json({
            configured: false,
            connected: false,
            message: 'Error checking Telegram bot status',
            error: error.message
        });
    }
});

/**
 * POST /api/telegram/test
 * Send a test message to verify Telegram bot
 */
router.post('/test', authenticate, authorize('superadmin', 'school_admin'), async (req, res) => {
    try {
        const { chat_id } = req.body;

        if (!chat_id) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'chat_id is required'
            });
        }

        const { sendTelegram } = require('../utils/notifications');

        const testMessage = `🤖 <b>ZEDLY Test Message</b>\n\n✅ Ваш Telegram бот работает!\n📅 ${new Date().toLocaleString('ru-RU')}\n\n👤 Отправлено администратором: ${req.user.first_name} ${req.user.last_name}`;

        const success = await sendTelegram(chat_id, testMessage);

        if (success) {
            res.json({
                success: true,
                message: 'Test message sent successfully',
                chat_id: chat_id
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to send test message',
                chat_id: chat_id
            });
        }
    } catch (error) {
        console.error('Telegram test message error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to send test message',
            details: error.message
        });
    }
});

/**
 * GET /api/telegram/webhook
 * Get current webhook info
 */
router.get('/webhook', authenticate, authorize('superadmin'), async (req, res) => {
    try {
        const { telegramBot } = require('../utils/notifications');

        if (!telegramBot) {
            return res.status(400).json({
                error: 'not_configured',
                message: 'Telegram bot not configured'
            });
        }

        const webhookInfo = await telegramBot.getWebHookInfo();

        res.json({
            webhook: webhookInfo
        });
    } catch (error) {
        console.error('Get webhook info error:', error);
        res.status(500).json({
            error: 'server_error',
            message: 'Failed to get webhook info',
            details: error.message
        });
    }
});

module.exports = router;
