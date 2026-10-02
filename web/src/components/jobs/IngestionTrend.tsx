// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { Box } from '@mui/material'
import { IngestionActivityFacet, IngestionActivityObservation } from './IngestionActivity'
import { Run } from '../../types/api'
import { theme } from '../../helpers/theme'
import MQTooltip from '../core/tooltip/MQTooltip'
import MqText from '../core/text/MqText'
import React from 'react'

interface IngestionTrendProps {
  runs: Run[]
}

interface TrendPoint extends IngestionActivityObservation {
  runId: string
}

const FACET_NAME = 'chartmetric_ingestionActivity'
const BAR_HEIGHT = 48

const getFacet = (run: Run) => {
  const facets = run.facets as { [key: string]: object }
  return facets?.[FACET_NAME] as IngestionActivityFacet | undefined
}

const pointColor = (point: TrendPoint) => {
  if (point.run_activity?.status === 'error') {
    return theme.palette.error.main
  }
  return theme.palette.primary.main
}

const IngestionTrend: React.FC<IngestionTrendProps> = ({ runs }) => {
  const series = new Map<string, TrendPoint[]>()

  ;[...runs].reverse().forEach((run) => {
    getFacet(run)?.observations?.forEach((observation) => {
      const table = observation.expectation?.table || 'unknown'
      if (observation.run_activity) {
        series.set(table, [...(series.get(table) || []), { ...observation, runId: run.id }])
      }
    })
  })

  if (series.size === 0) {
    return null
  }

  return (
    <Box mt={2}>
      <MqText subheading>RECENT INGESTION</MqText>
      {[...series.entries()].map(([table, points]) => {
        const maxCount = Math.max(
          ...points.map((point) => point.run_activity?.ingested_count || 0),
          1
        )
        return (
          <Box key={table} display='flex' alignItems='flex-end' mt={1} mb={2}>
            <Box width={220} mr={2}>
              <MqText font='mono'>{table}</MqText>
              <MqText subdued small>{`LAST ${points.length} OBSERVATIONS`}</MqText>
            </Box>
            <Box display='flex' height={BAR_HEIGHT} alignItems='flex-end'>
              {points.map((point) => (
                <MQTooltip
                  key={point.runId}
                  title={
                    <>
                      <MqText subdued small>
                        WINDOW
                      </MqText>
                      <MqText bold>
                        {point.run_activity?.window_start
                          ? new Date(point.run_activity.window_start).toLocaleString()
                          : 'Unknown'}
                      </MqText>
                      <MqText>
                        {point.run_activity?.window_end
                          ? new Date(point.run_activity.window_end).toLocaleString()
                          : 'Unknown'}
                      </MqText>
                      <MqText>
                        {(point.run_activity?.ingested_count || 0).toLocaleString('en-US')} rows
                      </MqText>
                    </>
                  }
                >
                  <Box
                    bgcolor={pointColor(point)}
                    height={Math.max(
                      ((point.run_activity?.ingested_count || 0) / maxCount) * BAR_HEIGHT,
                      2
                    )}
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
      })}
    </Box>
  )
}

export default IngestionTrend
