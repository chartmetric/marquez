// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { Run } from '../types/api'

export interface IngestionActivityObservation {
  actual_count?: number
  baseline_avg?: number
  error?: string
  expectation?: {
    backend?: string
    table?: string
  }
  expected_date?: string
  passed?: boolean
  run_activity?: {
    error?: string
    ingested_count?: number
    status?: string
    task_id?: string
    task_ids?: string[]
    timestamp_column?: string
    window_end?: string
    window_start?: string
  }
  status?: string
}

export interface IngestionActivityFacet {
  observations?: IngestionActivityObservation[]
}

export interface ActivityJob {
  name: string
  namespace: string
  run?: Run
  runs: Run[]
}

export interface ActivityRow {
  job: ActivityJob
  table: string
  task: string
}

export interface ObservedCount {
  count: number
  runActivity: boolean
}

export type ActivityStatusLabel = 'ERROR' | 'OBSERVING' | 'SNAPSHOT' | 'NO DATA'

const FACET_NAME = 'chartmetric_ingestionActivity'
const OBSERVER_TASK = '.ObserveIngestionActivity'

export const getIngestionFacet = (run?: Run) => {
  const facets = run?.facets as { [key: string]: object } | undefined
  return facets?.[FACET_NAME] as IngestionActivityFacet | undefined
}

export const getJobParts = (name: string) => {
  if (name.endsWith(OBSERVER_TASK)) {
    return { dag: name.slice(0, -OBSERVER_TASK.length), task: 'ObserveIngestionActivity' }
  }
  const separator = name.lastIndexOf('.')
  return separator < 0
    ? { dag: name, task: name }
    : { dag: name.slice(0, separator), task: name.slice(separator + 1) }
}

export const getRowObservations = (
  run: Run | undefined,
  table: string,
  task: string,
  jobName: string
) =>
  (getIngestionFacet(run)?.observations || []).filter(
    (observation) =>
      (observation.expectation?.table || 'unknown') === table &&
      (observation.run_activity?.task_id || getJobParts(jobName).task) === task
  )

export const getRunActivityCount = (observations: IngestionActivityObservation[]) => {
  const counts = observations
    .map((observation) => observation.run_activity?.ingested_count)
    .filter((count): count is number => typeof count === 'number')
  return counts.length ? counts.reduce((sum, count) => sum + count, 0) : undefined
}

export const getObservedCount = (
  observations: IngestionActivityObservation[]
): ObservedCount | undefined => {
  const runCount = getRunActivityCount(observations)
  if (runCount !== undefined) return { count: runCount, runActivity: true }
  const counts = observations
    .map((observation) => observation.actual_count)
    .filter((count): count is number => typeof count === 'number')
  return counts.length
    ? { count: counts.reduce((sum, count) => sum + count, 0), runActivity: false }
    : undefined
}

export const getActivityStatus = (
  observations: IngestionActivityObservation[]
): ActivityStatusLabel => {
  if (observations.some((observation) => observation.run_activity?.status === 'error')) {
    return 'ERROR'
  }
  if (getRunActivityCount(observations) !== undefined) return 'OBSERVING'
  if (getObservedCount(observations)) return 'SNAPSHOT'
  return 'NO DATA'
}

export const getActivityRows = (jobs: ActivityJob[]): ActivityRow[] =>
  jobs.flatMap((job) => {
    const outputs = new Map<string, ActivityRow>()
    job.runs.forEach((run) =>
      getIngestionFacet(run)?.observations?.forEach((observation) => {
        const table = observation.expectation?.table || 'unknown'
        const task = observation.run_activity?.task_id || getJobParts(job.name).task
        outputs.set(`${task}:${table}`, { job, table, task })
      })
    )
    return [...outputs.values()]
  })
