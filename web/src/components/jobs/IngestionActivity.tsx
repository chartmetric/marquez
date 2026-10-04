// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { Box, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import {
  IngestionActivityFacet,
  IngestionActivityObservation,
  getObservationBackend,
} from '../../helpers/ingestionActivity'
import { theme } from '../../helpers/theme'
import MqStatus from '../core/status/MqStatus'
import MqText from '../core/text/MqText'
import React from 'react'

interface IngestionActivityProps {
  backend?: string
  facet?: IngestionActivityFacet
  observations?: IngestionActivityObservation[]
  table?: string
  task?: string
}

const formatCount = (value?: number) =>
  typeof value === 'number' ? Math.round(value).toLocaleString('en-US') : 'N/A'

const formatDate = (value?: string) => (value ? value.substring(0, 10) : 'N/A')

const formatRatio = (actual?: number, baseline?: number) => {
  if (typeof actual !== 'number' || typeof baseline !== 'number' || baseline === 0) {
    return 'N/A'
  }
  return `${Math.round((actual / baseline) * 100)}%`
}

const observationStatus = (observation: IngestionActivityObservation) => {
  if (observation.status === 'error' || observation.volume_expectation_error) {
    return { color: theme.palette.error.main, label: 'ERROR' }
  }
  if (observation.passed === false) {
    return { color: theme.palette.warning.main, label: 'LOW' }
  }
  if (observation.passed === true) {
    return { color: theme.palette.primary.main, label: 'NORMAL' }
  }
  return { color: theme.palette.info.main, label: 'OBSERVING' }
}

const IngestionActivity: React.FC<IngestionActivityProps> = ({
  backend,
  facet,
  observations: activityObservations,
  table,
  task,
}) => {
  const observations = (activityObservations || facet?.observations || []).filter(
    (observation) =>
      (!table || observation.expectation?.table === table) &&
      (!backend || getObservationBackend(observation) === backend) &&
      (!task || !observation.run_activity?.task_id || observation.run_activity.task_id === task)
  )

  if (observations.length === 0) {
    return null
  }

  return (
    <Box mt={2} data-testid='ingestion-activity'>
      <Box mb={1}>
        <MqText subheading>DAILY COMPLETENESS HISTORY</MqText>
        <MqText subdued>
          Recent completed days compared with each table&apos;s active-day baseline.
        </MqText>
      </Box>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell align='left'>
              <MqText subheading inline>
                TABLE
              </MqText>
            </TableCell>
            <TableCell align='left'>
              <MqText subheading inline>
                DATA DATE
              </MqText>
            </TableCell>
            <TableCell align='right'>
              <MqText subheading inline>
                ROWS
              </MqText>
            </TableCell>
            <TableCell align='right'>
              <MqText subheading inline>
                BASELINE
              </MqText>
            </TableCell>
            <TableCell align='right'>
              <MqText subheading inline>
                VS BASELINE
              </MqText>
            </TableCell>
            <TableCell align='left'>
              <MqText subheading inline>
                STATUS
              </MqText>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {observations.map((observation, index) => {
            const status = observationStatus(observation)
            return (
              <TableRow
                key={`${getObservationBackend(observation)}-${
                  observation.expectation?.table || 'unknown'
                }-${index}`}
              >
                <TableCell align='left'>
                  <MqText font='mono'>{observation.expectation?.table || 'N/A'}</MqText>
                  <MqText subdued small>
                    {getObservationBackend(observation)}
                  </MqText>
                  {observation.error && (
                    <MqText color={theme.palette.error.main}>{observation.error}</MqText>
                  )}
                  {observation.volume_expectation_error && (
                    <MqText color={theme.palette.error.main}>
                      {observation.volume_expectation_error}
                    </MqText>
                  )}
                </TableCell>
                <TableCell align='left'>{formatDate(observation.expected_date)}</TableCell>
                <TableCell align='right'>{formatCount(observation.actual_count)}</TableCell>
                <TableCell align='right'>{formatCount(observation.baseline_avg)}</TableCell>
                <TableCell align='right'>
                  {formatRatio(observation.actual_count, observation.baseline_avg)}
                </TableCell>
                <TableCell align='left'>
                  <MqStatus color={status.color} label={status.label} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

export default IngestionActivity
