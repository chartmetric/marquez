// Copyright 2018-2023 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import * as Redux from 'redux'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  Container,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material'
import { ExpandMore } from '@mui/icons-material'
import { HEADER_HEIGHT } from '../../helpers/theme'
import { IState } from '../../store/reducers'
import { Job } from '../../types/api'
import { JobsListRole, getJobsListRole } from '../../helpers/lineage'
import { MqScreenLoad } from '../../components/core/screen-load/MqScreenLoad'
import { Nullable } from '../../types/util/Nullable'
import { Refresh } from '@mui/icons-material'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'
import { encodeNode, runStateColor } from '../../helpers/nodes'
import { fetchJobs, resetJobs } from '../../store/actionCreators'
import { formatUpdatedAt } from '../../helpers'
import { stopWatchDuration } from '../../helpers/time'
import { truncateText } from '../../helpers/text'
import { useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MQTooltip from '../../components/core/tooltip/MQTooltip'
import MqEmpty from '../../components/core/empty/MqEmpty'
import MqPaging from '../../components/paging/MqPaging'
import MqStatus from '../../components/core/status/MqStatus'
import MqText from '../../components/core/text/MqText'
import NamespaceSelect from '../../components/namespace-select/NamespaceSelect'
import React from 'react'

interface StateProps {
  jobs: Job[]
  isJobsInit: boolean
  isJobsLoading: boolean
  selectedNamespace: Nullable<string>
  totalCount: number
}

interface JobsState {
  page: number
  roleFilters: JobsListRole[]
}

interface DispatchProps {
  fetchJobs: typeof fetchJobs
  resetJobs: typeof resetJobs
}

type JobsProps = StateProps & DispatchProps

const PAGE_SIZE = 20
const INITIAL_FETCH_LIMIT = 500
const JOB_HEADER_HEIGHT = 64
const INCLUDE_RUN_DETAILS = false

const jobRoleColor: Record<JobsListRole, 'primary' | 'secondary' | 'info' | 'warning' | 'default'> =
  {
    TASK: 'primary',
    VALIDATION: 'info',
    OBSERVER: 'warning',
    DAG: 'secondary',
    JOB: 'default',
  }

const Jobs: React.FC<JobsProps> = ({
  jobs,
  totalCount,
  isJobsLoading,
  isJobsInit,
  selectedNamespace,
  fetchJobs,
  resetJobs,
}) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const validRoles = Object.keys(jobRoleColor) as JobsListRole[]
  const queryRoles = (searchParams.get('types') || '')
    .split(',')
    .filter((role): role is JobsListRole => validRoles.includes(role as JobsListRole))
  const queryPage = Number(searchParams.get('page'))
  const defaultState = {
    page: Number.isInteger(queryPage) && queryPage >= 0 ? queryPage : 0,
    roleFilters: queryRoles,
  }
  const [state, setState] = React.useState<JobsState>(defaultState)
  const previousNamespace = React.useRef(selectedNamespace)

  const updateViewState = (nextState: JobsState) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextState.roleFilters.length) nextParams.set('types', nextState.roleFilters.join(','))
    else nextParams.delete('types')
    if (nextState.page > 0) nextParams.set('page', String(nextState.page))
    else nextParams.delete('page')
    setSearchParams(nextParams, { replace: true })
    setState(nextState)
  }

  const fetchJobsList = (limit = INITIAL_FETCH_LIMIT) => {
    if (!selectedNamespace) {
      return
    }
    fetchJobs(selectedNamespace, limit, 0, undefined, INCLUDE_RUN_DETAILS)
  }

  React.useEffect(() => {
    if (previousNamespace.current !== selectedNamespace) {
      previousNamespace.current = selectedNamespace
      updateViewState({ page: 0, roleFilters: state.roleFilters })
    }
    fetchJobsList()
  }, [selectedNamespace])

  React.useEffect(() => {
    if (!isJobsLoading && totalCount > jobs.length && totalCount > INITIAL_FETCH_LIMIT) {
      fetchJobsList(totalCount)
    }
  }, [isJobsLoading, jobs.length, totalCount])

  React.useEffect(() => {
    return () => {
      // on unmount
      resetJobs()
    }
  }, [])

  const handleClickPage = (direction: 'prev' | 'next') => {
    const directionPage = direction === 'next' ? state.page + 1 : state.page - 1

    // reset page scroll
    window.scrollTo(0, 0)
    updateViewState({ ...state, page: directionPage })
  }

  const filteredJobs = jobs.filter(
    (job) => !state.roleFilters.length || state.roleFilters.includes(getJobsListRole(job))
  )
  const visibleJobs = filteredJobs.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE)

  const toggleRoleFilter = (role: JobsListRole) => {
    const roleFilters = state.roleFilters.includes(role)
      ? state.roleFilters.filter((item) => item !== role)
      : [...state.roleFilters, role]
    updateViewState({ page: 0, roleFilters })
  }

  const i18next = require('i18next')
  return (
    <Container maxWidth={'lg'} disableGutters>
      <Box p={2} display={'flex'} justifyContent={'space-between'} alignItems={'center'}>
        <Box display={'flex'}>
          <MqText heading>{i18next.t('jobs_route.heading')}</MqText>
          {!isJobsLoading && (
            <Chip
              size={'small'}
              variant={'outlined'}
              color={'primary'}
              sx={{ marginLeft: 1 }}
              label={
                state.roleFilters.length
                  ? `${filteredJobs.length} of ${totalCount}`
                  : `${totalCount} total`
              }
            ></Chip>
          )}
        </Box>
        <Box display={'flex'} alignItems={'center'}>
          {isJobsLoading && <CircularProgress size={16} />}
          <NamespaceSelect kind='jobs' />
          <MQTooltip title={'Refresh'}>
            <IconButton
              sx={{ ml: 2 }}
              color={'primary'}
              size={'small'}
              onClick={() => {
                fetchJobsList(totalCount > INITIAL_FETCH_LIMIT ? totalCount : INITIAL_FETCH_LIMIT)
              }}
            >
              <Refresh fontSize={'small'} />
            </IconButton>
          </MQTooltip>
        </Box>
      </Box>
      <Accordion disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', mb: 1 }}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <MqText subheading>WHICH JOB SHOULD I OPEN?</MqText>
        </AccordionSummary>
        <AccordionDetails>
          <Box display='grid' gridTemplateColumns='auto minmax(0, 1fr)' gap={1.25}>
            {[
              ['TASK', 'Open for dataset lineage and the latest processing result.'],
              ['DAG', 'Parent container only; open one of its TASK rows instead.'],
              [
                'OBSERVER',
                'Publishes Ingestion Activity metrics; use the activity page for results.',
              ],
              ['VALIDATION', 'Checks freshness or health and usually has read-only lineage.'],
              ['JOB', 'Generic job; inspect its graph to determine whether lineage is available.'],
            ].map(([role, description]) => (
              <React.Fragment key={role}>
                <Chip
                  label={role}
                  color={jobRoleColor[role as JobsListRole]}
                  size='small'
                  variant='outlined'
                />
                <MqText subdued>{description}</MqText>
              </React.Fragment>
            ))}
          </Box>
        </AccordionDetails>
      </Accordion>
      <Box display='flex' alignItems='center' gap={1} px={1} py={1.5} flexWrap='wrap'>
        <MqText subdued>FILTER BY TYPE</MqText>
        <Chip
          label='ALL'
          size='small'
          color={state.roleFilters.length ? 'default' : 'primary'}
          variant={state.roleFilters.length ? 'outlined' : 'filled'}
          onClick={() => updateViewState({ page: 0, roleFilters: [] })}
        />
        {(Object.keys(jobRoleColor) as JobsListRole[]).map((role) => {
          const selected = state.roleFilters.includes(role)
          return (
            <Chip
              key={role}
              label={role}
              size='small'
              color={jobRoleColor[role]}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => toggleRoleFilter(role)}
            />
          )
        })}
      </Box>
      <MqScreenLoad
        loading={isJobsLoading && !isJobsInit}
        customHeight={`calc(100vh - ${HEADER_HEIGHT}px - ${JOB_HEADER_HEIGHT}px)`}
      >
        <>
          {filteredJobs.length === 0 ? (
            <Box p={2}>
              <MqEmpty title={i18next.t('jobs_route.empty_title')}>
                <>
                  <MqText subdued>{i18next.t('jobs_route.empty_body')}</MqText>
                  <Button
                    color={'primary'}
                    size={'small'}
                    onClick={() => {
                      fetchJobsList(
                        totalCount > INITIAL_FETCH_LIMIT ? totalCount : INITIAL_FETCH_LIMIT
                      )
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
                    <TableCell align='left'>
                      <MqText subheading>TYPE</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('jobs_route.name_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.name_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('jobs_route.namespace_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.namespace_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('jobs_route.updated_col')} align='left'>
                      <MqText subheading>{i18next.t('datasets_route.updated_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('jobs_route.latest_run_col')} align='left'>
                      <MqText subheading>{i18next.t('jobs_route.latest_run_col')}</MqText>
                    </TableCell>
                    <TableCell key={i18next.t('jobs_route.latest_run_state_col')} align='left'>
                      <MqText subheading>{i18next.t('jobs_route.latest_run_state_col')}</MqText>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleJobs.map((job) => {
                    const role = getJobsListRole(job)
                    return (
                      <TableRow key={job.name}>
                        <TableCell align='left'>
                          <Chip
                            label={role}
                            color={jobRoleColor[role]}
                            size='small'
                            variant='outlined'
                          />
                        </TableCell>
                        <TableCell align='left'>
                          <MQTooltip title={job.name}>
                            <Box component='span'>
                              <MqText
                                link
                                linkTo={`/lineage/${encodeNode('JOB', job.namespace, job.name)}`}
                              >
                                {truncateText(job.name, 40)}
                              </MqText>
                            </Box>
                          </MQTooltip>
                        </TableCell>
                        <TableCell align='left'>
                          <MqText>{truncateText(job.namespace, 40)}</MqText>
                        </TableCell>
                        <TableCell align='left'>
                          <MqText>{formatUpdatedAt(job.updatedAt)}</MqText>
                        </TableCell>
                        <TableCell align='left'>
                          <MqText>
                            {job.latestRun && job.latestRun.durationMs
                              ? stopWatchDuration(job.latestRun.durationMs)
                              : 'N/A'}
                          </MqText>
                        </TableCell>
                        <TableCell key={i18next.t('jobs_route.latest_run_col')} align='left'>
                          <MqStatus
                            color={job.latestRun && runStateColor(job.latestRun.state || 'NEW')}
                            label={
                              job.latestRun && job.latestRun.state ? job.latestRun.state : 'N/A'
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <MqPaging
                pageSize={PAGE_SIZE}
                currentPage={state.page}
                totalCount={filteredJobs.length}
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
  jobs: state.jobs.result,
  isJobsInit: state.jobs.init,
  isJobsLoading: state.jobs.isLoading,
  selectedNamespace: state.namespaces.selectedNamespace,
  totalCount: state.jobs.totalCount,
})

const mapDispatchToProps = (dispatch: Redux.Dispatch) =>
  bindActionCreators(
    {
      fetchJobs: fetchJobs,
      resetJobs: resetJobs,
    },
    dispatch
  )

export default connect(mapStateToProps, mapDispatchToProps)(Jobs)
