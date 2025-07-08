import type { Capability } from '@data-fair/types-catalogs'
/**
 * The list of capabilities of the plugin.
 * These capabilities define the actions that can be performed with the plugin.
 * The capabilities must satisfy the `Capability` type.
 */
export const capabilities = [
  'import',
  'search',
  'importConfig'
] as const satisfies Capability[]

export type DCATCapabilities = typeof capabilities
export default capabilities
