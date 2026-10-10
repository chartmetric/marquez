// Copyright 2018-2023 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import * as Redux from 'redux'
import {
  Button,
  Chip,
  Container,
  FormControl,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  createTheme,
} from '@mui/material'
import { Dataset, Namespace } from '../../types/api'
import { HEADER_HEIGHT } from '../../helpers/theme'
import { IState } from '../../store/reducers'
import { MqScreenLoad } from '../../components/core/screen-load/MqScreenLoad'
import { Refresh } from '@mui/icons-material'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import {
  datasetFacetsQualityAssertions,
  datasetFacetsStatus,
  encodeNode,
} from '../../helpers/nodes'
import { fetchDatasets, resetDatasets } from '../../store/actionCreators'
import { formatUpdatedAt } from '../../helpers'
import { getDatasetDisplayName, getNamespaceDisplayName } from '../../helpers/lineage'
import { truncateText } from '../../helpers/text'
import { useSearchParams } from 'react-router-dom'
import { useTheme } from '@emotion/react'
import Assertions from '../../components/datasets/Assertions'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MQTooltip from '../../components/core/tooltip/MQTooltip'
import MqEmpty from '../../components/core/empty/MqEmpty'
import MqPaging from '../../components/paging/MqPaging'
import MqStatus from '../../components/core/status/MqStatus'
import MqText from '../../components/core/text/MqText'
import React from 'react'

interface StateProps {
  datasets: Dataset[]
  isDatasetsLoading: boolean
  isDatasetsInit: boolean
  namespaces: Namespace[]
  totalCount: number
}

interface DatasetsState {
  page: number
}

interface DispatchProps {
  fetchDatasets: typeof fetchDatasets
  resetDatasets: typeof resetDatasets
}

type DatasetsProps = StateProps & DispatchProps

const PAGE_SIZE = 20
const DATASET_HEADER_HEIGHT = 64

