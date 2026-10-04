// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { ActivityJob, getVolumeHealth } from '../../helpers/ingestionActivity'
import { Run } from '../../types/api'

const makeRun = (count: number, mode?: 'stable' | 'variable', id = count.toString()) =>
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
})
