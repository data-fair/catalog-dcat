import jsonld from 'jsonld'
import context from './context.ts'

// Frame simplifié pour extraire seulement les datasets et leurs informations essentielles
const frame = {
  '@context': context,
  '@type': 'Catalog',
  dataset: {
    '@type': 'Dataset',
    distribution: {
      '@type': 'Distribution'
    }
  }
}

// Ensure that the properties are arrays if they are not already
const ensureArrays = (obj: any, keys: string[]) => {
  for (const key of keys) {
    if (obj[key] && !Array.isArray(obj[key])) {
      obj[key] = [obj[key]]
    }
  }
}

export default async (dcat: any) => {
  dcat = await jsonld.frame(dcat, frame)
  dcat = await jsonld.compact(dcat, context)

  ensureArrays(dcat, ['dataset'])
  for (const dataset of dcat.dataset || []) {
    ensureArrays(dataset, ['distribution', 'keyword'])
  }

  return dcat
}
