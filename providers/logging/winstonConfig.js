const config = require('painless-config')
const appInsights = require('applicationinsights')
const aiLogger = require('winston-azure-application-insights').AzureApplicationInsightsLogger
const winston = require('winston')
const mockInsights = require('../../lib/mockInsights')

/**
 * @typedef {import('winston').Logger} Logger
 */

/**
 * Factory function to create a Winston logger instance.
 * @param {Object} [options] - Configuration options for the logger.
 * @param {string} [options.key] - Application Insights instrumentation key.
 * @param {boolean} [options.echo] - Whether to echo logs to the console.
 * @param {string} [options.level] - Log level (e.g., 'debug', 'info').
 * @returns {Logger} A configured Winston logger instance.
 */
function factory(options) {
  const realOptions = options || {
    key: config.get('APPINSIGHTS_INSTRUMENTATIONKEY'),
    echo: config.get('LOGGER_LOG_TO_CONSOLE') || true,
    level: config.get('APPINSIGHTS_EXPORT_LOG_LEVEL') || 'debug'
  }
  mockInsights.setup(realOptions.key || 'mock', realOptions.echo)

  const logger = winston.createLogger({
    level: realOptions.level,
    transports: [
      new winston.transports.Console({
        format: winston.format.prettyPrint(),
        silent: !realOptions.echo
      }),
      new aiLogger({
        insights: appInsights,
        treatErrorsAsExceptions: true,
        exitOnError: false
      })
    ]
  })

  return logger
}

module.exports = factory
