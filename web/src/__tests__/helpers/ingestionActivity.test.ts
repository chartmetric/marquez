// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import {
  ActivityJob,
  getAirflowServer,
  getVolumeHealth,
  mergeActivityJobs,
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
})
