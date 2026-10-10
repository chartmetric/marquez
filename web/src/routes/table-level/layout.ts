import { Edge, Node as ElkNode } from '../../../libs/graph'
import { LineageGraph } from '../../types/api'

import {
  ColumnChangePreview,
  DatasetRelationship,
  columnChangesFromFacets,
  getDatasetRelationship,
} from '../../helpers/lineage'
import { JobOrDataset, LineageDataset, LineageJob, LineageNode } from '../../types/lineage'
import { Nullable } from '../../types/util/Nullable'
import { TableLevelNodeData } from './nodes'
import { theme } from '../../helpers/theme'

/**
 * Recursively trace the `inEdges` and `outEdges` of the current node to find all connected downstream column nodes
 * @param lineageGraph
 * @param currentGraphNode
 */
export const findDownstreamNodes = (
  lineageGraph: LineageGraph,
  currentGraphNode: Nullable<string>
): LineageNode[] => {
  if (!currentGraphNode) return []
  const currentNode = lineageGraph.graph.find((node) => node.id === currentGraphNode)
  if (!currentNode) return []
  const connectedNodes: LineageNode[] = []
  const visitedNodes: string[] = []
  const queue: LineageNode[] = [currentNode]

  while (queue.length) {
    const currentNode = queue.shift()
    if (!currentNode) continue
    if (visitedNodes.includes(currentNode.id)) continue
    visitedNodes.push(currentNode.id)
    connectedNodes.push(currentNode)
    queue.push(
      ...currentNode.outEdges
        .map((edge) => lineageGraph.graph.find((n) => n.id === edge.destination))
        .filter((item): item is LineageNode => !!item)
    )
  }
  return connectedNodes
}
/**
 * Recursively trace the `inEdges` and `outEdges` of the current node to find all connected upstream column nodes
 * @param lineageGraph
 * @param currentGraphNode
 */
export const findUpstreamNodes = (
  lineageGraph: LineageGraph,
  currentGraphNode: Nullable<string>
): LineageNode[] => {
  if (!currentGraphNode) return []
  const currentNode = lineageGraph.graph.find((node) => node.id === currentGraphNode)
  if (!currentNode) return []
  const connectedNodes: LineageNode[] = []
  const visitedNodes: string[] = []
  const queue: LineageNode[] = [currentNode]

  while (queue.length) {
    const currentNode = queue.shift()
    if (!currentNode) continue
    if (visitedNodes.includes(currentNode.id)) continue
    visitedNodes.push(currentNode.id)
    connectedNodes.push(currentNode)
    queue.push(
      ...currentNode.inEdges
        .map((edge) => lineageGraph.graph.find((n) => n.id === edge.origin))
        .filter((item): item is LineageNode => !!item)
    )
  }
  return connectedNodes
}

export const createElkNodes = (
  lineageGraph: LineageGraph,
  currentGraphNode: Nullable<string>,
  isCompact: boolean,
  isFull: boolean,
  collapsedNodes: Nullable<string>,
  columnChanges: ColumnChangePreview[] = []
) => {
  const downstreamNodes = findDownstreamNodes(lineageGraph, currentGraphNode)
  const upstreamNodes = findUpstreamNodes(lineageGraph, currentGraphNode)

  const nodes: ElkNode<JobOrDataset, TableLevelNodeData>[] = []
  const edges: Edge[] = []

  const collapsedNodesAsArray = collapsedNodes?.split(',')

  const filteredGraph = lineageGraph.graph
    .filter((node) => {
      if (isFull) return true
      return (
        downstreamNodes.includes(node) ||
        upstreamNodes.includes(node) ||
        node.id === currentGraphNode
      )
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === 'DATASET' ? -1 : 1
      return left.data.name.localeCompare(right.data.name)
    })

  const selectedNode = filteredGraph.find((candidate) => candidate.id === currentGraphNode)
  const visibleJobIds = new Set(
    filteredGraph.filter((candidate) => candidate.type === 'JOB').map((candidate) => candidate.id)
  )

  for (const node of filteredGraph) {
    let relationship: DatasetRelationship | undefined
    if (node.type === 'DATASET' && currentGraphNode) {
      if (selectedNode?.type === 'JOB') {
        relationship = getDatasetRelationship(node, currentGraphNode)
      } else {
        const isRead = node.outEdges.some((edge) => visibleJobIds.has(edge.destination))
        const isWrite = node.inEdges.some((edge) => visibleJobIds.has(edge.origin))
        relationship =
          isRead && isWrite ? 'READ + WRITE' : isRead ? 'READ' : isWrite ? 'WRITE' : undefined
      }
    }
    edges.push(
      ...node.outEdges
        .filter((edge) => filteredGraph.find((n) => n.id === edge.destination))
        .map((edge) => {
          const destination = filteredGraph.find((candidate) => candidate.id === edge.destination)
          const reciprocal = destination?.outEdges.some(
            (candidate) => candidate.destination === edge.origin
          )
          const isRead = node.type === 'DATASET' && destination?.type === 'JOB'

          // Keep one edge for a read-write pair. This avoids an ELK cycle while
          // preserving both semantics on the edge regardless of which node was selected.
          if (reciprocal && isRead) return null

          return {
            id: `${edge.origin}:${edge.destination}`,
            sourceNodeId: edge.origin,
            targetNodeId: edge.destination,
            color:
              downstreamNodes.includes(node) || upstreamNodes.includes(node)
                ? theme.palette.primary.main
                : theme.palette.grey[400],
          }
        })
        .filter((edge): edge is NonNullable<typeof edge> => edge !== null)
    )

    if (node.type === 'JOB') {
      nodes.push({
        id: node.id,
        kind: node.type,
        width: 112,
        height: 24,
        data: {
          job: node.data as LineageJob,
        },
      })
    } else if (node.type === 'DATASET') {
      const data = node.data as LineageDataset
      const storedColumnChanges = columnChangesFromFacets(data.facets, data.name)
      const previewColumnChanges = columnChanges.filter(
        (change) => change.targetDataset === data.name
      )
      const datasetColumnChanges = storedColumnChanges.length
        ? storedColumnChanges
        : previewColumnChanges
      const isCollapsed = isCompact || collapsedNodesAsArray?.includes(node.id)
      nodes.push({
        id: node.id,
        kind: node.type,
        // Keep dataset columns stable and leave enough room for the longest
        // relationship badge (READ + WRITE) plus the collapse control.
        width: 176,
        height: isCollapsed
          ? 24
          : 34 + data.fields.length * 10 + (datasetColumnChanges.length ? 12 : 0),
        data: {
          dataset: data,
          relationship,
          columnChanges: datasetColumnChanges,
        },
      })
    }
  }
  return { nodes, edges }
}
