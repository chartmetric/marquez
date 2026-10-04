// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import {
  ActivityJob,
  getActivityRows,
  getActivityBackends,
  getActivityError,
  getActivityStatus,
  getAirflowServer,
  getRowObservations,
  getRunActivityCount,
  getVolumeHealth,
  mergeActivityJobs,
  resolveActivityBackend,
} from '../../helpers/ingestionActivity'
import { Run } from '../../types/api'

const makeRun = (count: number | undefined, mode?: 'stable' | 'variable', id = String(count)) =>
  ({
    id,
    facets: {
      chartmetric_ingestionActivity: {
        observations: [
          {
            expectation: { table: 'example' },
            run_activity: {
              ingested_count: count,
              status: 'observing',
              volume_expectation: mode
                ? {
                    table: 'example',
                    mode,
                    warning_ratio: 0.8,
                    critical_ratio: 0.5,
                  }
                : undefined,
            },
          },
        ],
      },
    },
  } as Run)

const makeJob = (latest: number, history: number[], mode: 'stable' | 'variable' = 'stable') =>
  ({
    name: 'Example.ObserveIngestionActivity',
    namespace: 'airflow-example',
    runs: [makeRun(latest, mode, 'latest'), ...history.map((count, index) => makeRun(count, undefined, `${index}`))],
  } as ActivityJob)

describe('getVolumeHealth', () => {
  it.each([
    [900, 'NORMAL'],
    [700, 'LOW'],
    [400, 'CRITICAL'],
  ])('classifies a stable latest count of %s as %s', (latest, expected) => {
    const health = getVolumeHealth(makeJob(latest, [1000, 1000, 1000, 1000, 1000]), 'example', 'ObserveIngestionActivity')

    expect(health?.label).toBe(expected)
    expect(health?.baseline).toBe(1000)
  })

  it('learns until five historical run metrics exist', () => {
    const health = getVolumeHealth(makeJob(900, [1000, 1000, 1000, 1000]), 'example', 'ObserveIngestionActivity')

    expect(health?.label).toBe('LEARNING')
    expect(health?.sampleCount).toBe(4)
  })

  it('does not evaluate threshold health for variable volume', () => {
    const health = getVolumeHealth(makeJob(0, [100, 0, 200], 'variable'), 'example', 'ObserveIngestionActivity')

    expect(health?.label).toBe('VARIABLE')
  })

  it('does not infer a policy for legacy facets', () => {
    const job = {
      ...makeJob(900, []),
      runs: [900, 1000, 1000, 1000, 1000, 1000].map((count) => makeRun(count)),
    }

    expect(getVolumeHealth(job, 'example', 'ObserveIngestionActivity')).toBeUndefined()
  })

  it('does not use an older run when the latest run has no metric', () => {
    const job = {
      ...makeJob(900, []),
      runs: [makeRun(undefined, 'stable', 'latest'), makeRun(900, undefined, 'previous')],
    }

    expect(getVolumeHealth(job, 'example', 'ObserveIngestionActivity')).toBeUndefined()
  })

  it.each([
    [800, 'NORMAL'],
    [500, 'LOW'],
  ])('uses an exclusive lower bound at the %s threshold', (latest, expected) => {
    expect(
      getVolumeHealth(
        makeJob(latest, [1000, 1000, 1000, 1000, 1000]),
        'example',
        'ObserveIngestionActivity'
      )?.label
    ).toBe(expected)
  })

  it('uses at most ten historical runs', () => {
    const health = getVolumeHealth(
      makeJob(100, [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 10000]),
      'example',
      'ObserveIngestionActivity'
    )

    expect(health?.baseline).toBe(100)
    expect(health?.sampleCount).toBe(10)
  })

  it('marks sustained zero ingestion as critical', () => {
    const health = getVolumeHealth(
      makeJob(0, [0, 0, 0, 0, 0]),
      'example',
      'ObserveIngestionActivity'
    )

    expect(health?.label).toBe('CRITICAL')
    expect(health?.baseline).toBe(0)
  })
})

