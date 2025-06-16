import type { CatalogPlugin, CatalogMetadata, CatalogDataset } from '@data-fair/lib-common-types/catalog/index.js'

import { schema as configSchema, assertValid as assertConfigValid, type DCATConfig } from './types/config/index.ts'
import axios from '@data-fair/lib-node/axios.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

// API Doc: https://data.economie.gouv.fr/api/explore/v2.1/console

const prepareDataset = (catalogConfig: DCATConfig, dataset: any): CatalogDataset => {
  // Extract basic metadata
  const id = dataset.id || dataset.identifier || ''
  const title = dataset.title || ''
  const description = dataset.description || ''

  // Handle distributions/resources
  const resources = Array.isArray(dataset.distribution)
    ? dataset.distribution.map((dist: any) => ({
      id: dist.id || dist.identifier || '',
      title: dist.title || '',
      format: dist.format || '',
      url: dist.downloadURL || ''
    }))
    : []

  // Handle keywords/tags
  const keywords = Array.isArray(dataset.keyword)
    ? dataset.keyword
    : (typeof dataset.keyword === 'string' ? dataset.keyword.split(',').map((k: string) => k.trim()) : [])

  return {
    id,
    title,
    description,
    keywords,
    resources,
  }
}

const listDatasets = async (catalogConfig: DCATConfig) => {
  let res
  try {
    res = (await axios.get(catalogConfig.url)).data
  } catch (e) {
    throw httpError(500, `Error fetching datasets from DCAT: ${e}`)
  }
  const datasets: CatalogDataset[] = res.dataset.map((dataset: any) => prepareDataset(catalogConfig, dataset))

  return {
    count: datasets.length,
    results: datasets
  }
}

const getDataset = async (catalogConfig: DCATConfig, datasetId: string) => {
  return (await listDatasets(catalogConfig)).results.find(d => d.id === datasetId)
}

const capabilities = ['listDatasets' as const]

const metadata: CatalogMetadata<typeof capabilities> = {
  title: 'Catalog DCAT',
  description: 'Importez des jeux de données depuis un catalogue DCAT.',
  capabilities
}

const plugin: CatalogPlugin<DCATConfig, typeof capabilities> = {
  listDatasets,
  getDataset,
  configSchema,
  assertConfigValid,
  metadata
}
export default plugin
