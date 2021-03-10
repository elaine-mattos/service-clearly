// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const { concat, get, forIn, merge, isEqual, uniq, pick, flatten, flatMap, first, union } = require('lodash')
const moment = require('moment')
const geit = require('geit')
const yaml = require('js-yaml')
const throat = require('throat')
const Github = require('../../lib/github')
const Curation = require('../../lib/curation')
const EntityCoordinates = require('../../lib/entityCoordinates')
const tmp = require('tmp')
tmp.setGracefulCleanup()
const logger = require('../logging/logger')
const semver = require('semver')
const { LicenseMatcher } = require('../../lib/licenseMatcher')

// Responsible for managing curation patches in a store
//
// TODO:
// Validate the schema of the curation patch
class GitHubCurationService {
  constructor(options, store, endpoints, definition, cache, harvestStore, licenseMatcher) {
    this.logger = logger()
    this.options = options
    this.store = store
    this.endpoints = endpoints
    this.definitionService = definition
    this.curationUpdateTime = null
    this.tempLocation = null
    this.github = Github.getClient(options)
    this.cache = cache
    this.logger = logger()
    this.harvestStore = harvestStore
    this.licenseMatcher = licenseMatcher || new LicenseMatcher()
  }

  get tmpOptions() {
    return {
      unsafeCleanup: true,
      template: `${this.options.tempLocation}/cd-XXXXXX`
    }
  }

  /**
   * Enumerate all contributions in GitHub and in the store and updates any out of sync
   * @returns Promise indicating the operation is complete. The value of the resolved promise is undefined.
   */
  async syncAllContributions(client) {
    const states = ['open', 'closed']
    for (let state of states) {
      let response = await client.pullRequests.getAll({
        owner: this.options.owner,
        repo: this.options.repo,
        per_page: 100,
        state
      })
      this._processContributions(response.data)
      while (this.github.hasNextPage(response)) {
        response = await this.github.getNextPage(response)
        this._processContributions(response.data)
      }
    }
  }

  async _processContributions(prs) {
    for (let pr of prs) {
      const storedContribution = await this.store.getContribution(pr.number)
      const storedUpdated = get(storedContribution, 'pr.updated_at')
      if (!storedUpdated || new Date(storedUpdated).getTime() < new Date(pr.updated_at).getTime()) {
        this.logger.info(`Backfilling contribution for #${pr.number}`)
        await this.updateContribution(pr)
      }
    }
  }

  /**
   * Persist the updated contribution in the store and handle newly merged contributions
   * @param {*} pr - The GitHub PR object
   * @param {*} curations -Optional. The contributed curations for this PR
   * @returns Promise indicating the operation is complete. The value of the resolved promise is undefined.
   */
  async updateContribution(pr, curations = null) {
    curations = curations || (await this.getContributedCurations(pr.number, pr.head.sha))
    const data = {
      ...pick(pr, [
        'number',
        'id',
        'state',
        'title',
        'body',
        'created_at',
        'updated_at',
        'closed_at',
        'merged_at',
        'merge_commit_sha'
      ]),
      user: pick(pr.user, ['login']),
      head: { ...pick(pr.head, ['sha']), repo: { ...pick(get(pr, 'head.repo'), ['id']) } },
      base: { ...pick(pr.base, ['sha']), repo: { ...pick(get(pr, 'base.repo'), ['id']) } }
    }
    await this.store.updateContribution(data, curations)
    await Promise.all(
      uniq(flatten(curations.map(curation => curation.getCoordinates()))).map(
        throat(10, async coordinates => this.cache.delete(this._getCacheKey(coordinates)))
      )
    )
    if (data.merged_at) await this._prMerged(curations)
  }

  /**
   * Process the fact that the given PR has been merged by persisting the curation and invalidating the definition
   * @param {*} curations - The set of actual proposed changes
   * @returns Promise indicating the operation is complete. The value of the resolved promise is undefined.
   * @throws Exception with `code` === 404 if the given PR is missing. Other exceptions may be thrown related
   * to interaction with GitHub or PR storage
   */
  async _prMerged(curations) {
    await this.store.updateCurations(curations)
    // invalidate all affected definitions then recompute. This ensures the changed defs are cleared out
    // even if there are errors recomputing the definitions.
    const coordinateList = Curation.getAllCoordinates(curations)
    await this.definitionService.invalidate(coordinateList)
    return Promise.all(
      coordinateList.map(
        throat(5, coordinates => {
          this.definitionService
            .computeAndStore(coordinates)
            .catch(error => this.logger.info(`Failed to compute/store ${coordinates.toString()}: ${error.toString()}`))
        })
      )
    )
  }

