// Copyright 2018-2024 contributors to the Marquez project
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import IngestionActivity from '../../components/jobs/IngestionActivity'
import React from 'react'

describe('IngestionActivity', () => {
  it('renders activity using the existing Marquez table and status patterns', () => {
    render(
      <IngestionActivity
        facet={{
          observations: [
            {
              actual_count: 1048930,
              baseline_avg: 1047865.8,
              expectation: { table: 'acr_track_stat' },
              expected_date: '2026-10-01T00:00:00',
              passed: true,
              status: 'observing',
            },
          ],
        }}
      />
    )

    expect(screen.getByText('DAILY COMPLETENESS HISTORY')).toBeTruthy()
    expect(screen.getByText('acr_track_stat')).toBeTruthy()
    expect(screen.getByText('1,048,930')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('NORMAL')).toBeTruthy()
  })

  it('does not render without observations', () => {
    const { container } = render(<IngestionActivity facet={{ observations: [] }} />)

    expect(container.childElementCount).toBe(0)
  })
})
