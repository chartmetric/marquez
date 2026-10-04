// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import {
  ActivityJob,
  ActivityRow,
  ActivityStatusLabel,
  IngestionActivityObservation,
  VolumeHealthLabel,
  getActivityBackends,
  getActivityError,
  getActivityRows,
  getActivityStatus,
  getIngestionFacet,
  getJobParts,
  getObservationBackend,
  getObservedCount,
  getRowObservations,
  getVolumeHealth,
  mergeActivityJobs,
  resolveActivityBackend,
} from '../../helpers/ingestionActivity'
import { ArrowBackIosRounded } from '@mui/icons-material'
import {
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  MenuItem,
  TextField,
} from '@mui/material'
import { Runs, Search } from '../../types/api'
import { formatUpdatedAt } from '../../helpers'
import { getRuns } from '../../store/requests/jobs'
import { getSearch } from '../../store/requests/search'
import { theme } from '../../helpers/theme'
import { useSearchParams } from 'react-router-dom'
import IngestionActivity from '../../components/jobs/IngestionActivity'
import IngestionRunSparkline from '../../components/jobs/IngestionRunSparkline'
import IngestionTrend from '../../components/jobs/IngestionTrend'
import MQTooltip from '../../components/core/tooltip/MQTooltip'
import MqEmpty from '../../components/core/empty/MqEmpty'
import MqStatus from '../../components/core/status/MqStatus'
import MqText from '../../components/core/text/MqText'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

const REFRESH_INTERVAL_MS = 30000
const RUN_FETCH_LIMIT = 100

const STATUS_DETAILS: Record<ActivityStatusLabel, { color: string; description: string }> = {
  OBSERVING: {
    color: theme.palette.primary.main,
    description: 'Run-level ingestion is reporting',
  },
  SNAPSHOT: { color: theme.palette.info.main, description: 'Daily snapshot only' },
  ERROR: { color: theme.palette.error.main, description: 'Metric collection failed' },
  'NO DATA': {
    color: theme.palette.secondary.main,
    description: 'No ingestion metric available',
  },
}
const STATUS_ORDER: ActivityStatusLabel[] = ['OBSERVING', 'SNAPSHOT', 'ERROR', 'NO DATA']
const HEALTH_DETAILS: Record<VolumeHealthLabel, { color: string; description: string }> = {
  NORMAL: { color: theme.palette.primary.main, description: 'At or above warning' },
  LOW: { color: theme.palette.warning.main, description: 'Below warning' },
  CRITICAL: { color: theme.palette.error.main, description: 'Below critical' },
  LEARNING: { color: theme.palette.info.main, description: 'Building baseline' },
  VARIABLE: { color: theme.palette.secondary.main, description: 'Expected to vary' },
}
const HEALTH_ORDER: VolumeHealthLabel[] = ['NORMAL', 'LOW', 'CRITICAL', 'LEARNING', 'VARIABLE']

const activityStatus = (observations: IngestionActivityObservation[]) => {
  const label = getActivityStatus(observations)
  const details = STATUS_DETAILS[label]
  return {
    label,
    ...details,
    description:
      label === 'ERROR'
        ? getActivityError(observations) || details.description
        : details.description,
  }
}

