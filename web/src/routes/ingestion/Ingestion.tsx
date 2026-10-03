// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import {
  ActivityJob,
  ActivityRow,
  ActivityStatusLabel,
  IngestionActivityObservation,
  getActivityRows,
  getActivityStatus,
  getIngestionFacet,
  getJobParts,
  getObservedCount,
  getRowObservations,
} from '../../helpers/ingestionActivity'
import { ArrowBackIosRounded } from '@mui/icons-material'
import { Box, Button, CircularProgress, Container, IconButton, TextField } from '@mui/material'
import { Runs, Search } from '../../types/api'
import { formatUpdatedAt } from '../../helpers'
import { getRuns } from '../../store/requests/jobs'
import { getSearch } from '../../store/requests/search'
import { theme } from '../../helpers/theme'
import { useSearchParams } from 'react-router-dom'
import IngestionActivity from '../../components/jobs/IngestionActivity'
import IngestionRunSparkline from '../../components/jobs/IngestionRunSparkline'
import IngestionTrend from '../../components/jobs/IngestionTrend'
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

const activityStatus = (observations: IngestionActivityObservation[]) => {
  const label = getActivityStatus(observations)
  return { label, ...STATUS_DETAILS[label] }
}

const Ingestion: React.FC = () => {
  const [jobs, setJobs] = useState<ActivityJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
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

  const rows = useMemo<ActivityRow[]>(() => getActivityRows(jobs), [jobs])

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
  const selectedTask = searchParams.get('task') || getJobParts(selectedJob?.name || '').task
  if (selectedJob) {
    const observations = selectedTable
      ? getRowObservations(selectedJob.run, selectedTable, selectedTask, selectedJob.name)
      : getIngestionFacet(selectedJob.run)?.observations || []
    const status = activityStatus(observations)
    const labels = getJobParts(selectedJob.name)
    const completenessByDay = new Map<string, IngestionActivityObservation>()
    selectedJob.runs.forEach((run) =>
      getRowObservations(run, selectedTable || 'unknown', selectedTask, selectedJob.name).forEach(
        (observation) => {
          if (!observation.expected_date) return
          const key = `${observation.expectation?.table || 'unknown'}:${observation.expected_date}`
          if (!completenessByDay.has(key)) completenessByDay.set(key, observation)
        }
      )
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
              <MqText subdued>
                {selectedJob.run
                  ? formatUpdatedAt(selectedJob.run.endedAt || selectedJob.run.startedAt)
                  : 'No completed run'}
              </MqText>
            </Box>
          </Box>
          <MqStatus color={status.color} label={status.label} />
        </Box>
        <IngestionTrend runs={selectedJob.runs} table={selectedTable} task={selectedTask} />
        <IngestionActivity
          observations={[...completenessByDay.values()]}
          table={selectedTable}
          task={selectedTask}
        />
      </Container>
    )
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = rows.filter(({ job, table, task }) => {
    const labels = getJobParts(job.name)
    return [labels.dag, task, table].some((value) => value.toLowerCase().includes(normalizedQuery))
  })
  const reportingCount = rows.filter(
    ({ job, table, task }) =>
      getObservedCount(getRowObservations(job.run, table, task, job.name)) !== undefined
  ).length
  const attentionCount = rows.filter(
    ({ job, table, task }) =>
      activityStatus(getRowObservations(job.run, table, task, job.name)).label === 'ERROR'
  ).length

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
      <TextField
        fullWidth
        size='small'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder='Search DAG, task, or target table'
        sx={{ mb: 2 }}
      />
      <Box display='flex' alignItems='center' gap={2} mb={2} flexWrap='wrap'>
        <MqText subdued>STATUS</MqText>
        {STATUS_ORDER.map((label) => {
          const { color, description } = STATUS_DETAILS[label]
          return (
            <Box key={label} display='flex' alignItems='center' gap={0.75}>
              <MqStatus color={color} label={label} />
              <MqText subdued small>
                {description}
              </MqText>
            </Box>
          )
        })}
      </Box>
      <Box display='grid' gridTemplateColumns='2fr 1.5fr 1.25fr 1fr auto' px={2} mb={1}>
        <MqText subdued>DAG / TASK</MqText>
        <MqText subdued>TARGET TABLE</MqText>
        <MqText subdued>RECENT 10 RUNS</MqText>
        <MqText subdued>LATEST</MqText>
        <MqText subdued>STATUS</MqText>
      </Box>
      {error && <MqEmpty title='Ingestion activity unavailable' body={error} />}
      {!error &&
        filteredRows.map(({ job, table, task }) => {
          const observations = getRowObservations(job.run, table, task, job.name)
          const status = activityStatus(observations)
          const activity = getObservedCount(observations)
          const labels = getJobParts(job.name)
          return (
            <Box
              key={`${job.namespace}:${job.name}:${task}:${table}`}
              border={1}
              borderColor='divider'
              borderRadius={1}
              p={2}
              mb={1}
              onClick={() =>
                setSearchParams({ job: job.name, namespace: job.namespace, table, task })
              }
              sx={{ cursor: 'pointer', '&:hover': { backgroundColor: theme.palette.action.hover } }}
            >
              <Box
                display='grid'
                gridTemplateColumns='2fr 1.5fr 1.25fr 1fr auto'
                alignItems='center'
              >
                <Box>
                  <MqText font='mono'>{labels.dag}</MqText>
                  <MqText subdued>{task}</MqText>
                  <MqText subdued>
                    {job.run
                      ? formatUpdatedAt(job.run.endedAt || job.run.startedAt)
                      : 'No completed run'}
                  </MqText>
                </Box>
                <MqText font='mono'>{table}</MqText>
                <IngestionRunSparkline job={job} table={table} task={task} />
                <Box>
                  <MqText subdued>
                    {activity?.runActivity ? 'RUN INGESTED' : 'DAILY SNAPSHOT'}
                  </MqText>
                  <MqText large>
                    {activity === undefined ? 'N/A' : activity.count.toLocaleString('en-US')}
                  </MqText>
                </Box>
                <MqStatus color={status.color} label={status.label} />
              </Box>
            </Box>
          )
        })}
    </Container>
  )
}

export default Ingestion
