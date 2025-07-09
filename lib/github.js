// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const { Octokit } = require('@octokit/rest')
const { defaultHeaders } = require('./fetch')

module.exports = {
  getClient: function (options) {
    const config = {
      headers: defaultHeaders
    }

    if (options && options.token) {
      config.auth = options.token
    }

    const github = new Octokit(config)
    return github
  }
}
