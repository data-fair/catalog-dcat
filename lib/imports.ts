import type { CatalogPlugin, ListContext, Resource, GetResourceContext } from '@data-fair/types-catalogs'
import type { DCATCapabilities } from './capabilities.ts'
import type { DCATConfig, CatalogDCAT } from '#types'

import axios from '@data-fair/lib-node/axios.js'
import normalize from './normalize.ts'
import memoize from 'memoizee'

const memoizedDCAT = memoize(async (catalogUrl) => {
  const dcatFetch = (await axios.get(catalogUrl)).data
  if (typeof dcatFetch !== 'object') throw new Error('DCAT should return JSON JSON-LD')
  if (!dcatFetch['@context']) throw new Error('DCAT should return JSON-LD with a @context property.')
  if (dcatFetch['@type'] !== 'dcat:Catalog' && dcatFetch['@type'] !== 'Catalog') throw new Error('wrong @type in JSON-LD root.')

  return normalize(dcatFetch)
}, {
  profileName: 'fetchDCAT',
  promise: true,
  primitive: true,
  max: 1000,
  maxAge: 1000 * 60 * 10 // 10 minute
})

type ResourceList = Pick<
    Resource,
    'id' | 'title' | 'description' | 'format' | 'mimeType' | 'origin' | 'size'
  > & {
    type: 'resource'
  }

export const list = async ({ catalogConfig, params }: ListContext<DCATConfig, DCATCapabilities>): ReturnType<CatalogPlugin['list']> => {
  const dcat: CatalogDCAT = await memoizedDCAT(catalogConfig.url)

  const response: Awaited<ReturnType<CatalogPlugin['list']>> = {
    count: 0,
    results: [],
    path: []
  }

  if (params.currentFolderId) {
    // Get the specific dataset
    const dataset = dcat.dataset.find((ds: any) => ds.identifier === params.currentFolderId)
    if (!dataset) throw new Error(`Dataset with identifier ${params.currentFolderId} not found`)
    if (!dataset.distribution || dataset.distribution.length === 0) {
      throw new Error(`No distributions found for dataset with identifier ${params.currentFolderId}`)
    }

    // Convert dataset resources to ResourceList format
    let distributions = dataset.distribution.map((dcatResource: any) => {
      // Generate unique ID by concatenating dataset ID, distribution ID and format
      const uniqueId = `${dataset.identifier}_${dcatResource.identifier}_${(dcatResource.format || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}`

      return {
        id: uniqueId,
        title: dcatResource.title,
        type: 'resource' as const,
        description: dcatResource.description || dataset.description,
        format: dcatResource.format || 'unknown',
        mimeType: dcatResource.mediaType,
        size: dcatResource.byteSize,
        origin: dataset.landingPage || catalogConfig.url
      } as ResourceList
    })

    response.count = distributions.length
    if (params.q) {
      const searchQuery = params.q.toLowerCase()
      distributions = distributions.filter((resource: ResourceList) =>
        resource.title?.toLowerCase().includes(searchQuery) ||
        resource.description?.toLowerCase().includes(searchQuery)
      )
    }
    response.results = distributions

    // Build the path with the dataset folder
    response.path = [{
      id: dataset.identifier,
      title: dataset.title,
      type: 'folder'
    }]
  } else {
    // Map all datasets
    let datasets = dcat.dataset.map((dataset: any) => ({
      id: dataset.identifier,
      title: dataset.title,
      type: 'folder' as const
    }))

    response.count = datasets.length
    if (params.q) {
      const searchQuery = params.q.toLowerCase()
      datasets = datasets.filter((dataset: any) =>
        dataset.title?.toLowerCase().includes(searchQuery)
      )
    }

    response.results = datasets
  }
  return response
}

