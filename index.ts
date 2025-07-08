import type CatalogPlugin from '@data-fair/types-catalogs'
import { importConfigSchema, configSchema, assertConfigValid, type DCATConfig } from '#types'
import { type DCATCapabilities, capabilities } from './lib/capabilities.ts'

// Since the plugin is very frequently imported, each function is imported on demand,
// instead of loading the entire plugin.
// This file should not contain any code, but only constants and dynamic imports of functions.

const plugin: CatalogPlugin<DCATConfig, DCATCapabilities> = {
  async prepare (context) {
    // DCAT catalog doesn't need any preparation
    // This function is called when the catalog configuration is saved
    // We could validate the DCAT URL here if needed
    return {}
  },

  async list (context) {
    const { list } = await import('./lib/imports.ts')
    return list(context)
  },

  async getResource (context) {
    const { getResource } = await import('./lib/imports.ts')
    return getResource(context)
  },

  metadata: {
    title: 'Catalog DCAT',
    description: 'Importez des jeux de données depuis un catalogue DCAT.',
    capabilities
  },

  importConfigSchema,
  configSchema,
  assertConfigValid
}

export default plugin