const Datasets: React.FC<DatasetsProps> = ({
  datasets,
  totalCount,
  isDatasetsLoading,
  isDatasetsInit,
  namespaces,
  fetchDatasets,
  resetDatasets,
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const datasetNamespaces = namespaces.filter(
    (namespace) => namespace.name !== 'airflow-data-script' && namespace.name !== 'default'
  )
  const requestedNamespace = searchParams.get('namespace')
  const fallbackNamespace =
    datasetNamespaces.find((namespace) => namespace.name.startsWith('postgres://'))?.name ||
    datasetNamespaces[0]?.name ||
    ''
  const selectedNamespace = datasetNamespaces.some(
    (namespace) => namespace.name === requestedNamespace
  )
    ? requestedNamespace || fallbackNamespace
    : fallbackNamespace
  const queryPage = Number(searchParams.get('page'))
  const defaultState = {
    page: Number.isInteger(queryPage) && queryPage >= 0 ? queryPage : 0,
  }
  const [state, setState] = React.useState<DatasetsState>(defaultState)

  const theme = createTheme(useTheme())

  React.useEffect(() => {
    if (selectedNamespace) {
      fetchDatasets(selectedNamespace, PAGE_SIZE, state.page * PAGE_SIZE)
    }
  }, [selectedNamespace, state.page])

  React.useEffect(() => {
    if (selectedNamespace && requestedNamespace !== selectedNamespace) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('namespace', selectedNamespace)
      setSearchParams(nextParams, { replace: true })
    }
  }, [selectedNamespace, requestedNamespace])

  React.useEffect(() => {
    return () => {
      // on unmount
      resetDatasets()
    }
  }, [])

  const handleClickPage = (direction: 'prev' | 'next') => {
    const directionPage = direction === 'next' ? state.page + 1 : state.page - 1

    fetchDatasets(selectedNamespace || '', PAGE_SIZE, directionPage * PAGE_SIZE)
    // reset page scroll
    window.scrollTo(0, 0)
    const nextParams = new URLSearchParams(searchParams)
    if (directionPage > 0) nextParams.set('page', String(directionPage))
    else nextParams.delete('page')
    setSearchParams(nextParams, { replace: true })
    setState({ ...state, page: directionPage })
  }

  const i18next = require('i18next')
  return (
    <Container maxWidth={'lg'} disableGutters>
      <Box p={2} display={'flex'} justifyContent={'space-between'} alignItems={'center'}>
        <Box>
          <Box display={'flex'}>
            <MqText heading>{i18next.t('datasets_route.heading')}</MqText>
            {!isDatasetsLoading && (
              <Chip
                size={'small'}
                variant={'outlined'}
                color={'primary'}
                sx={{ marginLeft: 1 }}
                label={totalCount + ' total'}
              ></Chip>
            )}
          </Box>
          <MqText subdued>Physical datasets grouped by database source.</MqText>
        </Box>
        <Box display={'flex'} alignItems={'center'}>
          {isDatasetsLoading && <CircularProgress size={16} />}
          <FormControl size='small' sx={{ minWidth: 280, ml: 2 }}>
            <Select
              aria-label='Dataset source'
              value={selectedNamespace}
              onChange={(event) => {
                const nextParams = new URLSearchParams(searchParams)
                nextParams.set('namespace', event.target.value)
                nextParams.delete('page')
                setState({ page: 0 })
                setSearchParams(nextParams)
              }}
              displayEmpty
            >
              {datasetNamespaces.map((namespace) => (
                <MenuItem key={namespace.name} value={namespace.name}>
                  {getNamespaceDisplayName(namespace.name)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <MQTooltip title={'Refresh'}>
            <IconButton
              sx={{ ml: 2 }}
              color={'primary'}
              size={'small'}
              onClick={() => {
                fetchDatasets(selectedNamespace, PAGE_SIZE, state.page * PAGE_SIZE)
              }}
            >
              <Refresh fontSize={'small'} />
            </IconButton>
          </MQTooltip>
        </Box>
      </Box>
      <MqScreenLoad
        loading={isDatasetsLoading && !isDatasetsInit}
        customHeight={`calc(100vh - ${HEADER_HEIGHT}px - ${DATASET_HEADER_HEIGHT}px)`}
      >
        <>
          {datasets.length === 0 ? (
            <Box p={2}>
              <MqEmpty title={i18next.t('datasets_route.empty_title')}>
                <>
                  <MqText subdued>{i18next.t('datasets_route.empty_body')}</MqText>
                  <Button
                    color={'primary'}
                    size={'small'}
                    onClick={() => {
                      if (selectedNamespace) {
                        fetchDatasets(selectedNamespace, PAGE_SIZE, state.page * PAGE_SIZE)
                      }
                    }}
                  >
                    Refresh
                  </Button>
                </>
              </MqEmpty>
            </Box>
          ) : (
            <>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell key={i18next.t('datasets_route.name_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.name_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('datasets_route.namespace_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.namespace_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('datasets_route.source_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.source_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('datasets_route.updated_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.updated_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('datasets_route.quality')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.quality')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('datasets.column_lineage_tab')} align='left'>
                      <MqText inline subheading>
                        COLUMN LINEAGE
                      </MqText>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {datasets
                    .filter((dataset) => !dataset.deleted)
                    .map((dataset) => {
                      const assertions = datasetFacetsQualityAssertions(dataset.facets)
                      return (
                        <TableRow key={dataset.name}>
                          <TableCell align='left'>
                            <MQTooltip title={dataset.name}>
                              <Box component='span'>
                                <MqText
                                  link
                                  linkTo={`/lineage/${encodeNode(
                                    'DATASET',
                                    dataset.namespace,
                                    dataset.name
                                  )}`}
                                >
                                  {truncateText(getDatasetDisplayName(dataset.name), 40)}
                                </MqText>
                              </Box>
                            </MQTooltip>
                          </TableCell>
                          <TableCell align='left'>
                            <MqText>{truncateText(dataset.namespace, 40)}</MqText>
                          </TableCell>
                          <TableCell align='left'>
                            <MqText>{dataset.sourceName}</MqText>
                          </TableCell>
                          <TableCell align='left'>
                            <MqText>{formatUpdatedAt(dataset.updatedAt)}</MqText>
                          </TableCell>
                          <TableCell align='left'>
                            {datasetFacetsStatus(dataset.facets) ? (
                              <>
                                <MQTooltip title={<Assertions assertions={assertions} />}>
                                  <Box>
                                    <MqStatus
                                      label={
                                        assertions.find((a) => !a.success) ? 'UNHEALTHY' : 'HEALTHY'
                                      }
                                      color={datasetFacetsStatus(dataset.facets)}
                                    />
                                  </Box>
                                </MQTooltip>
                              </>
                            ) : (
                              <MqStatus label={'N/A'} color={theme.palette.secondary.main} />
                            )}
                          </TableCell>
                          <TableCell>
                            {dataset.columnLineage ? (
                              <MqText
                                link
                                linkTo={`column-level/${encodeURIComponent(
                                  encodeURIComponent(dataset.id.namespace)
                                )}/${encodeURIComponent(dataset.id.name)}`}
                              >
                                VIEW
                              </MqText>
                            ) : (
                              <MqText subdued>N/A</MqText>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
              <MqPaging
                pageSize={PAGE_SIZE}
                currentPage={state.page}
                totalCount={totalCount}
                incrementPage={() => handleClickPage('next')}
                decrementPage={() => handleClickPage('prev')}
              />
            </>
          )}
        </>
      </MqScreenLoad>
    </Container>
  )
}

const mapStateToProps = (state: IState) => ({
  datasets: state.datasets.result,
  totalCount: state.datasets.totalCount,
  isDatasetsLoading: state.datasets.isLoading,
  isDatasetsInit: state.datasets.init,
  namespaces: state.namespaces.result,
})

const mapDispatchToProps = (dispatch: Redux.Dispatch) =>
  bindActionCreators(
    {
      fetchDatasets: fetchDatasets,
      resetDatasets: resetDatasets,
    },
    dispatch
  )

export default connect(mapStateToProps, mapDispatchToProps)(Datasets)