  async validateContributions(number, sha, curations) {
    await this._postCommitStatus(sha, number, 'pending', 'Validation in progress')
    const invalidCurations = curations.filter(x => !x.isValid)
    let state = 'success'
    let description = 'All curations are valid'
    if (invalidCurations.length) {
      state = 'error'
      description = `Invalid curations: ${invalidCurations.map(x => x.path).join(', ')}`
      this.logger.error(description, invalidCurations)
    }
    return this._postCommitStatus(sha, number, state, description)
  }

  async _getMatchingLicenseVersions(coordinates, otherCoordinatesList) {
    const definition = await this.definitionService.getStored(coordinates)
    const harvest = await this.harvestStore.getAll(coordinates)
    const matches = []

    await Promise.all(otherCoordinatesList.map(async (otherCoordinates) => {
      const otherDefinition = await this.definitionService.getStored(otherCoordinates)
      const otherHarvest = await this.harvestStore.getAll(otherCoordinates)
      const result = this.licenseMatcher.process(
        { definition, harvest },
        { definition: otherDefinition, harvest: otherHarvest }
      )

      if (result.isMatching) {
        matches.push({
          version: otherCoordinates.revision,
          matchingProperties: result.match.map(reason => {
            if (reason.file) {
              return { file: reason.file }
            } else {
              return { propPath: reason.propPath, value: reason.value }
            }
          })
        })
      }
    }))

    return matches
  }

  _getRevisionsFromCurations(curations) {
    let revisions = []

    Object.keys(curations.curations).forEach(coordinate => {
      const coordinateObject = EntityCoordinates.fromString(coordinate)
      revisions.push(coordinateObject.revision)
    })

    curations.contributions.forEach(contribution => {
      contribution.files.forEach(file => {
        const fileRevisions = get(file, 'revisions', {}).map(revision => revision.revision)
        revisions = union(revisions, fileRevisions)
      })
    })

    return revisions
  }

  async _calculateMultiversionCurations(component) {
    const curationRevisions = get(component, 'revisions')
    const revision = first(Object.keys(curationRevisions))
    const componentCoordsWithRevision = { ...component.coordinates, revision }
    const coordinates = EntityCoordinates.fromObject(componentCoordsWithRevision)
    const revisionlessCoords = coordinates.asRevisionless()

    const coordinatesList = await this.definitionService.list(revisionlessCoords)
    const filteredCoordinatesList = coordinatesList
      .map(stringCoords => EntityCoordinates.fromString(stringCoords))
      .filter(coords => coordinates.name === coords.name && coordinates.revision !== coords.revision)

    const matchingVersionsAndReasons = await this._getMatchingLicenseVersions(coordinates, filteredCoordinatesList)
    const curations = await this.list(revisionlessCoords)
    const existingRevisions = this._getRevisionsFromCurations(curations)

    const uncuratedMatchingVersions = matchingVersionsAndReasons.filter(versionAndReason => existingRevisions.indexOf(versionAndReason.version) == -1)
    return uncuratedMatchingVersions
  }

  _updateContent(coordinates, currentContent, newContent) {
    const newCoordinates = EntityCoordinates.fromObject(coordinates).asRevisionless()
    const result = {
      coordinates: newCoordinates,
      revisions: get(currentContent, 'revisions') || {}
    }
    forIn(newContent, (value, key) => (result.revisions[key] = merge(result.revisions[key] || {}, value)))
    return yaml.safeDump(result, { sortKeys: true, lineWidth: 150 })
  }

  async _writePatch(userGithub, serviceGithub, info, patch, branch) {
    const { owner, repo } = this.options
    const coordinates = EntityCoordinates.fromObject(patch.coordinates)
    const currentContent = await this._getCurations(coordinates)
    const newContent = patch.revisions
    const updatedContent = this._updateContent(coordinates, currentContent, newContent)
    const content = Buffer.from(updatedContent).toString('base64')
    const path = this._getCurationPath(coordinates)
    const message = `Update ${path}`
    const fileBody = {
      owner,
      repo,
      path,
      message,
      content,
      branch
    }

    if (userGithub) {
      const { name, email } = await this._getUserInfo(userGithub)
      if (name && email) fileBody.committer = { name, email }
    }

    // Github requires name/email to set committer
    if ((info.name || info.login) && info.email)
      fileBody.committer = { name: info.name || info.login, email: info.email }
    if (get(currentContent, '_origin.sha')) {
      fileBody.sha = currentContent._origin.sha
      return serviceGithub.repos.updateFile(fileBody)
    }
    return serviceGithub.repos.createFile(fileBody)
  }

