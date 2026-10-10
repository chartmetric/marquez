import { Job } from '../types/api'
import { LineageJob, LineageNode } from '../types/lineage'

/** Parse a lineage graph depth while preserving zero as a valid direct-only depth. */
export const parseLineageDepth = (value: string | null, fallback: number): number => {
  if (value === null || value.trim() === '') {
    return fallback
  }

  const depth = Number(value)
  return Number.isInteger(depth) && depth >= 0 ? depth : fallback
}

export type LineageJobRole = 'DAG' | 'TASK' | 'OBSERVER' | 'JOB'
export type JobsListRole = LineageJobRole | 'VALIDATION'
export type DatasetRelationship = 'READ' | 'WRITE' | 'READ + WRITE'

export interface ColumnChangePreview {
  sourceDataset: string
  sourceField: string
  targetDataset: string
  targetField: string
}

interface ColumnLineageFacet {
  fields?: Record<
    string,
    {
      inputFields?: Array<{ namespace?: string; name?: string; field?: string }>
    }
  >
}

export const COLUMN_CHANGE_PREVIEW_LIMIT = 5

/**
 * Keep the physical OpenLineage identifier intact while presenting the shared
 * Chartmetric ClickHouse/Snowflake database aliases consistently.
 */
export const getDatasetDisplayName = (name: string): string => {
  const withoutSharedCatalog = name.replace(/^chartmetric\.(analytics|raw_data)\./i, '$1.')
  return withoutSharedCatalog
    .replace(/^chartmetric_analytics\./i, 'analytics.')
    .replace(/^chartmetric_raw_data\./i, 'raw_data.')
    .replace(/^(analytics|raw_data)\./i, (prefix) => prefix.toLowerCase())
}

/** Render a datasource URI as a stable platform label plus a compact instance name. */
export const getNamespaceDisplayName = (namespace: string): string => {
  const separator = namespace.indexOf('://')
  if (separator === -1) return namespace
  const platform = namespace.slice(0, separator)
  const instance = namespace.slice(separator + 3).split('.')[0]
  return `${platform.toUpperCase()} · ${instance}`
}

export const getDatasetPlatformLabel = (namespace: string): string => {
  if (/^postgres:/i.test(namespace)) return 'PG'
  if (/^snowflake:/i.test(namespace)) return 'SF'
  if (/^clickhouse:/i.test(namespace)) return 'CH'
  return 'DATASET'
}

export const summarizeColumnChanges = (changes: ColumnChangePreview[]) => ({
  visible: changes.slice(0, COLUMN_CHANGE_PREVIEW_LIMIT),
  remaining: Math.max(0, changes.length - COLUMN_CHANGE_PREVIEW_LIMIT),
})

/** Convert a stored OpenLineage output-dataset facet into graph display mappings. */
export const columnChangesFromFacets = (
  facets: object | undefined,
  targetDataset: string
): ColumnChangePreview[] => {
  const columnLineage = (facets as { columnLineage?: ColumnLineageFacet } | undefined)
    ?.columnLineage
  if (!columnLineage?.fields) return []

  return Object.entries(columnLineage.fields).flatMap(([targetField, lineage]) =>
    (lineage.inputFields || []).flatMap((input) =>
      input.name && input.field
        ? [
            {
              sourceDataset: input.name,
              sourceField: input.field,
              targetDataset,
              targetField,
            },
          ]
        : []
    )
  )
}

/**
 * Return the Airflow-oriented role that can be established from Marquez job metadata.
 * Keep JOB as the safe fallback so non-Airflow jobs are not mislabeled as DAGs.
 */
export const getLineageJobRole = (job: LineageJob): LineageJobRole => {
  const simpleName = job.simpleName || job.name.split('.').pop() || job.name

  if (/^ObserveIngestionActivity(?:$|[._-])/i.test(simpleName)) {
    return 'OBSERVER'
  }
  if (job.parentJobName || job.parentJobUuid) {
    return 'TASK'
  }
  if (!job.name.includes('.') && job.inputs.length === 0 && job.outputs.length === 0) {
    return 'DAG'
  }
  return 'JOB'
}

/** Classify Airflow-oriented rows in the paginated Jobs list without hiding generic jobs. */
export const getJobsListRole = (job: Job): JobsListRole => {
  const simpleName = job.name.split('.').pop() || job.name

  if (/^ObserveIngestionActivity(?:$|[._-])/i.test(simpleName)) return 'OBSERVER'
  if (/^(?:CheckFreshness|HealthCheck)/i.test(simpleName)) return 'VALIDATION'
  if (job.parentJobName || job.parentJobUuid) return 'TASK'
  if (!job.name.includes('.') && job.inputs.length === 0 && job.outputs.length === 0) return 'DAG'
  return 'JOB'
}

/**
 * Describe a dataset only relative to the currently selected job. Graph-wide labels
 * would be ambiguous when expanded lineage contains several jobs using the same table.
 */
export const getDatasetRelationship = (
  datasetNode: LineageNode,
  selectedJobId: string
): DatasetRelationship | undefined => {
  const isRead = datasetNode.outEdges.some((edge) => edge.destination === selectedJobId)
  const isWritten = datasetNode.inEdges.some((edge) => edge.origin === selectedJobId)

  if (isRead && isWritten) return 'READ + WRITE'
  if (isRead) return 'READ'
  if (isWritten) return 'WRITE'
  return undefined
}

export const getEmptyLineageMessage = (role: LineageJobRole): string => {
  if (role === 'DAG') {
    return 'This DAG parent has no direct dataset lineage. Select one of its TASK jobs to inspect data flow.'
  }
  if (role === 'OBSERVER') {
    return 'This OBSERVER reports ingestion health and has no direct dataset lineage.'
  }
  return 'No direct dataset lineage has been reported for this job.'
}

/**
 * Parse a local UX-preview value such as
 * `spotify_album.popularity>cm_album.spotify_popularity`.
 * This is deliberately not a production lineage source; the real UI must use facets.
 */
export const parseColumnChangePreview = (value: string | null): ColumnChangePreview[] => {
  if (!value) return []

  return value.split(',').flatMap((mapping) => {
    const [source, target] = mapping.split('>')
    const sourceSeparator = source?.lastIndexOf('.') ?? -1
    const targetSeparator = target?.lastIndexOf('.') ?? -1
    if (sourceSeparator <= 0 || targetSeparator <= 0) return []

    return [
      {
        sourceDataset: source.slice(0, sourceSeparator),
        sourceField: source.slice(sourceSeparator + 1),
        targetDataset: target.slice(0, targetSeparator),
        targetField: target.slice(targetSeparator + 1),
      },
    ]
  })
}
