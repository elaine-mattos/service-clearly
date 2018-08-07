// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const he = require('he')
const { get, first } = require('lodash')
const minimatch = require('minimatch')
const { extractDate, setIfValue, addArrayToSet, setToArray } = require('../../lib/utils')

class ScanCodeSummarizer {
  constructor(options) {
    this.options = options
  }

  /**
   * Summarize the raw information related to the given coordinates.
   * @param {EntitySpec} coordinates - The entity for which we are summarizing
   * @param {*} harvested - the set of raw tool ouptuts related to the idenified entity
   * @returns {Definition} - a summary of the given raw information
   */
  summarize(coordinates, harvested) {
    if (!harvested || !harvested.content || !harvested.content.scancode_version)
      throw new Error('Not valid ScanCode data')
    const result = {}
    this.addDescribedInfo(result, coordinates, harvested)
    const declaredLicense =
      this._summarizeDeclaredLicenseInfo(harvested.content.files) || this._summarizePackageInfo(harvested.content.files)
    setIfValue(result, 'licensed.declared', declaredLicense)
    result.files = this._summarizeFileInfo(harvested.content.files)
    return result
  }

  addDescribedInfo(result, coordinates, harvested) {
    const releaseDate = harvested._metadata.releaseDate
    if (releaseDate) result.described = { releaseDate: extractDate(releaseDate.trim()) }
  }

  _summarizeDeclaredLicenseInfo(files) {
    for (let file of files) {
      const pathArray = file.path.split('/')
      const baseName = first(pathArray)
      const isLicense = ['license', 'license.txt', 'license.md', 'license.html'].includes(baseName.toLowerCase())
      if (isLicense && file.licenses) {
        // Find the first license file and treat it as the authority
        const declaredLicenses = addArrayToSet(file.licenses, new Set(), license => license.spdx_license_key)
        return this._toExpression(declaredLicenses)
      }
    }
    return null
  }

  _summarizePackageInfo(files) {
    for (let file of files) {
      const asserted = get(file, 'packages[0].asserted_licenses')
      // Find the first package file and treat it as the authority
      if (asserted) {
        const packageLicenses = addArrayToSet(
          asserted,
          new Set(),
          license => license.license || license.spdx_license_key
        )
        return this._toExpression(packageLicenses)
      }
    }
    return null
  }

  _summarizeFileInfo(files) {
    return files.map(file => {
      const asserted = get(file, 'packages[0].asserted_licenses')
      const fileLicense = asserted || file.licenses
      const licenses = addArrayToSet(fileLicense, new Set(), license => license.license || license.spdx_license_key)
      const licenseExpression = this._toExpression(licenses)
      const attributions = this._collectAttributions(file.copyrights)
      const result = { path: file.path }
      setIfValue(result, 'license', licenseExpression)
      setIfValue(result, 'attributions', attributions)
      return result
    })
  }

  _toExpression(licenses) {
    if (!licenses) return null
    const list = setToArray(licenses)
    return list ? list.join(' and ') : null
  }

  _collectAttributions(copyrights) {
    if (!copyrights || !copyrights.length) return null
    const set = new Set()
    for (let copyright of copyrights) {
      if (!copyright.statements) continue
      const statements = copyright.statements.map(statement =>
        he
          .decode(statement)
          .replace(/(\\[nr]|[\n\r])/g, ' ')
          .replace(/ +/g, ' ')
          .trim()
      )
      addArrayToSet(statements, set)
    }
    return setToArray(set)
  }
}

module.exports = options => new ScanCodeSummarizer(options)
