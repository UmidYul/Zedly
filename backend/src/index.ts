import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { superadminRoutes } from './routes/superadmin';
import { adminRoutes } from './routes/admin';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: config.isDevelopment ? 'debug' : 'info',
  },
  trustProxy: true,
});

// Register essential plugins
async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: config.isProduction ? undefined : false,
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
    cache: 10000,
  });

  // Multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: config.upload.maxFileSize,
    },
  });
}

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register API routes
async function registerRoutes() {
  // Auth routes
  await fastify.register(authRoutes, { prefix: `${config.apiBasePath}/auth` });

  // SuperAdmin routes
  await fastify.register(superadminRoutes, { prefix: `${config.apiBasePath}/superadmin` });

  // School Admin routes
  await fastify.register(adminRoutes, { prefix: `${config.apiBasePath}/admin` });
}

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  // Validation errors
  if (error.validation) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: error.validation,
    });
  }

  // Custom API errors
  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      code: error.code || 'ERROR',
      message: error.message,
    });
  }

  // Unknown errors - don't leak details in production
  return reply.status(500).send({
    code: 'INTERNAL_SERVER_ERROR',
    message: config.isProduction ? 'Internal server error' : error.message,
  });
});

// Not found handler
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    code: 'NOT_FOUND',
    message: 'Route not found',
  });
});

// Graceful shutdown
const closeGracefully = async (signal: string) => {
  fastify.log.info(`Received ${signal}, closing server gracefully...`);
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

// Start server
async function start() {
  try {
    await registerPlugins();
    await registerRoutes();

    const address = await fastify.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    fastify.log.info(`Server listening on ${address}`);
    fastify.log.info(`Environment: ${config.nodeEnv}`);
    fastify.log.info(`API Base Path: ${config.apiBasePath}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Only start if this file is run directly
if (require.main === module) {
  start();
}

export default fastify;
