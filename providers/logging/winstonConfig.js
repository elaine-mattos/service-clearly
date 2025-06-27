const config = require('painless-config')
const winston = require('winston')

/**
 * @typedef {import('winston').Logger} Logger
 */

/**
 * Factory function to create a Winston logger instance.
 * @param {Object} [options] - Configuration options for the logger.
 * @param {boolean} [options.echo] - Whether to echo logs to the console.
 * @param {string} [options.level] - Log level (e.g., 'debug', 'info').
 * @returns {Logger} A configured Winston logger instance.
 */
function factory(options) {
  const realOptions = options || {
    echo: config.get('LOGGER_LOG_TO_CONSOLE') ?? true,
    level: config.get('APPINSIGHTS_EXPORT_LOG_LEVEL') || 'info'
  }

  const logger = winston.createLogger({
    level: realOptions.level,
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(
            ({ timestamp, level, message, ...meta }) =>
              `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
          )
        ),
        silent: !realOptions.echo
      })
    ]
  })

  return logger
}

module.exports = factory
