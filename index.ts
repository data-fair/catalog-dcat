import type { CatalogPlugin, CatalogMetadata, CatalogDataset } from '@data-fair/lib-common-types/catalog.js'

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
    count: res.total_count,
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
  icon: 'M6,22A3,3 0 0,1 3,19C3,18.4 3.18,17.84 3.5,17.37L9,7.81V6A1,1 0 0,1 8,5V4A2,2 0 0,1 10,2H14A2,2 0 0,1 16,4V5A1,1 0 0,1 15,6V7.81L20.5,17.37C20.82,17.84 21,18.4 21,19A3,3 0 0,1 18,22H6M5,19A1,1 0 0,0 6,20H18A1,1 0 0,0 19,19C19,18.79 18.93,18.59 18.82,18.43L16.53,14.47L14,17L8.93,11.93L5.18,18.43C5.07,18.59 5,18.79 5,19M13,10A1,1 0 0,0 12,11A1,1 0 0,0 13,12A1,1 0 0,0 14,11A1,1 0 0,0 13,10Z',
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
