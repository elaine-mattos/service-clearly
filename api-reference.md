# ClearlyDefined Service API Reference

This document provides a comprehensive overview of the ClearlyDefined service API endpoints, with examples of how to call them using curl, explanations of what they do, and references to the relevant code.

## Table of Contents

- 1. Definition Endpoints
- 2. Origin Endpoints
- 3. Curation Endpoints
- 4. Harvest Endpoints
- 5. Webhook Endpoints
- 6. Authentication Endpoints
- 7. Status Endpoint

## 1. Definition Endpoints

These endpoints handle getting, finding, and storing software component definitions.

### Get a Single Definition

```bash
curl -X GET "http://localhost:4000/definitions/npm/npmjs/-/lodash/4.17.21"
```

**Purpose:** Retrieves a complete definition for a specific component including license, attribution, and metadata. If the component doesn't exist, it will be queued for harvesting.

**Code:** [`getDefinition`](routes/definitions.js) in [`routes/definitions.js`](routes/definitions.js)

### Search Definitions

```bash
curl -X GET "http://localhost:4000/definitions?type=npm&name=lodash"
```

**Purpose:** Searches for definitions matching specified criteria.

**Code:** [`getDefinitions`](routes/definitions.js) in [`routes/definitions.js`](routes/definitions.js)

### Batch Get Definitions

```bash
curl -X POST "http://localhost:4000/definitions" \
  -H "Content-Type: application/json" \
  -d '["npm/npmjs/-/lodash/4.17.21", "npm/npmjs/-/express/4.17.1"]'
```

**Purpose:** Retrieves multiple definitions in one request (more efficient than multiple GET requests). This also triggers the harvesting process if the component doesn't exist (in the files and consequently in the DB, if configured.)

**Code:** [`listDefinitions`](routes/definitions.js) in [`routes/definitions.js`](routes/definitions.js)

### Preview definition

Examples on how to preview different ways to curate a component's metadata:

- Declared license:

```bash
curl -X POST "http://localhost:4000/definitions/npm/npmjs/-/lodash/4.17.21?preview=true" \
  -H "Content-Type: application/json" \
  -d '{
    "licensed": {
      "declared": "MIT"
    }
  }'
```

or

```bash
curl -X POST "http://localhost:4000/definitions/npm/npmjs/-/lodash/4.17.21?preview=true" \
  -H "Content-Type: application/json" \
  -d '{
    "licensed": {
      "declared": "Apache-2.0"
    }
  }'
```

- Add or update project website and issue tracker:

```bash
curl -X POST "http://localhost:4000/definitions/npm/npmjs/-/lodash/4.17.21?preview=true" \
  -H "Content-Type: application/json" \
  -d '{
    "described": {
      "projectWebsite": "https://lodash.com",
      "issueTracker": "https://github.com/lodash/lodash/issues"
    }
  }'
```

- Add file-level license and attributions

```bash
curl -X POST "http://localhost:4000/definitions/npm/npmjs/-/lodash/4.17.21?preview=true" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "path": "LICENSE",
        "license": "MIT",
        "attributions": ["Copyright (c) 2024 Lodash Authors"]
      }
    ]
  }'
```

- Combine multiple curation fields:

```bash
curl -X POST "http://localhost:4000/definitions/npm/npmjs/-/lodash/4.17.21?preview=true" \
  -H "Content-Type: application/json" \
  -d '{
    "licensed": {
      "declared": "BSD-3-Clause"
    },
    "described": {
      "projectWebsite": "https://lodash.com"
    },
    "files": [
      {
        "path": "README.md",
        "license": "BSD-3-Clause"
      }
    ]
  }'
```

For more info, check the [`schemas/curation-1.0.json`](schemas/curation-1.0.json) file.

**Purpose:** Previews the result of applying a curation (patch) to a component definition, without actually saving it.

**Code:** check the nameless function in [`routes/definitions.js`](routes/definitions.js) between lines 95 and 105

## 2. Origin Endpoints

These endpoints provide access to package metadata from their original registries.

### NPM Registry

```bash
# Get versions of packages
curl -X GET "http://localhost:4000/origins/npm/lodash/revisions"

curl -X GET "http://localhost:4000/origins/maven/org.apache.commons/commons-lang3/revisions"

curl -X GET "http://localhost:4000/origins/go/github.com%2Fgorilla/mux/revisions"



# Search for npm packages
curl -X GET "http://localhost:4000/origins/npm/lodash"

curl -X GET "http://localhost:4000/origins/maven/org.apache.commons/commons-lang3"


# TODO: scoped packages not working
curl -X GET "http://localhost:4000/origins/npm/gitbeaker/cli/revisions"

curl -X GET "http://localhost:4000/origins/maven/org.apache.commons/commons-lang3/revisions"

```

