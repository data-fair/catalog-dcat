import type CatalogPlugin from '@data-fair/types-catalogs'
import { strict as assert } from 'node:assert'
import { it, describe, before, beforeEach } from 'node:test'
import fs from 'fs-extra'
import { logFunctions } from './test-utils.ts'

// Import plugin and use default type like it's done in Catalogs
import plugin from '../index.ts'
const catalogPlugin: CatalogPlugin = plugin as unknown as CatalogPlugin

/** DCAT catalog configuration for testing purposes. */
const catalogConfig = {
  url: 'https://opendata.koumoul.com/data-fair/api/v1/catalog/dcat'
}

/** DCAT secrets for testing purposes (no authentication needed for DCAT). */
const secrets = {}

describe('catalog-dcat', () => {
  it('should list datasets as folders from root', async () => {
    const res = await catalogPlugin.list({
      catalogConfig,
      secrets,
      params: {}
    })

    assert.ok(res.count >= 0, 'Expected 0 or more datasets in the root folder')
    assert.ok(res.results.length >= 0)
    if (res.results.length > 0) {
      assert.equal(res.results[0].type, 'folder', 'Expected folders (datasets) in the root folder')
    }

    assert.equal(res.path.length, 0, 'Expected no path for root folder')
  })

  it('should list resources from a dataset (folder)', async () => {
    // First get a dataset to test with
    const rootRes = await catalogPlugin.list({
      catalogConfig,
      secrets,
      params: {}
    })

    assert.ok(rootRes.count >= 1, 'Expected 1 or more datasets in the root folder')
    assert.ok(rootRes.results.length >= 1, 'Expected at least one dataset in the results array')

    // List resources in the first dataset
    const datasetId = rootRes.results[0].id
    const res = await catalogPlugin.list({
      catalogConfig,
      secrets,
      params: { currentFolderId: datasetId }
    })

    assert.ok(res.count >= 1, 'Expected 1 or more resources in the dataset')
    assert.ok(res.results.length >= 1)
    assert.equal(res.results[0].type, 'resource', 'Expected resources in the dataset folder')

    assert.equal(res.path.length, 1, 'Expected path to contain the current dataset')
    assert.equal(res.path[0].id, datasetId)
  })

  it('should search datasets with query parameter', async () => {
    const res = await catalogPlugin.list({
      catalogConfig,
      secrets,
      params: { q: 'test' }
    })

    assert.ok(res.count >= 0, 'Expected 0 or more matching datasets')
    if (res.results.length > 0) {
      assert.equal(res.results[0].type, 'folder', 'Expected folders (datasets) in search results')
    }
  })

  it('should search resources within a dataset', async () => {
    // First get a dataset to test with
    const rootRes = await catalogPlugin.list({
      catalogConfig,
      secrets,
      params: {}
    })

    if (rootRes.results.length === 0) {
      console.log('No datasets found, skipping resource search test')
      return
    }

    const datasetId = rootRes.results[0].id
    const res = await catalogPlugin.list({
      catalogConfig,
      secrets,
      params: { currentFolderId: datasetId, q: 'csv' }
    })

    assert.ok(res.count >= 0, 'Expected 0 or more matching resources')
    if (res.results.length > 0) {
      assert.equal(res.results[0].type, 'resource', 'Expected resources in search results')
    }
  })

  describe('should get and download a resource', async () => {
    const tmpDir = './data/test/downloads'

    // Ensure the temporary directory exists once for all tests
    before(async () => await fs.ensureDir(tmpDir))

    // Clear the temporary directory before each test
    beforeEach(async () => await fs.emptyDir(tmpDir))

    it('with correct params', async () => {
      // First get a dataset and its resources
      const rootRes = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: {}
      })

      assert.ok(rootRes.count >= 1, 'Expected 1 or more datasets in the root folder')
      assert.ok(rootRes.results.length >= 1, 'Expected at least one dataset in the results array')

      const datasetId = rootRes.results[0].id
      const datasetTitle = rootRes.results[0].title
      const resourcesRes = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: { currentFolderId: datasetId }
      })

      assert.ok(resourcesRes.count >= 1, 'Expected 1 or more resources in the dataset')

      const resourceId = resourcesRes.results[0].id
      const resourceTitle = resourcesRes.results[0].title
      const resource = await catalogPlugin.getResource({
        catalogConfig,
        secrets,
        resourceId,
        importConfig: {
          useDatasetTitle: false,
          useDatasetDescription: false
        },
        tmpDir,
        log: logFunctions
      })

      assert.ok(resource, 'The resource should exist')
      assert.equal(resource.id, resourceId, 'Resource ID should match')
      assert.ok(resource.title, 'Resource should have a title')
      assert.ok(resource.filePath, 'Download file path should not be undefined')

      // Verify title corresponds to resource title (not dataset title) when useDatasetTitle is false
      assert.equal(resource.title, resourceTitle || datasetTitle, 'Resource title should match the distribution title or fallback to dataset title')

      // Check if the file exists
      const fileExists = await fs.pathExists(resource.filePath)
      assert.ok(fileExists, 'The downloaded file should exist')
    })

    it('with useDatasetTitle and useDatasetDescription enabled', async () => {
      // First get a dataset and its resources
      const rootRes = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: {}
      })

      if (rootRes.results.length === 0) {
        console.log('No datasets found, skipping importConfig test')
        return
      }

      const datasetId = rootRes.results[0].id
      const datasetTitle = rootRes.results[0].title
      const resourcesRes = await catalogPlugin.list({
        catalogConfig,
        secrets,
        params: { currentFolderId: datasetId }
      })

      if (resourcesRes.results.length === 0) {
        console.log('No resources found in dataset, skipping importConfig test')
        return
      }

      const resourceId = resourcesRes.results[0].id
      const resource = await catalogPlugin.getResource({
        catalogConfig,
        secrets,
        resourceId,
        importConfig: {
          useDatasetTitle: true,
          useDatasetDescription: true
        },
        tmpDir,
        log: logFunctions
      })

      assert.ok(resource, 'The resource should exist')
      assert.ok(resource.title, 'Resource should have a title')
      assert.ok(resource.filePath, 'Download file path should not be undefined')

      // Verify title corresponds to dataset title when useDatasetTitle is true
      assert.equal(resource.title, datasetTitle, 'Resource title should match the dataset title when useDatasetTitle is enabled')

      // Check if the file exists
      const fileExists = await fs.pathExists(resource.filePath)
      assert.ok(fileExists, 'The downloaded file should exist')
    })

    it('should fail for resource not found', async () => {
      const resourceId = 'non-existent-dataset_non-existent-resource_unknown'

      await assert.rejects(
        async () => {
          await catalogPlugin.getResource({
            catalogConfig,
            secrets,
            resourceId,
            importConfig: {},
            tmpDir,
            log: logFunctions
          })
        },
        /not found|does not exist/i,
        'Should throw an error for non-existent resource'
      )
    })

    it('should fail for invalid resource ID format', async () => {
      const resourceId = 'invalid-format'

      await assert.rejects(
        async () => {
          await catalogPlugin.getResource({
            catalogConfig,
            secrets,
            resourceId,
            importConfig: {},
            tmpDir,
            log: logFunctions
          })
        },
        /Invalid resource ID format/i,
        'Should throw an error for invalid resource ID format'
      )
    })
  })
})
