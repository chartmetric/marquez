// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { ArrowBackIosRounded } from '@mui/icons-material'
import { Box, Button, CircularProgress, Container, Grid, IconButton } from '@mui/material'
import { LineChart } from '@mui/x-charts'
import { Run, Runs, Search } from '../../types/api'
import { formatUpdatedAt } from '../../helpers'
import { getRuns } from '../../store/requests/jobs'
import { getSearch } from '../../store/requests/search'
import { theme } from '../../helpers/theme'
import { useSearchParams } from 'react-router-dom'
import IngestionActivity, {
  IngestionActivityFacet,
  IngestionActivityObservation,
} from '../../components/jobs/IngestionActivity'
import IngestionTrend from '../../components/jobs/IngestionTrend'
import MQTooltip from '../../components/core/tooltip/MQTooltip'
import MqEmpty from '../../components/core/empty/MqEmpty'
import MqStatus from '../../components/core/status/MqStatus'
import MqText from '../../components/core/text/MqText'
import ParentSize from '@visx/responsive/lib/components/ParentSize'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

interface ActivityJob {
  name: string
  namespace: string
  run?: Run
  runs: Run[]
}

const FACET_NAME = 'chartmetric_ingestionActivity'
const OBSERVER_TASK = '.ObserveIngestionActivity'
const REFRESH_INTERVAL_MS = 30000
const RUN_LOOKBACK = 10

const getFacet = (run?: Run) => {
  const facets = run?.facets as { [key: string]: object } | undefined
  return facets?.[FACET_NAME] as IngestionActivityFacet | undefined
}

const getObservations = (job: ActivityJob) => getFacet(job.run)?.observations || []

const jobLabel = (name: string) =>
  name.endsWith(OBSERVER_TASK) ? name.slice(0, -OBSERVER_TASK.length) : name

const runActivityCount = (observations: IngestionActivityObservation[]) => {
  const counts = observations
    .map((observation) => observation.run_activity?.ingested_count)
    .filter((count): count is number => typeof count === 'number')
  return counts.length ? counts.reduce((sum, count) => sum + count, 0) : undefined
}

const activityStatus = (observations: IngestionActivityObservation[]) => {
  if (observations.some((observation) => observation.run_activity?.status === 'error')) {
    return { color: theme.palette.error.main, label: 'ERROR' }
  }
  if (runActivityCount(observations) !== undefined) {
    return { color: theme.palette.primary.main, label: 'OBSERVING' }
  }
  return { color: theme.palette.secondary.main, label: 'NO DATA' }
}

const RunSparkline: React.FC<{ job: ActivityJob }> = ({ job }) => {
  const points = [...job.runs]
    .reverse()
    .map((run) => ({
      count: runActivityCount(getFacet(run)?.observations || []),
      run,
    }))
    .filter((point): point is { count: number; run: Run } => point.count !== undefined)
  const maxCount = Math.max(...points.map((point) => point.count), 1)

  if (!points.length) {
    return (
      <Box width={180} textAlign='right'>
        <MqText subdued>RECENT 10 RUNS</MqText>
        <MqText subdued>No run metrics yet</MqText>
      </Box>
    )
  }

  return (
    <Box width={180}>
      <MqText subdued>{`RECENT ${points.length} RUNS`}</MqText>
      <Box height={44} display='flex' alignItems='flex-end' mt={0.5}>
        {points.map(({ count, run }) => (
          <MQTooltip
            key={run.id}
            title={
              <>
                <MqText bold>{formatUpdatedAt(run.endedAt || run.startedAt)}</MqText>
                <MqText>{`${count.toLocaleString('en-US')} rows ingested`}</MqText>
              </>
            }
          >
            <Box
              bgcolor={theme.palette.primary.main}
              height={Math.max((count / maxCount) * 40, 2)}
              width={12}
              mr={0.75}
              sx={{
                borderTopLeftRadius: theme.shape.borderRadius,
                borderTopRightRadius: theme.shape.borderRadius,
              }}
            />
          </MQTooltip>
        ))}
      </Box>
    </Box>
  )
}