  async _getUserInfo(githubCli) {
    const user = await githubCli.users.get()
    const name = get(user, 'data.name')
    const email = get(user, 'data.email')
    const login = get(user, 'data.login')
    return { name, email, login }
  }

  // return true if patch.skipmvc is false and patch has 1 component and 1 revision
  _isEligibleForMultiversionCuration(patch) {
    return !patch.skipmvc && patch.patches.length == 1 && Object.keys(patch.patches[0].revisions).length == 1
  }

  // Return an array of valid patches that exist
  // and a list of definitions that do not exist in the store
  async _validateDefinitionsExist(patches) {
    const targetCoordinates = patches.reduce((result, patch) => {
      for (let key in patch.revisions)
        result.push(EntityCoordinates.fromObject({ ...patch.coordinates, revision: key }))
      return result
    }, [])
    const validDefinitions = await this.definitionService.listAll(targetCoordinates)
    return targetCoordinates.reduce(
      (result, coordinates) => {
        result[validDefinitions.find(definition => isEqual(definition, coordinates)) ? 'valid' : 'missing'].push(
          coordinates
        )
        return result
      },
      { valid: [], missing: [] }
    )
  }

  async autoCurate(definition) {
    try {
      const revisionLessCoordinates = definition.coordinates.asRevisionless()
      const curationAndContributions = await this.list(revisionLessCoordinates)

      if (!this._canBeAutoCurated(definition, curationAndContributions)) {
        return
      }

      // TODO: Only need to get the clearlydefined tool harvest data. Other tools' harvest data is not necessary.
      const harvest = await this.harvestStore.getAll(definition.coordinates)
      const orderedCoordinates = Object.keys(curationAndContributions.curations || {}).sort((a, b) => {
        const aRevision = EntityCoordinates.fromString(a).revision
        const bRevision = EntityCoordinates.fromString(b).revision
        if (semver.valid(aRevision) && semver.valid(bRevision)) {
          return semver.rcompare(aRevision, bRevision)
        }
        return 0
      })

      for (const coordinateStr of orderedCoordinates) {
        const curation = curationAndContributions.curations[coordinateStr]
        const declaredLicense = get(curation, 'licensed.declared')
        if (!declaredLicense) {
          continue
        }

        const otherCoordinates = EntityCoordinates.fromString(coordinateStr)
        const otherDefinition = await this.definitionService.getStored(otherCoordinates)
        if (!otherDefinition) {
          continue
        }

        const otherHarvest = await this.harvestStore.getAll(otherCoordinates)
        const result = this.licenseMatcher.process({ definition, harvest }, { definition: otherDefinition, harvest: otherHarvest })
        if (result.isMatching) {
          const info = await this._getUserInfo(this.github)
          // TODO: what is the detail of the PR overview.
          const patch = {
            contributionInfo: {
              type: 'missing',
              summary: definition.coordinates.toString(),
              details: `Add ${declaredLicense} license`,
              resolution: result.reason,
            },
            patches: [{
              coordinates: revisionLessCoordinates,
              revisions: {
                [definition.coordinates.revision]: curation
              }
            }]
          }

          const contribution = await this._addOrUpdate(null, this.github, info, patch)
          this.logger.info(`Auto curate success for ${definition.coordinates.toString()}. The contribution id is ${contribution.data.number}`)
        }
      }
    } catch (err) {
      this.logger.error('Auto curate failed', err)
      throw err
    }
  }

  _canBeAutoCurated(definition, curationAndContributions) {
    const tools = get(definition, 'described.tools')
    const hasClearlyDefinedInTools = tools.some(tool => tool.startsWith('clearlydefined'))
    const hasNoCurations = curationAndContributions.curations && Object.keys(curationAndContributions.curations).length === 0
    return hasClearlyDefinedInTools && !this._hasExistingCurations(definition, curationAndContributions) && !hasNoCurations
  }

