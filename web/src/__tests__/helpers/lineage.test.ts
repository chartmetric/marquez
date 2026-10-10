import {
  getDatasetRelationship,
  getDatasetDisplayName,
  getDatasetPlatformLabel,
  getEmptyLineageMessage,
  getLineageJobRole,
  getJobsListRole,
  getNamespaceDisplayName,
  parseColumnChangePreview,
  parseLineageDepth,
  summarizeColumnChanges,
  columnChangesFromFacets,
} from '../../helpers/lineage'
import { LineageJob, LineageNode } from '../../types/lineage'
import { Job } from '../../types/api'
import { lineageJob } from '../__mocks__/LineageJob'

describe('parseLineageDepth', () => {
  it('preserves zero as the direct-lineage depth', () => {
    expect(parseLineageDepth('0', 2)).toBe(0)
  })

  it('uses the requested non-negative integer depth', () => {
    expect(parseLineageDepth('2', 0)).toBe(2)
  })

  it.each([null, '', ' ', '-1', '1.5', 'not-a-number'])(
    'uses the fallback for an invalid depth of %p',
    (value) => {
      expect(parseLineageDepth(value, 1)).toBe(1)
    }
  )
})

describe('dataset display names', () => {
  it.each([
    ['ANALYTICS.youtube_top_shorts', 'analytics.youtube_top_shorts'],
    ['CHARTMETRIC.ANALYTICS.YOUTUBE_TOP_SHORTS', 'analytics.YOUTUBE_TOP_SHORTS'],
    ['chartmetric_analytics.youtube_top_shorts', 'analytics.youtube_top_shorts'],
    ['chartmetric_raw_data.youtube', 'raw_data.youtube'],
    ['circle_album', 'circle_album'],
  ])('renders %s as %s without changing its stored identity', (name, displayName) => {
    expect(getDatasetDisplayName(name)).toBe(displayName)
  })

  it('renders datasource URIs compactly', () => {
    expect(
      getNamespaceDisplayName('postgres://prod2.cluster.example.us-west-2.rds.amazonaws.com')
    ).toBe('POSTGRES · prod2')
  })

  it.each([
    ['postgres://prod2', 'PG'],
    ['snowflake://ona20116', 'SF'],
    ['clickhouse://cluster', 'CH'],
  ])('renders %s using the %s platform badge', (namespace, label) => {
    expect(getDatasetPlatformLabel(namespace)).toBe(label)
  })
})

describe('getLineageJobRole', () => {
  const job = (overrides: Partial<LineageJob>): LineageJob => ({
    ...lineageJob,
    inputs: [],
    outputs: [],
    ...overrides,
  })

  it('identifies an ingestion observer before treating it as a task', () => {
    expect(
      getLineageJobRole(
        job({
          name: 'ExampleDag.ObserveIngestionActivity',
          simpleName: 'ObserveIngestionActivity',
          parentJobName: 'ExampleDag',
        })
      )
    ).toBe('OBSERVER')
  })

  it('identifies an Airflow child job as a task', () => {
    expect(
      getLineageJobRole(
        job({ name: 'ExampleDag.LoadTracks', simpleName: 'LoadTracks', parentJobName: 'ExampleDag' })
      )
    ).toBe('TASK')
  })

  it('identifies an empty top-level Airflow-style job as a DAG', () => {
    expect(getLineageJobRole(job({ name: 'ExampleDag', simpleName: 'ExampleDag' }))).toBe('DAG')
  })

  it('keeps a standalone processing job as a generic job', () => {
    expect(
      getLineageJobRole(
        job({
          name: 'standalone_loader',
          simpleName: 'standalone_loader',
          inputs: [{ namespace: 'warehouse', name: 'source' }],
        })
      )
    ).toBe('JOB')
  })
})

