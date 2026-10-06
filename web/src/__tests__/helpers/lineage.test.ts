import { parseLineageDepth } from '../../helpers/lineage'

describe('parseLineageDepth', () => {
  it('preserves zero as the direct-lineage depth', () => {
    expect(parseLineageDepth('0', 2)).toBe(0)
  })

  it('uses the requested non-negative integer depth', () => {
    expect(parseLineageDepth('2', 0)).toBe(2)
  })

  it.each([null, '', ' ', '-1', '1.5', 'not-a-number'])(
    'uses the fallback for an invalid depth of %p',
    (value) => {
      expect(parseLineageDepth(value, 1)).toBe(1)
    }
  )
})