export const getResource = async ({ catalogConfig, resourceId, importConfig, tmpDir, log }: GetResourceContext<DCATConfig>): ReturnType<CatalogPlugin['getResource']> => {
  const dcat: CatalogDCAT = await memoizedDCAT(catalogConfig.url)

  await log.step('Downloading resource file')
  await log.info(`Get resource with identifier ${resourceId}`)

  // Extract dataset ID from the unique resource ID (format: datasetId_distributionId_format)
  const resourceIdParts = resourceId.split('_')
  if (resourceIdParts.length < 3) {
    throw new Error(`Invalid resource ID format: ${resourceId}`)
  }

  // Find the dataset by ID
  const datasetId = resourceIdParts[0]
  const dataset = dcat.dataset.find((ds: any) => ds.identifier === datasetId)
  if (!dataset) {
    throw new Error(`Dataset with identifier ${datasetId} not found`)
  }

  // Find the distribution within the dataset
  const distribution = dataset.distribution?.find((dist: any) => {
    // Generate the same unique ID format as in the list function
    const uniqueId = `${dataset.identifier}_${dist.identifier}_${(dist.format || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}`
    return uniqueId === resourceId
  })

  if (!dataset || !distribution) {
    throw new Error(`Resource with identifier ${resourceId} not found`)
  }
  await log.info(`Found resource in dataset: ${dataset.title}`, { datasetId: dataset.identifier, distributionId: distribution.identifier })

  if (!distribution.downloadURL && !distribution.accessURL) {
    throw new Error(`Download URL missing for resource ${resourceId}`)
  }

  // Use downloadURL if available, otherwise use accessURL
  const downloadUrl = distribution.downloadURL || distribution.accessURL
  if (!downloadUrl) {
    throw new Error(`No valid download URL found for resource ${resourceId}`)
  }
  await log.info(`Using download URL: ${downloadUrl}`)

  // Download the resource
  const fs = await import('node:fs')
  const path = await import('node:path')

  const response = await axios.get(downloadUrl, { responseType: 'stream' })

  // Determine file extension from URL, format or Content-Type
  const urlPath = new URL(downloadUrl).pathname
  let extension = path.extname(urlPath) || '.dat'

  if (!extension || extension === '.dat') {
    // Try to use DCAT format
    if (distribution.format) {
      const format = distribution.format.toLowerCase()
      if (format.includes('csv')) extension = '.csv'
      else if (format.includes('json')) extension = '.json'
      else if (format.includes('xml')) extension = '.xml'
      else if (format.includes('excel') || format.includes('xlsx')) extension = '.xlsx'
      else if (format.includes('zip')) extension = '.zip'
      else if (format.includes('pdf')) extension = '.pdf'
    }

    // Otherwise use Content-Type
    if (extension === '.dat') {
      const contentType = response.headers['content-type']
      if (contentType?.includes('json')) extension = '.json'
      else if (contentType?.includes('csv')) extension = '.csv'
      else if (contentType?.includes('xml')) extension = '.xml'
      else if (contentType?.includes('excel')) extension = '.xlsx'
      else if (contentType?.includes('zip')) extension = '.zip'
      else if (contentType?.includes('pdf')) extension = '.pdf'
    }
  }

  await log.info(`File extension determined: ${extension}`)

  // Create a filename
  const resourceTitle = distribution.title?.replace(/[^a-zA-Z0-9]/g, '_') || dataset.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'resource'
  const fileName = `${resourceTitle}${extension}`
  const filePath = path.join(tmpDir, fileName)

  await log.info(`Downloading resource to ${fileName}`)
  await log.warning('This task can take a while, please be patient')

  // Create write stream
  const writeStream = fs.createWriteStream(filePath)
  response.data.pipe(writeStream)

  // Return a promise that resolves with the file path
  await new Promise((resolve, reject) => {
    writeStream.on('finish', () => resolve(filePath))
    writeStream.on('error', (error) => reject(error))
  })

  await log.info(`Resource ${distribution.title} downloaded successfully !`)

  const title = importConfig.useDatasetTitle ? dataset.title : (distribution.title || dataset.title)
  const description = importConfig.useDatasetDescription ? dataset.description : (distribution.description || dataset.description)
  // Build the Resource return object
  const resource: Resource = {
    id: resourceId,
    title,
    description,
    filePath,
    format: distribution.format || 'unknown',
    mimeType: distribution.mediaType,
    origin: dataset.landingPage || catalogConfig.url,
    size: distribution.byteSize,
    license: dataset.license
      ? {
          title: typeof dataset.license === 'string' ? dataset.license : dataset.license.title || 'License',
          href: typeof dataset.license === 'string' ? dataset.license : (dataset.license.identifier || dataset.license.href || '')
        }
      : undefined,
    keywords: dataset.keyword
  }
  console.log('Resource object created:', resource)

  return resource
}