const Ingestion: React.FC = () => {
  const [jobs, setJobs] = useState<ActivityJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [namespace, setNamespace] = useState('')
  const [statusFilters, setStatusFilters] = useState<ActivityStatusLabel[]>([])
  const [healthFilters, setHealthFilters] = useState<VolumeHealthLabel[]>([])
  const [searchParams, setSearchParams] = useSearchParams()

  const loadActivity = useCallback(async () => {
    try {
      const search = (await getSearch('ObserveIngestionActivity', 'JOB', 'NAME', 100)) as Search
      const activityJobs = await Promise.all(
        search.results.map(async (job) => {
          const runs = (await getRuns(job.name, job.namespace, RUN_FETCH_LIMIT, 0)) as Runs
          const activityRuns = runs.runs.filter((run) => getIngestionFacet(run))
          return {
            name: job.name,
            namespace: job.namespace,
            run: activityRuns[0] || runs.runs[0],
            runs: activityRuns,
          }
        })
      )
      setJobs(mergeActivityJobs(activityJobs, RUN_FETCH_LIMIT))
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

  const rows = useMemo<ActivityRow[]>(() => getActivityRows(jobs), [jobs])
  const evaluatedRows = useMemo(
    () =>
      rows.map((row) => {
        const observations = getRowObservations(
          row.job.run,
          row.table,
          row.task,
          row.job.name,
          row.backend
        )
        return {
          ...row,
          activity: getObservedCount(observations),
          health: getVolumeHealth(row.job, row.table, row.task, row.backend),
          status: activityStatus(observations),
        }
      }),
    [rows]
  )
  const namespaces = useMemo(() => [...new Set(jobs.map((job) => job.namespace))].sort(), [jobs])

  useEffect(() => {
    if (namespace && !namespaces.includes(namespace)) setNamespace('')
  }, [namespace, namespaces])

  if (isLoading)
    return (
      <Box display='flex' justifyContent='center' mt={4}>
        <CircularProgress color='primary' />
      </Box>
    )

  const selectedJob = jobs.find(
    (job) => job.name === searchParams.get('job') && job.namespace === searchParams.get('namespace')
  )
  const selectedTable = searchParams.get('table') || undefined
  const selectedBackend = searchParams.get('backend') || undefined
  const selectedTask = searchParams.get('task') || getJobParts(selectedJob?.name || '').task
  if (selectedJob) {
    const availableBackends = getActivityBackends(rows, selectedJob, selectedTable, selectedTask)
    const resolvedBackend = resolveActivityBackend(availableBackends, selectedBackend)
    const requiresBackendSelection = Boolean(
      selectedTable && !resolvedBackend && availableBackends.length > 1
    )
    const observations = requiresBackendSelection
      ? []
      : selectedTable
      ? getRowObservations(
          selectedJob.run,
          selectedTable,
          selectedTask,
          selectedJob.name,
          resolvedBackend
        )
      : getIngestionFacet(selectedJob.run)?.observations || []
    const status = activityStatus(observations)
    const health =
      selectedTable && !requiresBackendSelection
        ? getVolumeHealth(selectedJob, selectedTable, selectedTask, resolvedBackend)
        : undefined
    const labels = getJobParts(selectedJob.name)
    const completenessByDay = new Map<string, IngestionActivityObservation>()
    selectedJob.runs.forEach((run) =>
      getRowObservations(
        run,
        selectedTable || 'unknown',
        selectedTask,
        selectedJob.name,
        resolvedBackend
      ).forEach((observation) => {
        if (!observation.expected_date) return
        const key = `${getObservationBackend(observation)}:${
          observation.expectation?.table || 'unknown'
        }:${observation.expected_date}`
        if (!completenessByDay.has(key)) completenessByDay.set(key, observation)
      })
    )
    return (
      <Container maxWidth='lg'>
        <Box pt={2} mb={3} display='flex' alignItems='center' justifyContent='space-between'>
          <Box display='flex' alignItems='center'>
            <IconButton onClick={() => setSearchParams({})} size='small' sx={{ mr: 1 }}>
              <ArrowBackIosRounded fontSize='small' />
            </IconButton>
            <Box>
              <MqText heading font='mono'>
                {selectedTask}
              </MqText>
              <MqText subdued>{labels.dag}</MqText>
              {selectedTable && <MqText font='mono'>{selectedTable}</MqText>}
              {resolvedBackend && <MqText subdued>{resolvedBackend}</MqText>}
              <MqText subdued>
                {selectedJob.run
                  ? formatUpdatedAt(selectedJob.run.endedAt || selectedJob.run.startedAt)
                  : 'No completed run'}
              </MqText>
            </Box>
          </Box>
          <Box display='flex' gap={1}>
            {!requiresBackendSelection && (
              <MQTooltip title={status.description}>
                <Box>
                  <MqStatus color={status.color} label={status.label} />
                </Box>
              </MQTooltip>
            )}
            {!requiresBackendSelection && health && (
              <MQTooltip title={health.reason}>
                <Box>
                  <MqStatus color={HEALTH_DETAILS[health.label].color} label={health.label} />
                </Box>
              </MQTooltip>
            )}
          </Box>
        </Box>
        {status.label === 'ERROR' && !requiresBackendSelection && (
          <MqText color={theme.palette.error.main}>{status.description}</MqText>
        )}
        {requiresBackendSelection && (
          <Box border={1} borderColor='warning.main' borderRadius={1} p={2} mb={2}>
            <MqText subheading>SELECT DATABASE BACKEND</MqText>
            <MqText subdued>
              This task and table report activity from multiple database backends. Select one to
              view unambiguous metrics.
            </MqText>
            <Box display='flex' gap={1} mt={1}>
              {availableBackends.map((backend) => (
                <Button
                  key={backend}
                  size='small'
                  variant='outlined'
                  onClick={() =>
                    setSearchParams({
                      job: selectedJob.name,
                      namespace: selectedJob.namespace,
                      backend,
                      table: selectedTable || '',
                      task: selectedTask,
                    })
                  }
                >
                  {backend}
                </Button>
              ))}
            </Box>
          </Box>
        )}
        {!requiresBackendSelection && health && (
          <Box border={1} borderColor='divider' borderRadius={1} p={2} mb={2}>
            <Box display='flex' justifyContent='space-between' alignItems='center' mb={1}>
              <MqText subheading>VOLUME HEALTH</MqText>
              <MqStatus color={HEALTH_DETAILS[health.label].color} label={health.label} />
            </Box>
            <MqText>{health.reason}</MqText>
            {health.baseline !== undefined && (
              <MqText subdued>
                {`Latest ${health.latest?.toLocaleString('en-US')} · Median ${Math.round(
                  health.baseline
                ).toLocaleString('en-US')} · ${health.sampleCount} historical runs`}
              </MqText>
            )}
          </Box>
        )}
        {!requiresBackendSelection && (
          <>
            <IngestionTrend
              backend={resolvedBackend}
              runs={selectedJob.runs}
              table={selectedTable}
              task={selectedTask}
            />
            <IngestionActivity
              backend={resolvedBackend}
              observations={[...completenessByDay.values()]}
              table={selectedTable}
              task={selectedTask}
            />
          </>
        )}
      </Container>
    )
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = evaluatedRows.filter(({ backend, job, table, task, status, health }) => {
    const labels = getJobParts(job.name)
    return (
      (!namespace || job.namespace === namespace) &&
      (!statusFilters.length || statusFilters.includes(status.label)) &&
      (!healthFilters.length || (health !== undefined && healthFilters.includes(health.label))) &&
      [labels.dag, task, table, backend, job.namespace].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    )
  })
  const reportingCount = evaluatedRows.filter(({ activity }) => activity !== undefined).length
  const attentionCount = evaluatedRows.filter(
    ({ status, health }) =>
      status.label === 'ERROR' || health?.label === 'LOW' || health?.label === 'CRITICAL'
  ).length

  const toggleFilter = <T,>(value: T, values: T[], setValues: (values: T[]) => void) =>
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])

  return (
    <Container maxWidth='lg'>
      <Box pt={2} mb={3} display='flex' justifyContent='space-between' alignItems='center'>
        <Box>
          <MqText heading>Ingestion Activity</MqText>
          <MqText subdued>Run-level ingestion volume by Airflow task and target table.</MqText>
        </Box>
        <Button size='small' variant='outlined' color='primary' onClick={loadActivity}>
          REFRESH
        </Button>
      </Box>
      <Box display='flex' mb={3} gap={2}>
        {[
          ['MONITORED TASK OUTPUTS', rows.length],
          ['REPORTING ACTIVITY', reportingCount],
          ['NEEDS ATTENTION', attentionCount],
        ].map(([label, value]) => (
          <Box key={label} border={1} borderColor='divider' borderRadius={1} p={2} flex={1}>
            <MqText subdued>{label}</MqText>
            <MqText large>{value.toString()}</MqText>
          </Box>
        ))}
      </Box>
      <Box display='flex' gap={2} mb={2}>
        <TextField
          fullWidth
          size='small'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Search DAG, task, target table, backend, or Airflow server'
        />
        <TextField
          select
          size='small'
          label='Airflow server'
          value={namespace}
          onChange={(event) => setNamespace(event.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value=''>ALL AIRFLOW SERVERS</MenuItem>
          {namespaces.map((item) => (
            <MenuItem key={item} value={item}>
              {item}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box display='flex' alignItems='center' gap={2} mb={2} flexWrap='wrap'>
        <MqText subdued>STATUS</MqText>
        {STATUS_ORDER.map((label) => {
          const { color, description } = STATUS_DETAILS[label]
          return (
            <Box
              key={label}
              component='button'
              type='button'
              aria-pressed={statusFilters.includes(label)}
              display='flex'
              alignItems='center'
              gap={0.75}
              onClick={() => toggleFilter(label, statusFilters, setStatusFilters)}
              sx={{
                background: 'none',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                font: 'inherit',
                padding: 0,
                opacity: statusFilters.length && !statusFilters.includes(label) ? 0.45 : 1,
              }}
            >
              <MqStatus color={color} label={label} />
              <MqText subdued small>
                {description}
              </MqText>
            </Box>
          )
        })}
      </Box>
      <Box display='flex' alignItems='center' gap={2} mb={2} flexWrap='wrap'>
        <MqText subdued>HEALTH</MqText>
        {HEALTH_ORDER.map((label) => {
          const { color, description } = HEALTH_DETAILS[label]
          return (
            <Box
              key={label}
              component='button'
              type='button'
              aria-pressed={healthFilters.includes(label)}
              display='flex'
              alignItems='center'
              gap={0.75}
              onClick={() => toggleFilter(label, healthFilters, setHealthFilters)}
              sx={{
                background: 'none',
                border: 0,
                color: 'inherit',
                cursor: 'pointer',
                font: 'inherit',
                padding: 0,
                opacity: healthFilters.length && !healthFilters.includes(label) ? 0.45 : 1,
              }}
            >
              <MqStatus color={color} label={label} />
              <MqText subdued small>
                {description}
              </MqText>
            </Box>
          )
        })}
      </Box>
      <Box display='grid' gridTemplateColumns='2fr 1.5fr 1.25fr 1fr 0.75fr 0.75fr' px={2} mb={1}>
        <MqText subdued>DAG / TASK / AIRFLOW SERVER</MqText>
        <MqText subdued>TARGET TABLE / BACKEND</MqText>
        <MqText subdued>RECENT 10 RUNS</MqText>
        <MqText subdued>LATEST</MqText>
        <MqText subdued>STATUS</MqText>
        <Box textAlign='center'>
          <MqText subdued>HEALTH</MqText>
        </Box>
      </Box>
      {error && <MqEmpty title='Ingestion activity unavailable' body={error} />}
      {!error &&
        filteredRows.map(({ backend, job, table, task, status, health, activity }) => {
          const labels = getJobParts(job.name)
          return (
            <Box
              key={`${job.namespace}:${job.name}:${backend}:${task}:${table}`}
              role='button'
              tabIndex={0}
              aria-label={`${labels.dag}, ${task}, ${backend}, ${table}, ${job.namespace}, status ${
                status.label
              }${status.label === 'ERROR' ? `, ${status.description}` : ''}, health ${
                health?.label || 'not available'
              }${health ? `, ${health.reason}` : ''}`}
              border={1}
              borderColor='divider'
              borderRadius={1}
              p={2}
              mb={1}
              onClick={() =>
                setSearchParams({ job: job.name, namespace: job.namespace, backend, table, task })
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setSearchParams({ job: job.name, namespace: job.namespace, backend, table, task })
              }}
              sx={{ cursor: 'pointer', '&:hover': { backgroundColor: theme.palette.action.hover } }}
            >
              <Box
                display='grid'
                gridTemplateColumns='2fr 1.5fr 1.25fr 1fr 0.75fr 0.75fr'
                alignItems='center'
              >
                <Box>
                  <MqText font='mono'>{labels.dag}</MqText>
                  <MqText subdued>{task}</MqText>
                  <MqText subdued>{`AIRFLOW SERVER · ${job.namespace}`}</MqText>
                  <MqText subdued>
                    {job.run
                      ? formatUpdatedAt(job.run.endedAt || job.run.startedAt)
                      : 'No completed run'}
                  </MqText>
                </Box>
                <Box>
                  <MqText font='mono'>{table}</MqText>
                  <MqText subdued small>
                    {backend}
                  </MqText>
                </Box>
                <IngestionRunSparkline backend={backend} job={job} table={table} task={task} />
                <Box>
                  <MqText subdued>
                    {activity?.runActivity ? 'RUN INGESTED' : 'DAILY SNAPSHOT'}
                  </MqText>
                  <MqText large>
                    {activity === undefined ? 'N/A' : activity.count.toLocaleString('en-US')}
                  </MqText>
                </Box>
                <MQTooltip title={status.description}>
                  <Box>
                    <MqStatus color={status.color} label={status.label} />
                  </Box>
                </MQTooltip>
                {health ? (
                  <MQTooltip title={health.reason}>
                    <Box justifySelf='center'>
                      <MqStatus color={HEALTH_DETAILS[health.label].color} label={health.label} />
                    </Box>
                  </MQTooltip>
                ) : (
                  <MQTooltip
                    title={
                      status.label === 'ERROR'
                        ? status.description
                        : 'No volume health policy is available for the latest run.'
                    }
                  >
                    <Box justifySelf='center'>
                      <MqText subdued>N/A</MqText>
                    </Box>
                  </MQTooltip>
                )}
              </Box>
            </Box>
          )
        })}
    </Container>
  )
}

export default Ingestion