**Purpose:** Retrieves version information and search results from the NPM registry.

**Code:** [`routes/originNpm.js`](routes/originNpm.js)

### GitHub Repository

```bash
# Get tags of a repository
curl -X GET "http://localhost:4000/origins/github/clearlydefined/service/revisions"

# Search for repositories
curl -X GET "http://localhost:4000/origins/github/clearlydefined/service"
```

**Purpose:** Retrieves tag information and search results from GitHub repositories.

**Code:** [`routes/originGitHub.js`](routes/originGitHub.js)

### Maven Repository

```bash
# Get versions of a Maven artifact
curl -X GET "http://localhost:4000/origins/maven/org.apache.commons/commons-lang3/revisions"

# Search for Maven artifacts
curl -X GET "http://localhost:4000/origins/maven/org.apache.commons/commons-lang3"
```

**Purpose:** Retrieves version information and search results from Maven Central.

**Code:** [`routes/originMaven.js`](routes/originMaven.js)

### PyPI Repository

```bash
# Get versions of a PyPI package
curl -X GET "http://localhost:4000/origins/pypi/requests/revisions"

# Search for PyPI packages
curl -X GET "http://localhost:4000/origins/pypi/requests"
```

**Purpose:** Retrieves version information and search results from the Python Package Index.

**Code:** [`routes/originPyPi.js`](routes/originPyPi.js)

### NuGet Repository

```bash
# Get versions of a NuGet package
curl -X GET "http://localhost:4000/origins/nuget/newtonsoft.json/revisions"

# Search for NuGet packages
curl -X GET "http://localhost:4000/origins/nuget/newtonsoft.json"
```

**Purpose:** Retrieves version information and search results from the NuGet Gallery.

**Code:** [`routes/originNuget.js`](routes/originNuget.js)

### Other Package Managers

Similar endpoints exist for:

- RubyGems: `/origins/rubygems/{name}/revisions`
- Composer: `/origins/composer/{vendor}/{name}/revisions`
- Crates.io: `/origins/crate/{name}/revisions`
- Go: `/origins/go/{namespace}/{name}/revisions`
- Debian: `/origins/deb/{name}/revisions`
- Conda: `/origins/conda/{channel}/{platform}/{name}/revisions`
- CocoaPods: `/origins/pod/{name}/revisions`

## 3. Curation Endpoints

These endpoints manage human corrections to harvested data.

---

### Get a proposed patch for a specific revision of a component in a PR

```bash
curl -X GET "http://localhost:4000/curations/npm/npmjs/-/lodash/4.17.21/pr/123"
```

**Purpose:** Retrieves the proposed curation patch for a specific component revision in a given PR.

**Code:** [`getChangesForCoordinatesInPr`](routes/curations.js)

---

### Get data needed by review UI for a PR

```bash
curl -X GET "http://localhost:4000/curations/pr/123"
```

**Purpose:** Retrieves the curation review URL and changed definitions for a PR.

**Code:** [`getPr`](routes/curations.js)

---

### Get an existing patch for a specific revision of a component

```bash
curl -X GET "http://localhost:4000/curations/npm/npmjs/-/lodash/4.17.21"
```

**Purpose:** Retrieves the curation patch for a specific component revision.

**Code:** [`getCurationForCoordinates`](routes/curations.js)

---

### Search for any patches related to the given path

```bash
curl -X GET "http://localhost:4000/curations/npm/npmjs/-/lodash"
```

**Purpose:** Retrieves all curations for a specific component (or partial coordinates).

**Code:** [`listCurations`](routes/curations.js)

---

### Batch get curations for a list of components

```bash
curl -X POST "http://localhost:4000/curations" \
  -H "Content-Type: application/json" \
  -d '["npm/npmjs/-/lodash/4.17.21", "npm/npmjs/-/express/4.17.1"]'
```

**Purpose:** Retrieves curations for a list of coordinates.

**Code:** [`listAllCurations`](routes/curations.js)

---

### Submit a curation PR

```bash
curl -X PATCH "http://localhost:4000/curations" \
  -H "Content-Type: application/json" \
  -d '{
    "contributionInfo": {
      "summary": "Fix license for lodash",
      "details": "Correcting the license metadata",
      "resolution": "curated"
    },
    "patches": [{
      "coordinates": {
        "type": "npm",
        "provider": "npmjs",
        "name": "lodash",
        "revision": "4.17.21"
      },
      "revisions": {
        "4.17.21": {
          "licensed": {
            "declared": "MIT"
          }
        }
      }
    }]
  }'
```