  _hasExistingCurations(definition, curationAndContributions) {
    // MT_TODO: somehow my curation PR is open but it's not stored.
    const revisions = this._getRevisionsFromCurations(curationAndContributions)
    return revisions.includes(definition.coordinates.revision)
  }

  async addOrUpdate(userGithub, serviceGithub, info, patch) {
    const { missing } = await this._validateDefinitionsExist(patch.patches)
    if (missing.length > 0)
      throw new Error('The contribution has failed because some of the supplied component definitions do not exist')

    if (this._isEligibleForMultiversionCuration(patch) && this.options.multiversionCurationFeatureFlag) {
      const component = first(patch.patches)
      this.logger.info(`Identified an eligible component for multiversion curation: ${component.coordinates}`)

      const result = await this._calculateMultiversionCurations(component)
      if (result.length >= 0) {
        this.logger.info(`Curated ${result.length} additional versions for ${component.coordinates}`)

        const curationRevisions = get(component, 'revisions')
        const revision = first(Object.keys(curationRevisions))
        const license = get(curationRevisions, [revision, 'licensed', 'declared'])

        const newRevisions = {}
        result.forEach(versionAndReason => { newRevisions[versionAndReason.version] = { 'licensed': { 'declared': license } } })
        component.revisions = merge(curationRevisions, newRevisions)
        patch.contributionInfo.additional = this._formatMultiversionCuratedRevisions(result)
      }
    }

    return this._addOrUpdate(userGithub, serviceGithub, info, patch)
  }

  async _addOrUpdate(userGithub, serviceGithub, info, patch) {
    const { owner, repo, branch } = this.options
    const masterBranch = await serviceGithub.repos.getBranch({ owner, repo, branch: `refs/heads/${branch}` })
    const sha = masterBranch.data.commit.sha
    const prBranch = await this._getBranchName(info)
    await serviceGithub.gitdata.createReference({ owner, repo, ref: `refs/heads/${prBranch}`, sha })

    await Promise.all(
      // Throat value MUST be kept at 1, otherwise GitHub will write concurrent patches
      patch.patches.map(throat(1, component => this._writePatch(userGithub, serviceGithub, info, component, prBranch)))
    )

    const result = await (userGithub || serviceGithub).pullRequests.create({
      owner,
      repo,
      title: patch.contributionInfo.summary,
      body: this._generateContributionDescription(patch),
      head: `refs/heads/${prBranch}`,
      base: branch
    })
    const number = result.data.number
    const comment = {
      owner,
      repo,
      number,
      body: `You can review the change introduced to the full definition at [ClearlyDefined](https://clearlydefined.io/curations/${number}).`
    }
    await serviceGithub.issues.createComment(comment)
    return result
  }

  _generateContributionDescription(patch) {
    const { type, details, summary, resolution, additional } = patch.contributionInfo
    const Type = type.charAt(0).toUpperCase() + type.substr(1)
    return `
**Type:** ${Type}

**Summary:**
${summary}

**Details:**
${details}

**Resolution:**
${resolution}

**Affected definitions**:
${this._formatDefinitions(patch.patches)}

${additional}`
  }

  _formatDefinitions(definitions) {
    return definitions.map(
      def =>
        `- [${def.coordinates.name} ${Object.keys(def.revisions)[0]
        }](https://clearlydefined.io/definitions/${EntityCoordinates.fromObject(def.coordinates)}/${Object.keys(def.revisions)[0]
        })`
    )
  }

  _formatMultiversionCuratedRevisions(mvcResults) {
    let output = '**Automatically added versions:**\n'
    mvcResults
      .map(result => result.version)
      .sort((a, b) => {
        if (semver.valid(a) && semver.valid(b)) {
          return semver.compare(a, b)
        }
        return 0
      })
      .forEach(version => output += `- ${version}\n`)

    const matchingLicenses = []
    const matchingMetadata = {}
    mvcResults.forEach(result => {
      result.matchingProperties.forEach(match => {
        if (match.file) {
          if (matchingLicenses.indexOf(match.file) == -1) {
            matchingLicenses.push(match.file)
          }
        } else {
          matchingMetadata[match.propPath] = match.value
        }
      })
    })

    if (matchingLicenses.length > 0) {
      output += `\nMatching license file(s): ${matchingLicenses.join(', ')}`
    }

    if (Object.keys(matchingMetadata).length > 0) {
      const metadataText = Object.keys(matchingMetadata).length == 1
        ? Object.keys(matchingMetadata).map(metadataProp => `${metadataProp}: '${matchingMetadata[metadataProp]}'`)
        : Object.keys(matchingMetadata).map(metadataProp => `\n- ${metadataProp}: '${matchingMetadata[metadataProp]}'`)
      output += `\nMatching metadata: ${metadataText}`
    }

    return output
  }

