// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const asyncMiddleware = require('../middleware/asyncMiddleware')
const express = require('express')
const router = express.Router()
const utils = require('../lib/utils')
const Curation = require('../lib/curation')

// Get a proposed patch for a specific revision of a component
router.get(
  '/:type/:provider/:namespace/:name/:revision/pr/:pr',
  asyncMiddleware(async (request, response) => {
    const coordinates = utils.toEntityCoordinatesFromRequest(request)
    return curationService.get(coordinates, request.params.pr).then(result => {
      if (result) return response.status(200).send(result)
      response.sendStatus(404)
    })
  })
)

// Get data needed by review UI
router.get(
  '/pr/:pr',
  asyncMiddleware(async (request, response) => {
    const repo = request.app.locals.config.curation.store.github.repo
    const owner = request.app.locals.config.curation.store.github.owner
    return curationService.getChangedDefinitions(request.params.pr).then(result => {
      if (result && result.length > 0) {
        return response
          .status(200)
          .send({ url: `https://github.com/${owner}/${repo}/pull/${request.params.pr}`, changes: result })
      }
      return response.sendStatus(404)
    })
  })
)

// Get an existing patch for a specific revision of a component
router.get(
  '/:type/:provider/:namespace/:name/:revision',
  asyncMiddleware(async (request, response) => {
    const coordinates = utils.toEntityCoordinatesFromRequest(request)
    return curationService.get(coordinates).then(result => {
      if (result) return response.status(200).send(result)
      response.sendStatus(404)
    })
  })
)

// Search for any patches related to the given path, as much as is given
router.get(
  '/:type?/:provider?/:namespace?/:name?',
  asyncMiddleware(async (request, response) => {
    const coordinates = utils.toEntityCoordinatesFromRequest(request)
    return curationService.list(coordinates).then(result => response.status(200).send(result))
  })
)

router.patch(
  '',
  asyncMiddleware(async (request, response) => {
    const serviceGithub = request.app.locals.service.github.client
    const userGithub = request.app.locals.user.github.client
    const info = request.app.locals.user.github.info
    const repo = request.app.locals.config.curation.store.github.repo
    const owner = request.app.locals.config.curation.store.github.owner
    let curationErrors = []
    request.body.patches.forEach(entry => {
      const curation = new Curation(entry)
      if (curation.errors.length > 0) {
        curationErrors = [...curationErrors, curation.errors]
      }
    })
    if (curationErrors.length > 0) response.status(400).send({ errors: curationErrors })
    else
      return curationService.addOrUpdate(userGithub, serviceGithub, info, request.body).then(result =>
        response.status(200).send({
          prNumber: result.data.number,
          url: `https://github.com/${owner}/${repo}/pull/${result.data.number}`
        })
      )
  })
)

let curationService

function setup(service) {
  curationService = service
  return router
}

module.exports = setup
