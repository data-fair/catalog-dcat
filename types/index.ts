export { schema as configSchema, assertValid as assertConfigValid, type DCATConfig } from './catalogConfig/index.ts'
export { schema as importConfigSchema } from './importConfig/index.ts'

export type CatalogDCAT = {
  dataset: {
    identifier: string
    title: string
    description?: string
    distribution?: {
      identifier: string
      title: string
      description?: string
      format?: string
      mediaType?: string
      byteSize?: number
      downloadURL?: string
      accessURL?: string
    }[]
    keyword?: string[]
    license?: string | { title?: string; identifier?: string; href?: string }
    landingPage?: string
  }[]
}