  /**
   * Get the curation for the entity at the given coordinates. If no curation is supplied
   * then look up the standard curation. If the curation is a PR number, get the curation
   * held in that PR. The curation arg might be the actual curation to use. If so, just
   * return it.
   *
   * @param {EntitySpec} coordinates - The entity for which we are looking for a curation. Must include revision.
   * @param {(number | string | Summary)} [curation] - The curation identifier if any. Could be a PR number,
   * an actual curation object or null.
   * @returns {Object} The requested curation and corresponding revision identifier (e.g., commit sha) if relevant
   */
  async get(coordinates, curation = null) {
    if (!coordinates.revision) throw new Error(`Coordinates ${coordinates.toString()} appear to be malformed. Are they missing a namespace or revision?`)
    if (curation && typeof curation !== 'number' && typeof curation !== 'string') return curation
    const all = await this._getCurations(coordinates, curation)
    if (!all || !all.revisions) return null
    const result = all.revisions[coordinates.revision]
    if (!result) return null
    // Stash the sha of the content as a NON-enumerable prop so it does not get merged into the patch
    Object.defineProperty(result, '_origin', { value: all._origin, enumerable: false })
    return result
  }

  /**
   * Get the curations for the revisions of the entity at the given coordinates. Revision information
   * in coordinates are ignored. If a PR number is provided, get the curations represented in that PR.
   *
   * @param {EntitySpec} coordinates - The entity for which we are looking for a curation.
   * @param {(number | string} [pr] - The curation identifier if any. Could be a PR number/string.
   * @returns {Object} The requested curations where the revisions property has a property for each
   * curated revision. The returned value will be decorated with a non-enumerable `_origin` property
   * indicating the sha of the commit for the curations if that info is available.
   */
  async _getCurations(coordinates, pr = null) {
    const path = this._getCurationPath(coordinates)
    const { owner, repo } = this.options
    const smartGit = geit(`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`)
    const tree = await smartGit.tree(pr ? `refs/pull/${encodeURIComponent(pr)}/head` : this.options.branch)
    const treePath = flatMap(path.split('/'), (current, i, original) =>
      original.length - 1 != i ? [current, 'children'] : current
    )
    const blob = get(tree, treePath)
    if (!blob) return null
    const data = await smartGit.blob(blob.object)
    const content = yaml.safeLoad(data.toString())
    // Stash the sha of the content as a NON-enumerable prop so it does not get merged into the patch
    Object.defineProperty(content, '_origin', { value: { sha: blob.object }, enumerable: false })
    return content
  }

  /**
   * get the content for all curations in a given PR
   * @param {*} number - The GitHub PR number
   * @param {*} sha - The GitHub PR head sha
   * @returns {[Curation]} Promise for an array of Curations
   */
  async getContributedCurations(number, sha) {
    const prFiles = await this._getPrFiles(number)
    const curationFilenames = prFiles.map(x => x.filename).filter(this.isCurationFile)
    return Promise.all(
      curationFilenames.map(
        throat(10, async path => {
          const content = await this._getContent(sha, path)
          return new Curation(content, path)
        })
      )
    )
  }

  async apply(coordinates, curationSpec, definition) {
    const curation = await this.get(coordinates, curationSpec)
    const result = Curation.apply(definition, curation)
    this._ensureCurationInfo(result, curation)
    return result
  }

  _ensureCurationInfo(definition, curation) {
    if (!curation) return
    if (Object.getOwnPropertyNames(curation).length === 0) return
    const origin = get(curation, '_origin.sha')
    definition.described = definition.described || {}
    definition.described.tools = definition.described.tools || []
    definition.described.tools.push(`curation/${origin ? origin : 'supplied'}`)
  }