**Purpose:** Creates a pull request to the curation repository with suggested changes to component metadata.

**Code:** [`updateCurations`](routes/curations.js)

---

### Sync all contributions (admin only)

```bash
curl -X POST "http://localhost:4000/curations/sync"
```

**Purpose:** Syncs all curation contributions from GitHub (requires curate permissions).

**Code:** [`syncAllContributions`](routes/curations.js)

---

### Reprocess merged curations (admin only)

```bash
curl -X POST "http://localhost:4000/curations/reprocess" \
  -H "Content-Type: application/json" \
  -d '["npm/npmjs/-/lodash/4.17.21"]'
```

**Purpose:** Reprocesses merged curations for a list of coordinates (requires curate permissions).

**Code:** [`reprocessMergedCurations`](routes/curations.js)

---

**Note:**

- All endpoints are defined in [`routes/curations.js`](routes/curations.js).
- Some endpoints require authentication and/or special permissions.

## 4. Harvest Endpoints

These endpoints trigger and retrieve harvested data.

### Queue Harvesting

```bash
curl -X POST "http://localhost:4000/harvest" \
  -H "Content-Type: application/json" \
  -d '[{
    "tool": "scancode",
    "coordinates": {
      "type": "npm",
      "provider": "npmjs",
      "name": "lodash",
      "revision": "4.17.21"
    }
  }]'
```

**Purpose:** Queues a component to be harvested by specified tools.

**Code:** [`queue`](routes/harvest.js) in [`routes/harvest.js`](routes/harvest.js)

### Get Harvest Status

```bash
curl -X GET "http://localhost:4000/harvest/npm/npmjs/-/lodash/4.17.21"
```

**Purpose:** Retrieves the harvesting status or results for a component.

**Code:** [`get`](routes/harvest.js) in [`routes/harvest.js`](routes/harvest.js)

### List Available Harvested Data

```bash
curl -X GET "http://localhost:4000/harvest/npm/npmjs/-/lodash/4.17.21?form=list"
```

**Purpose:** Lists available harvested data for a component.

**Code:** [`list`](routes/harvest.js) in [`routes/harvest.js`](routes/harvest.js)

## 5. Webhook Endpoints

### Crawler Webhook

```bash
curl -X POST "http://localhost:4000/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Crawler: secret" \
  -d '{
    "_metadata": {
      "links": {
        "self": {
          "href": "urn:npm:npmjs:-:lodash:revision:4.17.21"
        }
      }
    }
  }'
```

**Purpose:** Endpoint for the crawler to notify the service of completed harvests.

**Code:** [`handleCrawlerCall`](routes/webhook.js) in [`routes/webhook.js`](routes/webhook.js)

### GitHub Webhook

```bash
curl -X POST "http://localhost:4000/webhook" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature: sha1=..." \
  -d '{"action": "closed", "pull_request": {"merged": true, "number": 123}}'
```

**Purpose:** Endpoint for GitHub to notify the service of PR activity in the curation repository.

**Code:** [`handleGitHubCall`](routes/webhook.js) in [`routes/webhook.js`](routes/webhook.js)

## 6. Authentication Endpoints

```bash
# Start GitHub auth flow (opens browser)
curl -X GET "http://localhost:4000/auth/github"
```

**Purpose:** Initiates OAuth flow with GitHub for authentication.

**Code:** [`routes/auth.js`](routes/auth.js)

## 7. Status Endpoint

```bash
curl -X GET "http://localhost:4000/"
```

**Purpose:** Simple status endpoint that returns service health and version.

**Code:** Root route in [`routes/index.js`](routes/index.js)

---

## Coordinates Format

Most endpoints use a consistent coordinate system to identify components:

- Format: `{type}/{provider}/{namespace}/{name}/{revision}`
- Examples:
  - npm: `npm/npmjs/-/lodash/4.17.21`
  - npm scoped: `npm/npmjs/gitbeaker/cli/39.0.0`
  - GitHub: `git/github/clearlydefined/service/v1.0.0`
  - Maven: `maven/mavencentral/org.apache.commons/commons-lang3/3.12.0`

**Code:** [`lib/entityCoordinates.js`](lib/entityCoordinates.js)

## Authentication

Some endpoints require authentication via GitHub OAuth. The service expects configuration like `CURATION_GITHUB_TOKEN` for curation operations.

**Code:** [`bin/config.js`](bin/config.js)