describe('getJobsListRole', () => {
  const job = (name: string, overrides: Partial<Job> = {}): Job =>
    ({
      name,
      inputs: [],
      outputs: [],
      parentJobName: null,
      parentJobUuid: null,
      ...overrides,
    } as Job)

  it('distinguishes processing, validation, observer, and DAG rows', () => {
    expect(
      getJobsListRole(job('Example.LoadTracks', { parentJobName: 'Example' }))
    ).toBe('TASK')
    expect(
      getJobsListRole(job('Example.CheckFreshness', { parentJobName: 'Example' }))
    ).toBe('VALIDATION')
    expect(
      getJobsListRole(job('Example.HealthCheckYouTubeChannelStat', { parentJobName: 'Example' }))
    ).toBe('VALIDATION')
    expect(
      getJobsListRole(job('Example.ObserveIngestionActivity', { parentJobName: 'Example' }))
    ).toBe('OBSERVER')
    expect(getJobsListRole(job('Example'))).toBe('DAG')
  })

  it('keeps non-Airflow rows generic', () => {
    expect(getJobsListRole(job('dbt.model', { inputs: [{ namespace: 'db', name: 'input' }] }))).toBe(
      'JOB'
    )
  })
})

describe('getDatasetRelationship', () => {
  const datasetNode = (inOrigins: string[], outDestinations: string[]): LineageNode => ({
    id: 'dataset:warehouse:albums',
    type: 'DATASET',
    data: {} as LineageNode['data'],
    inEdges: inOrigins.map((origin) => ({ origin, destination: 'dataset:warehouse:albums' })),
    outEdges: outDestinations.map((destination) => ({
      origin: 'dataset:warehouse:albums',
      destination,
    })),
  })
  const selectedJob = 'job:airflow-data-script:UpdateAlbumStat'

  it('labels an input as READ', () => {
    expect(getDatasetRelationship(datasetNode([], [selectedJob]), selectedJob)).toBe('READ')
  })

  it('labels an output as WRITE', () => {
    expect(getDatasetRelationship(datasetNode([selectedJob], []), selectedJob)).toBe('WRITE')
  })

  it('labels an updated dataset as READ + WRITE', () => {
    expect(getDatasetRelationship(datasetNode([selectedJob], [selectedJob]), selectedJob)).toBe(
      'READ + WRITE'
    )
  })

  it('does not label relationships belonging only to other jobs', () => {
    expect(
      getDatasetRelationship(datasetNode(['job:other'], ['job:other']), selectedJob)
    ).toBeUndefined()
  })
})

describe('getEmptyLineageMessage', () => {
  it('directs DAG users to task jobs', () => {
    expect(getEmptyLineageMessage('DAG')).toContain('Select one of its TASK jobs')
  })

  it('explains observer jobs instead of showing an unexplained empty graph', () => {
    expect(getEmptyLineageMessage('OBSERVER')).toContain('reports ingestion health')
  })
})

describe('parseColumnChangePreview', () => {
  it('parses a source-to-target column mapping for local UX evaluation', () => {
    expect(
      parseColumnChangePreview('spotify_album.popularity>cm_album.spotify_popularity')
    ).toEqual([
      {
        sourceDataset: 'spotify_album',
        sourceField: 'popularity',
        targetDataset: 'cm_album',
        targetField: 'spotify_popularity',
      },
    ])
  })

  it('ignores malformed preview mappings', () => {
    expect(parseColumnChangePreview('not-a-mapping')).toEqual([])
  })
})

describe('summarizeColumnChanges', () => {
  it('keeps the graph preview bounded for wide metadata updates', () => {
    const changes = Array.from({ length: 12 }, (_, index) => ({
      sourceDataset: 'source',
      sourceField: `source_${index}`,
      targetDataset: 'target',
      targetField: `target_${index}`,
    }))

    expect(summarizeColumnChanges(changes)).toMatchObject({
      visible: changes.slice(0, 5),
      remaining: 7,
    })
  })
})

describe('columnChangesFromFacets', () => {
  it('reads standard OpenLineage column lineage fields', () => {
    expect(
      columnChangesFromFacets(
        {
          columnLineage: {
            fields: {
              spotify_popularity: {
                inputFields: [
                  {
                    namespace: 'postgres://chartmetric',
                    name: 'spotify_album',
                    field: 'popularity',
                  },
                ],
              },
            },
          },
        },
        'cm_album'
      )
    ).toEqual([
      {
        sourceDataset: 'spotify_album',
        sourceField: 'popularity',
        targetDataset: 'cm_album',
        targetField: 'spotify_popularity',
      },
    ])
  })

  it('does not invent mappings for malformed or absent facets', () => {
    expect(columnChangesFromFacets({}, 'cm_album')).toEqual([])
    expect(
      columnChangesFromFacets(
        { columnLineage: { fields: { target: { inputFields: [{ field: 'source' }] } } } },
        'cm_album'
      )
    ).toEqual([])
  })
})
