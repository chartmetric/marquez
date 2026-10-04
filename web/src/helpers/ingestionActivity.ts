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
    volume_expectation?: {
      critical_ratio?: number
      mode?: 'stable' | 'variable'
      table?: string
      warning_ratio?: number
    }
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
export type VolumeHealthLabel = 'NORMAL' | 'LOW' | 'CRITICAL' | 'LEARNING' | 'VARIABLE'

export interface VolumeHealth {
  baseline?: number
  label: VolumeHealthLabel
  latest?: number
  ratio?: number
  reason: string
  sampleCount: number
}

const FACET_NAME = 'chartmetric_ingestionActivity'
const OBSERVER_TASK = '.ObserveIngestionActivity'
const LEGACY_DEFAULT_NAMESPACE = 'default'
const LEGACY_DEFAULT_AIRFLOW_SERVER = 'airflow-data-script'

export const getAirflowServer = (namespace: string) =>
  namespace === LEGACY_DEFAULT_NAMESPACE ? LEGACY_DEFAULT_AIRFLOW_SERVER : namespace

export const mergeActivityJobs = (jobs: ActivityJob[], runLimit: number): ActivityJob[] => {
  const mergedJobs = new Map<string, ActivityJob>()
  jobs.forEach((job) => {
    const namespace = getAirflowServer(job.namespace)
    const key = `${namespace}:${job.name}`
    const existing = mergedJobs.get(key)
    const runs = [...(existing?.runs || []), ...job.runs].sort((left, right) =>
      (right.startedAt || right.createdAt || '').localeCompare(
        left.startedAt || left.createdAt || ''
      )
    )
    mergedJobs.set(key, {
      name: job.name,
      namespace,
      run: runs[0] || existing?.run || job.run,
      runs: runs.slice(0, runLimit),
    })
  })
  return [...mergedJobs.values()]
}

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

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2
}

export const getVolumeHealth = (
  job: ActivityJob,
  table: string,
  task: string
): VolumeHealth | undefined => {
  const latestObservations = getRowObservations(job.runs[0], table, task, job.name)
  const latest = getRunActivityCount(latestObservations)
  const policy = latestObservations.find(
    (observation) => observation.run_activity?.volume_expectation
  )?.run_activity?.volume_expectation
  if (!policy?.mode || latest === undefined) return undefined

  const history = job.runs
    .slice(1)
    .map((run) => getRunActivityCount(getRowObservations(run, table, task, job.name)))
    .filter((count): count is number => count !== undefined)
    .slice(0, 10)
  if (policy.mode === 'variable') {
    return {
      label: 'VARIABLE',
      latest,
      reason: 'Run volume varies by design; no threshold is evaluated.',
      sampleCount: history.length,
    }
  }

  if (history.length < 5) {
    return {
      label: 'LEARNING',
      latest,
      reason: `${history.length} of 5 required historical runs are available.`,
      sampleCount: history.length,
    }
  }
  const baseline = median(history)
  if (baseline === 0) {
    return {
      baseline,
      label: latest === 0 ? 'CRITICAL' : 'LEARNING',
      latest,
      reason:
        latest === 0
          ? `No rows were ingested in the latest run or the recent ${history.length}-run median.`
          : 'The recent median is zero, so volume health cannot be evaluated.',
      sampleCount: history.length,
    }
  }

  const ratio = latest / baseline
  const warningRatio = policy.warning_ratio ?? 0.8
  const criticalRatio = policy.critical_ratio ?? 0.5
  if (criticalRatio < 0 || warningRatio > 1 || criticalRatio >= warningRatio) return undefined
  const label = ratio < criticalRatio ? 'CRITICAL' : ratio < warningRatio ? 'LOW' : 'NORMAL'
  return {
    baseline,
    label,
    latest,
    ratio,
    reason: `${(ratio * 100).toFixed(1)}% of the recent ${history.length}-run median (${Math.round(
      latest
    ).toLocaleString('en-US')} vs ${Math.round(baseline).toLocaleString('en-US')} rows).`,
    sampleCount: history.length,
  }
}