describe('backend-specific task outputs', () => {
  const job = {
    name: 'Example.ObserveIngestionActivity',
    namespace: 'airflow-example',
    runs: [
      {
        id: 'latest',
        facets: {
          chartmetric_ingestionActivity: {
            observations: [
              {
                expectation: { backend: 'postgres', table: 'shared_table' },
                run_activity: { ingested_count: 10, status: 'observing' },
              },
              {
                expectation: { backend: 'clickhouse', table: 'shared_table' },
                run_activity: { ingested_count: 20, status: 'observing' },
              },
            ],
          },
        },
      } as Run,
    ],
  } as ActivityJob

  it('creates separate rows for the same table on different backends', () => {
    const rows = getActivityRows([job])

    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.backend).sort()).toEqual(['clickhouse', 'postgres'])
  })

  it('filters run counts by backend', () => {
    const postgres = getRowObservations(
      job.runs[0],
      'shared_table',
      'ObserveIngestionActivity',
      job.name,
      'postgres'
    )
    const clickhouse = getRowObservations(
      job.runs[0],
      'shared_table',
      'ObserveIngestionActivity',
      job.name,
      'clickhouse'
    )

    expect(getRunActivityCount(postgres)).toBe(10)
    expect(getRunActivityCount(clickhouse)).toBe(20)
  })

  it('requires an explicit backend for an old URL when several backends match', () => {
    const rows = getActivityRows([job])
    const backends = getActivityBackends(
      rows,
      job,
      'shared_table',
      'ObserveIngestionActivity'
    )

    expect(resolveActivityBackend(backends)).toBeUndefined()
    expect(resolveActivityBackend(backends, 'clickhouse')).toBe('clickhouse')
  })

  it('resolves an old URL when only one backend matches', () => {
    const rows = getActivityRows([job]).filter((row) => row.backend === 'postgres')
    const backends = getActivityBackends(
      rows,
      job,
      'shared_table',
      'ObserveIngestionActivity'
    )

    expect(resolveActivityBackend(backends)).toBe('postgres')
  })

  it('reports a volume policy error without merging backend metrics', () => {
    const observation = {
      expectation: { backend: 'clickhouse', table: 'shared_table' },
      run_activity: {
        ingested_count: 20,
        status: 'observing',
        volume_expectation_error: 'Duplicate clickhouse policy',
      },
    }

    expect(getActivityStatus([observation])).toBe('ERROR')
    expect(getActivityError([observation])).toBe('Duplicate clickhouse policy')
  })

  it('defaults a legacy observation backend to postgres', () => {
    const rows = getActivityRows([makeJob(10, [])])

    expect(rows[0].backend).toBe('postgres')
  })
})

describe('Airflow server namespaces', () => {
  it('uses the known server name for legacy default namespace jobs', () => {
    expect(getAirflowServer('default')).toBe('airflow-data-script')
    expect(getAirflowServer('airflow-data-infra')).toBe('airflow-data-infra')
  })

  it('merges legacy and explicit namespace runs for the same job', () => {
    const legacy = { ...makeJob(10, []), namespace: 'default' }
    const current = { ...makeJob(20, []), namespace: 'airflow-data-script' }
    legacy.runs[0].startedAt = '2026-10-03T00:00:00Z'
    current.runs[0].startedAt = '2026-10-04T00:00:00Z'

    const merged = mergeActivityJobs([legacy, current], 100)

    expect(merged).toHaveLength(1)
    expect(merged[0].namespace).toBe('airflow-data-script')
    expect(merged[0].runs).toHaveLength(2)
    expect(merged[0].run?.id).toBe('latest')
  })

  it('sorts runs with no started timestamp by creation time', () => {
    const older = makeJob(10, [])
    const newer = makeJob(20, [])
    older.runs[0].startedAt = null as unknown as string
    older.runs[0].createdAt = '2026-10-03T00:00:00Z'
    newer.runs[0].startedAt = null as unknown as string
    newer.runs[0].createdAt = '2026-10-04T00:00:00Z'

    const merged = mergeActivityJobs(
      [
        { ...older, namespace: 'default' },
        { ...newer, namespace: 'airflow-data-script' },
      ],
      100
    )

    expect(merged[0].runs[0].createdAt).toBe('2026-10-04T00:00:00Z')
  })
})
