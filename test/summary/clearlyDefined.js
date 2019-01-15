// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const chai = require('chai')
const validator = require('../../schemas/validator')
const { expect } = chai
const Summarizer = require('../../providers/summary/clearlydefined')
const { setIfValue } = require('../../lib/utils')
const EntityCoordinates = require('../../lib/entityCoordinates')

describe('ClearlyDefined Maven summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupMaven('2018-03-06T11:38:10.284Z')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles licenseUrl', () => {
    const { coordinates, harvested } = setupMaven('2018-03-06T11:38:10.284Z', true, {
      licenses: [{ license: { url: 'https://opensource.org/licenses/MIT' } }]
    })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles licenseName', () => {
    const { coordinates, harvested } = setupMaven('2018-03-06T11:38:10.284Z', true, {
      licenses: [{ license: { name: 'MIT' } }]
    })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles missing license of projectSummary', () => {
    const { coordinates, harvested } = setupMaven('2018-03-06T11:38:10.284Z', true, {})
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles data with source location', () => {
    const { coordinates, harvested } = setupMaven('2018-03-06T11:38:10.284Z', true)
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.sourceLocation.url).to.eq(getSourceUrl())
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupMaven()
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })
})

function setupMaven(releaseDate, sourceInfo, projectSummary) {
  const coordinates = EntityCoordinates.fromString('maven/mavencentral/io.clearlydefined/test/1.0')
  const harvested = {}
  setIfValue(harvested, 'releaseDate', releaseDate)
  setIfValue(harvested, 'manifest.summary.project', projectSummary)
  if (sourceInfo) harvested.sourceInfo = createSourceLocation(sourceInfo)
  return { coordinates, harvested }
}

describe('ClearlyDefined NuGet summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupNuGet({ releaseDate: '2018-03-06T11:38:10.284Z' })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles data with source location', () => {
    const { coordinates, harvested } = setupNuGet({ releaseDate: '2018-03-06T11:38:10.284Z', sourceInfo: true })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.sourceLocation.url).to.eq(getSourceUrl())
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupNuGet({})
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })

  it('includes files from manifest', () => {
    const { coordinates, harvested } = setupNuGet({
      packageEntries: [
        { fullName: 'lib/net40/Project.dll' },
        { fullName: 'LICENSE' },
        { fullName: 'lib/netstandard1.3/Project.dll' }
      ]
    })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.files).to.deep.equal([
      { path: 'lib/net40/Project.dll' },
      { path: 'LICENSE' },
      { path: 'lib/netstandard1.3/Project.dll' }
    ])
  })
})

function setupNuGet({ releaseDate, sourceInfo, packageEntries }) {
  const coordinates = EntityCoordinates.fromString('nuget/nuget/-/test/1.0')
  const harvested = {}
  setIfValue(harvested, 'releaseDate', releaseDate)
  setIfValue(harvested, 'manifest.packageEntries', packageEntries)
  if (sourceInfo) harvested.sourceInfo = createSourceLocation(sourceInfo)
  return { coordinates, harvested }
}

describe('ClearlyDefined Source Archive summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupSourceArchive('2018-03-06T11:38:10.284Z')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles data with source location', () => {
    const { coordinates, harvested } = setupSourceArchive('2018-03-06T11:38:10.284Z', true)
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.sourceLocation.url).to.eq(getSourceUrl())
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupSourceArchive()
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })
})

function setupSourceArchive(releaseDate, sourceInfo) {
  const coordinates = EntityCoordinates.fromString('sourcearchive/github/-/test/1.0')
  const harvested = {}
  setIfValue(harvested, 'releaseDate', releaseDate)
  if (sourceInfo) harvested.sourceInfo = createSourceLocation(sourceInfo)
  return { coordinates, harvested }
}

describe('ClearlyDefined NPM summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupNpm('2018-03-06T11:38:10.284Z', 'MIT', 'http://homepage', {
      url: 'http://bugs',
      email: 'bugs@test.com'
    })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.issueTracker).to.eq('http://bugs')
    expect(summary.described.projectWebsite).to.eq('http://homepage')
  })

  it('handles data with source location', () => {
    const { coordinates, harvested } = setupNpm('2018-03-06T11:38:10.284Z', null, null, null, true)
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.sourceLocation.url).to.eq(getSourceUrl())
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupNpm()
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })

  it('handles only releaseDate', () => {
    const { coordinates, harvested } = setupNpm('2018-03-06T11:38:10.284Z')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.issueTracker).to.be.undefined
    expect(summary.described.projectWebsite).to.be.undefined
  })

  it('handles string issueTracker', () => {
    const { coordinates, harvested } = setupNpm(null, null, null, 'http://bugs')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.be.undefined
    expect(summary.described.issueTracker).to.eq('http://bugs')
    expect(summary.described.projectWebsite).to.be.undefined
  })

  it('handles non url string issueTracker', () => {
    const { coordinates, harvested } = setupNpm(null, null, null, 'bugs@test.com')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })

  it('handles object license', () => {
    const { coordinates, harvested } = setupNpm(null, { type: 'MIT' })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described).to.be.undefined
  })
})

