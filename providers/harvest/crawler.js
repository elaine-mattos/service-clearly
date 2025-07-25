// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const { callFetch: requestPromise } = require('../../lib/fetch')
const logger = require('../logging/logger')

class CrawlingHarvester {
  constructor(options) {
    this.logger = logger()
    this.options = options
  }

  async harvest(spec, turbo) {
    const headers = {
      'X-token': this.options.authToken
    }
    const body = (Array.isArray(spec) ? spec : [spec]).map(entry => this.toHarvestItem(entry))
    const url = turbo ? `${this.options.url}/requests` : `${this.options.url}/requests/later`
    this.logger.info(`CrawlingHarvester: Harvesting ${url} with ${JSON.stringify(body)}`)
    this.logger.debug(`CrawlingHarvester: Harvesting ${url} with ${JSON.stringify(body)}`)
    this.logger.debug(`CrawlingHarvester: Harvesting ${url} with ${JSON.stringify(headers)}`)
    this.logger.debug(`CrawlingHarvester: Harvesting ${turbo}`)
    return requestPromise({
      url,
      method: 'POST',
      body,
      headers,
      json: true
    })
  }

  toHarvestItem(entry) {
    return {
      type: entry.tool || 'component',
      url: `cd:/${entry.coordinates.toString().replace(/[/]+/g, '/')}`,
      policy: entry.policy
    }
  }
}

module.exports = options => new CrawlingHarvester(options)
