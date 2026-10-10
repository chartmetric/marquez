import { JobOrDataset, LineageDataset, LineageJob } from '../../types/lineage'
import { NodeRendererMap } from '../../../libs/graph'
import TableLineageDatasetNode from './TableLineageDatasetNode'
import TableLineageJobNode from './TableLineageJobNode'
import { ColumnChangePreview, DatasetRelationship } from '../../helpers/lineage'

export interface TableLineageJobNodeData {
  job: LineageJob
}

export interface TableLineageDatasetNodeData {
  dataset: LineageDataset
  relationship?: DatasetRelationship
  columnChanges?: ColumnChangePreview[]
}

export type TableLevelNodeData = TableLineageDatasetNodeData | TableLineageJobNodeData

export const tableLevelNodeRenderer: NodeRendererMap<JobOrDataset, TableLevelNodeData> = new Map()
  .set('JOB', TableLineageJobNode)
  .set('DATASET', TableLineageDatasetNode)