function setupNpm(releaseDate, license, homepage, bugs, sourceInfo) {
  const registryData = {}
  setIfValue(registryData, 'releaseDate', releaseDate)
  setIfValue(registryData, 'manifest.license', license)
  setIfValue(registryData, 'manifest.homepage', homepage)
  setIfValue(registryData, 'manifest.bugs', bugs)
  const harvested = { registryData }
  if (sourceInfo) harvested.sourceInfo = createSourceLocation(sourceInfo)
  const coordinates = EntityCoordinates.fromString('npm/npmjs/-/test/1.0')
  return { coordinates, harvested }
}

describe('ClearlyDefined Gem summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupGem('2018-03-06T11:38:10.284Z', ['MIT'])
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles multiple licenses', () => {
    const { coordinates, harvested } = setupGem('2018-03-06T11:38:10.284Z', ['MIT', 'BSD-2-Clause'])
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT OR BSD-2-Clause')
  })

  it('normalizes multiple licenses', () => {
    const { coordinates, harvested } = setupGem('2018-03-06T11:38:10.284Z', ['MIT', 'JUNK'])
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT OR NOASSERTION')
  })

  it('handles singular license', () => {
    const { coordinates, harvested } = setupGem('2018-03-06T11:38:10.284Z', 'MIT')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
  })

  it('handles data with source location', () => {
    const { coordinates, harvested } = setupGem('2018-03-06T11:38:10.284Z', null, true)
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.sourceLocation.url).to.eq(getSourceUrl())
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupGem()
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })
})

function setupGem(releaseDate, licenses, sourceInfo) {
  const coordinates = EntityCoordinates.fromString('gem/rubygems/-/test/1.0')
  const harvested = {}
  setIfValue(harvested, 'releaseDate', releaseDate)
  if (typeof licenses === 'string') setIfValue(harvested, 'registryData.license', licenses)
  else setIfValue(harvested, 'registryData.licenses', licenses)
  if (sourceInfo) harvested.sourceInfo = createSourceLocation(sourceInfo)
  return { coordinates, harvested }
}

describe('ClearlyDefined Pypi summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupPypi('2018-03-06T11:38:10.284Z', 'MIT')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described.releaseDate).to.eq('2018-03-06')
  })

  it('handles data with source location', () => {
    const { coordinates, harvested } = setupPypi('2018-03-06T11:38:10.284Z', null, true)
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.sourceLocation.url).to.eq(getSourceUrl())
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupPypi()
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })
})

function setupPypi(releaseDate, license, sourceInfo) {
  const coordinates = EntityCoordinates.fromString('pypi/pypi/-/test/1.0')
  const harvested = {}
  setIfValue(harvested, 'releaseDate', releaseDate)
  setIfValue(harvested, 'declaredLicense', license)
  if (sourceInfo) harvested.sourceInfo = createSourceLocation()
  return { coordinates, harvested }
}

describe('ClearlyDefined CocoaPod summarizer', () => {
  it('handles with all the data', () => {
    const { coordinates, harvested } = setupCocoaPod('MIT', '2018-03-06T11:38:10.284Z', 'https://clearlydefined.com')
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
    expect(summary.described.releaseDate).to.eq('2018-03-06')
    expect(summary.described.projectWebsite).to.eq('https://clearlydefined.com')
  })

  it('handles license type', () => {
    const { coordinates, harvested } = setupCocoaPod({ type: 'MIT' })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('MIT')
  })

  it('Sets noassertion for license', () => {
    const { coordinates, harvested } = setupCocoaPod({ type: 'Commercial' })
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed.declared).to.eq('NOASSERTION')
  })

  it('handles no data', () => {
    const { coordinates, harvested } = setupCocoaPod()
    const summary = Summarizer().summarize(coordinates, harvested)
    validate(summary)
    expect(summary.licensed).to.be.undefined
    expect(summary.described).to.be.undefined
  })
})

function setupCocoaPod(license, releaseDate, homepage) {
  const coordinates = EntityCoordinates.fromString('pod/cocoapods/-/test/1.0.0')
  const harvested = {}
  setIfValue(harvested, 'registryData.license', license)
  setIfValue(harvested, 'releaseDate', releaseDate)
  setIfValue(harvested, 'registryData.homepage', homepage)
  return { coordinates, harvested }
}

function validate(definition) {
  // Tack on a dummy coordinates to keep the schema happy. Tool summarizations do not have to include coordinates
  if (!definition.coordinates)
    definition.coordinates = { type: 'npm', provider: 'npmjs', namespace: null, name: 'foo', revision: '1.0' }
  if (!validator.validate('definition', definition)) throw new Error(validator.errorsText())
}

function createSourceLocation() {
  return { type: 'git', provider: 'github', namespace: 'clearlydefined', name: 'test', revision: '42' }
}

function getSourceUrl() {
  return 'https://github.com/clearlydefined/test/tree/42'
}