  async _getContent(ref, path) {
    const { owner, repo } = this.options
    try {
      const response = await this.github.repos.getContent({ owner, repo, ref, path })
      return Buffer.from(response.data.content, 'base64').toString('utf8')
    } catch (error) {
      this.logger.info(`Failed to get content for ${owner}/${repo}/${ref}/${path}`)
    }
  }

  async _postCommitStatus(sha, number, state, description) {
    const { owner, repo } = this.options
    const target_url = `${this.endpoints.website}/curations/${number}`
    try {
      return this.github.repos.createStatus({
        owner,
        repo,
        sha,
        state,
        description,
        target_url,
        context: 'ClearlyDefined'
      })
    } catch (error) {
      this.logger.info(`Failed to create status for PR #${number}`)
    }
  }

  /**
   * Given partial coordinates, return a list of Curations and Contributions
   * @param {EntityCoordinates} coordinates - the partial coordinates that describe the sort of curation to look for.
   * @returns {[EntityCoordinates]} - Array of coordinates describing the available curations
   */
  async list(coordinates) {
    const cacheKey = this._getCacheKey(coordinates)
    const existing = await this.cache.get(cacheKey)
    if (existing) return existing
    const data = await this.store.list(coordinates)
    if (data) await this.cache.set(cacheKey, data, 60 * 60 * 24)
    return data
  }

  /**
   * Return a list of Curations and Contributions for each coordinates provided
   *
   * @param {*} coordinatesList - an array of coordinate paths to list
   * @returns A list of Curations and Contributions for each coordinates provided
   */
  async listAll(coordinatesList) {
    const result = {}
    const promises = coordinatesList.map(
      throat(10, async coordinates => {
        const data = await this.list(coordinates)
        if (!data) return
        const key = coordinates.toString()
        result[key] = data
      })
    )
    await Promise.all(promises)
    return result
  }

  getCurationUrl(number) {
    return `https://github.com/${this.options.owner}/${this.options.repo}/pull/${number}`
  }

  // get the list of files changed in the given PR.
  async _getPrFiles(number) {
    const { owner, repo } = this.options
    try {
      const response = await this.github.pullRequests.getFiles({ owner, repo, number })
      return response.data
    } catch (error) {
      if (error.code === 404) throw error
      throw new Error(`Error calling GitHub to get pr#${number}. Code ${error.code}`)
    }
  }

  async getChangedDefinitions(number) {
    const files = await this._getPrFiles(number)
    const changedCoordinates = []
    for (let i = 0; i < files.length; ++i) {
      const fileName = files[i].filename.replace(/\.yaml$/, '').replace(/^curations\//, '')
      const coordinates = EntityCoordinates.fromString(fileName)
      const prDefinitions = (await this._getCurations(coordinates, number)) || { revisions: [] }
      const masterDefinitions = (await this._getCurations(coordinates)) || { revisions: [] }
      const allUnfilteredRevisions = concat(
        Object.keys(prDefinitions.revisions),
        Object.keys(masterDefinitions.revisions)
      )
      const allRevisions = uniq(allUnfilteredRevisions)
      const changedRevisions = allRevisions.filter(
        revision => !isEqual(prDefinitions.revisions[revision], masterDefinitions.revisions[revision])
      )
      changedRevisions.forEach(revision => changedCoordinates.push(`${fileName}/${revision}`))
    }
    return changedCoordinates
  }

  _getPrTitle(coordinates) {
    // Structure the PR title to match the entity coordinates so we can hackily reverse engineer that to build a URL... :-/
    return coordinates.toString()
  }

  async _getBranchName(info) {
    return `${info.login}_${moment().format('YYMMDD_HHmmss.SSS')}`
  }

  _getCurationPath(coordinates) {
    const path = coordinates.asRevisionless().toString()
    return `curations/${path}.yaml`
  }

  _getSearchRoot(coordinates) {
    const path = coordinates.asRevisionless().toString()
    return `curations/${path}`
  }

  // @todo perhaps validate directory structure based on coordinates
  isCurationFile(path) {
    return path.startsWith('curations/') && path.endsWith('.yaml')
  }

  _getCacheKey(coordinates) {
    return `cur_${EntityCoordinates.fromObject(coordinates)
      .toString()
      .toLowerCase()}`
  }
}

module.exports = (options, store, endpoints, definition, cache, harvestService, licenseMatcher) =>
  new GitHubCurationService(options, store, endpoints, definition, cache, harvestService, licenseMatcher)
