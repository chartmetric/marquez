// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import {
  ActivityJob,
  getRowObservations,
  getRunActivityCount,
} from '../../helpers/ingestionActivity'
import { Box } from '@mui/material'
import { Run } from '../../types/api'
import { formatUpdatedAt } from '../../helpers'
import { theme } from '../../helpers/theme'
import MQTooltip from '../core/tooltip/MQTooltip'
import MqText from '../core/text/MqText'
import React from 'react'

interface IngestionRunSparklineProps {
  backend: string
  job: ActivityJob
  table: string
  task: string
}

const SPARKLINE_RUNS = 10

const IngestionRunSparkline: React.FC<IngestionRunSparklineProps> = ({
  backend,
  job,
  table,
  task,
}) => {
  const points = [...job.runs.slice(0, SPARKLINE_RUNS)]
    .reverse()
    .map((run) => ({
      count: getRunActivityCount(getRowObservations(run, table, task, job.name, backend)),
      run,
    }))
    .filter((point): point is { count: number; run: Run } => point.count !== undefined)
  const maxCount = Math.max(...points.map((point) => point.count), 1)

  if (!points.length) return <MqText subdued>Waiting for run metrics</MqText>

  return (
    <Box display='flex' height={44} alignItems='flex-end'>
      {points.map(({ count, run }) => (
        <MQTooltip
          key={run.id}
          title={
            <>
              <MqText bold>{formatUpdatedAt(run.endedAt || run.startedAt)}</MqText>
              <MqText>{`${count.toLocaleString('en-US')} rows`}</MqText>
              <MqText subdued>Run ingestion</MqText>
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
  )
}

export default IngestionRunSparkline