const buildChart = (jobs: ActivityJob[]) => {
  const timestamps = new Set<string>()
  const series = new Map<string, Map<string, number>>()
  jobs.forEach((job) => {
    ;[...job.runs].reverse().forEach((run) => {
      getFacet(run)?.observations?.forEach((observation) => {
        const activity = observation.run_activity
        if (typeof activity?.ingested_count !== 'number' || !activity.window_end) return
        const label = `${jobLabel(job.name)} · ${observation.expectation?.table || 'unknown'}`
        timestamps.add(activity.window_end)
        const points = series.get(label) || new Map<string, number>()
        points.set(activity.window_end, activity.ingested_count)
        series.set(label, points)
      })
    })
  })
  return {
    timestamps: [...timestamps].sort(),
    series: [...series.entries()].map(([label, points]) => ({ label, points })),
  }
}

const ActivityChart: React.FC<{ jobs: ActivityJob[] }> = ({ jobs }) => {
  const chart = useMemo(() => buildChart(jobs), [jobs])
  if (!chart.series.length) {
    return (
      <Box border={1} borderColor='divider' borderRadius={1} p={3} mb={3}>
        <MqText subheading>RUN INGESTION TREND</MqText>
        <MqText subdued>Waiting for the first run-window ingestion metrics.</MqText>
      </Box>
    )
  }
  return (
    <Box border={1} borderColor='divider' borderRadius={1} p={2} mb={3}>
      <MqText subheading>RUN VOLUME VS RECENT AVERAGE</MqText>
      <MqText subdued>Each line is normalized to its own recent average (100%).</MqText>
      <Box height={240} mt={1}>
        <ParentSize>
          {(parent) => (
            <LineChart
              width={parent.width}
              height={parent.height}
              series={chart.series.map((item) => {
                const values = [...item.points.values()]
                const average = values.reduce((sum, value) => sum + value, 0) / values.length
                return {
                  data: chart.timestamps.map((timestamp) => {
                    const value = item.points.get(timestamp)
                    return value === undefined ? null : Math.round((value / average) * 100)
                  }),
                  label: item.label,
                  type: 'line' as const,
                  showMark: true,
                }
              })}
              xAxis={[
                {
                  data: chart.timestamps.map((timestamp) =>
                    new Date(timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  ),
                  scaleType: 'point',
                },
              ]}
              margin={{ left: 45, right: 20, top: 30, bottom: 30 }}
            />
          )}
        </ParentSize>
      </Box>
    </Box>
  )
}

const Ingestion: React.FC = () => {
  const [jobs, setJobs] = useState<ActivityJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const loadActivity = useCallback(async () => {
    try {
      const search = (await getSearch('ObserveIngestionActivity', 'JOB', 'NAME', 100)) as Search
      const activityJobs = await Promise.all(
        search.results.map(async (job) => {
          const runs = (await getRuns(job.name, job.namespace, RUN_LOOKBACK, 0)) as Runs
          const activityRuns = runs.runs.filter((run) => getFacet(run))
          return {
            name: job.name,
            namespace: job.namespace,
            run: activityRuns[0] || runs.runs[0],
            runs: activityRuns,
          }
        })
      )
      setJobs(activityJobs)
      setError(null)
    } catch (_error) {
      setError('Unable to load ingestion activity from Marquez.')
    } finally {
      setIsLoading(false)
    }
  }, [])
  useEffect(() => {
    loadActivity()
    const intervalId = window.setInterval(loadActivity, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [loadActivity])

  if (isLoading)
    return (
      <Box display='flex' justifyContent='center' mt={4}>
        <CircularProgress color='primary' />
      </Box>
    )

  const selectedJob = jobs.find(
    (job) => job.name === searchParams.get('job') && job.namespace === searchParams.get('namespace')
  )
  if (selectedJob) {
    const status = activityStatus(getObservations(selectedJob))
    return (
      <Container maxWidth='lg'>
        <Box pt={2} mb={3} display='flex' alignItems='center' justifyContent='space-between'>
          <Box display='flex' alignItems='center'>
            <IconButton onClick={() => setSearchParams({})} size='small' sx={{ mr: 1 }}>
              <ArrowBackIosRounded fontSize='small' />
            </IconButton>
            <Box>
              <MqText heading font='mono'>
                {jobLabel(selectedJob.name)}
              </MqText>
              <MqText subdued>
                {selectedJob.run
                  ? formatUpdatedAt(selectedJob.run.endedAt || selectedJob.run.startedAt)
                  : 'No completed run'}
              </MqText>
            </Box>
          </Box>
          <MqStatus color={status.color} label={status.label} />
        </Box>
        <IngestionTrend runs={selectedJob.runs} />
        <IngestionActivity facet={getFacet(selectedJob.run)} />
      </Container>
    )
  }

  const reportingCount = jobs.filter(
    (job) => runActivityCount(getObservations(job)) !== undefined
  ).length
  const attentionCount = jobs.filter(
    (job) => activityStatus(getObservations(job)).label === 'ERROR'
  ).length
  return (
    <Container maxWidth='lg'>
      <Box pt={2} mb={3} display='flex' justifyContent='space-between' alignItems='center'>
        <Box>
          <MqText heading>Ingestion Activity</MqText>
          <MqText subdued>Run-level ingestion volume reported by Airflow observer tasks.</MqText>
        </Box>
        <Button size='small' variant='outlined' color='primary' onClick={loadActivity}>
          REFRESH
        </Button>
      </Box>
      <Grid container spacing={2} mb={3}>
        {[
          ['OBSERVER JOBS', jobs.length],
          ['REPORTING RUN ACTIVITY', reportingCount],
          ['NEEDS ATTENTION', attentionCount],
        ].map(([label, value]) => (
          <Grid item xs={4} key={label}>
            <Box border={1} borderColor='divider' borderRadius={1} p={2}>
              <MqText subdued>{label}</MqText>
              <MqText large>{value.toString()}</MqText>
            </Box>
          </Grid>
        ))}
      </Grid>
      <ActivityChart jobs={jobs} />
      {error && <MqEmpty title='Ingestion activity unavailable' body={error} />}
      {!error &&
        jobs.map((job) => {
          const observations = getObservations(job)
          const status = activityStatus(observations)
          const count = runActivityCount(observations)
          return (
            <Box
              key={`${job.namespace}:${job.name}`}
              border={1}
              borderColor='divider'
              borderRadius={1}
              p={2}
              mb={2}
              onClick={() => setSearchParams({ job: job.name, namespace: job.namespace })}
              sx={{ cursor: 'pointer', '&:hover': { backgroundColor: theme.palette.action.hover } }}
            >
              <Box display='flex' alignItems='center' justifyContent='space-between'>
                <Box>
                  <MqText heading font='mono'>
                    {jobLabel(job.name)}
                  </MqText>
                  <MqText subdued>
                    {job.run
                      ? formatUpdatedAt(job.run.endedAt || job.run.startedAt)
                      : 'No completed run'}
                  </MqText>
                </Box>
                <Box display='flex' alignItems='center'>
                  <Box mr={4}>
                    <RunSparkline job={job} />
                  </Box>
                  <Box mr={3} textAlign='right'>
                    <MqText subdued>LAST RUN INGESTED</MqText>
                    <MqText large>
                      {count === undefined ? 'N/A' : count.toLocaleString('en-US')}
                    </MqText>
                  </Box>
                  <MqStatus color={status.color} label={status.label} />
                </Box>
              </Box>
            </Box>
          )
        })}
    </Container>
  )
}

export default Ingestion
