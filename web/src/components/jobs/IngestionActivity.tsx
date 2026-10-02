// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { Box, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { theme } from '../../helpers/theme'
import MqStatus from '../core/status/MqStatus'
import MqText from '../core/text/MqText'
import React from 'react'

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
    timestamp_column?: string
    window_end?: string
    window_start?: string
  }
  status?: string
}

export interface IngestionActivityFacet {
  observations?: IngestionActivityObservation[]
}

interface IngestionActivityProps {
  facet?: IngestionActivityFacet
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
  if (observation.status === 'error') {
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

const IngestionActivity: React.FC<IngestionActivityProps> = ({ facet }) => {
  const observations = facet?.observations || []

  if (observations.length === 0) {
    return null
  }

  return (
    <Box mt={2} data-testid='ingestion-activity'>
      <Box mb={1}>
        <MqText subheading>DAILY COMPLETENESS</MqText>
        <MqText subdued>Completed-day volume compared with the recent active-day baseline.</MqText>
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
              <TableRow key={`${observation.expectation?.table || 'unknown'}-${index}`}>
                <TableCell align='left'>
                  <MqText font='mono'>{observation.expectation?.table || 'N/A'}</MqText>
                  {observation.error && (
                    <MqText color={theme.palette.error.main}>{observation.error}</MqText>
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
