// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { BarChart } from '@mui/x-charts'
import { Box } from '@mui/material'
import {
  IngestionActivityObservation,
  getIngestionFacet,
  getObservationBackend,
} from '../../helpers/ingestionActivity'
import { Run } from '../../types/api'
import MqText from '../core/text/MqText'
import ParentSize from '@visx/responsive/lib/components/ParentSize'
import React from 'react'

interface IngestionTrendProps {
  backend?: string
  runs: Run[]
  table?: string
  task?: string
}

interface TrendPoint extends IngestionActivityObservation {
  runId: string
  timestamp?: string
}

const DETAIL_RUNS = 20

const pointCount = (point: TrendPoint) => point.run_activity?.ingested_count ?? 0

const formatTimestamp = (timestamp?: string) =>
  timestamp
    ? new Date(timestamp).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown'

const IngestionTrend: React.FC<IngestionTrendProps> = ({
  backend: selectedBackend,
  runs,
  table: selectedTable,
  task: selectedTask,
}) => {
  const series = new Map<string, TrendPoint[]>()

  ;[...runs.slice(0, DETAIL_RUNS)].reverse().forEach((run) => {
    getIngestionFacet(run)?.observations?.forEach((observation) => {
      const table = observation.expectation?.table || 'unknown'
      if (selectedTable && table !== selectedTable) return
      if (selectedBackend && getObservationBackend(observation) !== selectedBackend) return
      if (
        selectedTask &&
        observation.run_activity?.task_id &&
        observation.run_activity.task_id !== selectedTask
      )
        return
      if (typeof observation.run_activity?.ingested_count !== 'number') return
      const backend = getObservationBackend(observation)
      const seriesKey = `${backend}:${table}`
      series.set(seriesKey, [
        ...(series.get(seriesKey) || []),
        { ...observation, runId: run.id, timestamp: run.endedAt || run.startedAt },
      ])
    })
  })

  if (series.size === 0) {
    return (
      <Box mt={2} border={1} borderColor='divider' borderRadius={1} p={3} minHeight={280}>
        <MqText subheading>RECENT RUN ACTIVITY</MqText>
        <Box height={200} display='flex' alignItems='center' justifyContent='center'>
          <MqText subdued>Waiting for task-level run metrics.</MqText>
        </Box>
      </Box>
    )
  }

  return (
    <Box mt={2} border={1} borderColor='divider' borderRadius={1} p={2}>
      <MqText subheading>RECENT RUN ACTIVITY</MqText>
      <MqText subdued>Rows ingested during each of the latest 20 task execution windows.</MqText>
      {[...series.entries()].map(([seriesKey, points]) => {
        const backend = getObservationBackend(points[0])
        const table = points[0].expectation?.table || 'unknown'
        const slots: Array<TrendPoint | undefined> = [
          ...points,
          ...Array<undefined>(DETAIL_RUNS - points.length).fill(undefined),
        ]
        return (
          <Box key={seriesKey} mt={1}>
            <MqText subdued small>{`${points.length} OF ${DETAIL_RUNS} RUNS REPORTING`}</MqText>
            <Box height={300}>
              <ParentSize>
                {(parent) => (
                  <BarChart
                    width={parent.width}
                    height={parent.height}
                    series={[
                      {
                        data: slots.map((point) => (point ? pointCount(point) : null)),
                        label: `${backend} · ${table}`,
                        valueFormatter: (value) =>
                          value === null ? '' : `${value.toLocaleString('en-US')} rows`,
                      },
                    ]}
                    xAxis={[
                      {
                        data: slots.map((point, index) =>
                          point ? formatTimestamp(point.timestamp) : `empty-${index}`
                        ),
                        scaleType: 'band',
                        valueFormatter: (value) => (value.startsWith('empty-') ? '' : value),
                      },
                    ]}
                    margin={{ left: 80, right: 24, top: 32, bottom: 52 }}
                  />
                )}
              </ParentSize>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

export default IngestionTrend
