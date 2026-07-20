import { Card, CardContent, CardFooter, CardHeader } from '@mastra/playground-ui/components/Card';
import { nodeColor, Sankey, SankeyChart } from '@mastra/playground-ui/components/SankeyChart';
import type { SankeyChartColumn, SankeyChartRecord } from '@mastra/playground-ui/components/SankeyChart';
import { getSignalHue, SignalsOverviewPage as SignalsEmptyState } from '@mastra/playground-ui/ee/signals';
import { ExternalLink } from 'lucide-react';

import { useThemeFlow } from './hooks/use-theme-flow';
import { useThemeSnapshots } from './hooks/use-theme-snapshots';
import { buildSignalGraphSummary } from './sankey-signals-data';
import type { SignalGraphNodeSummary, SignalGraphStageSummary } from './sankey-signals-data';
import type { TraceSignalName } from './types';
import { Link } from '@/lib/link';

const SIGNAL_ORDER: TraceSignalName[] = ['goal', 'outcome', 'behavior', 'sentiment'];
const SIGNAL_DOCS_URL = 'https://mastra.ai/en/docs/observability/tracing/overview';

export interface SankeySignalsProps {
  entityId: string;
  entityType?: string;
  signalNames: TraceSignalName[];
  height?: number;
}

function formatSignalName(signalName: TraceSignalName) {
  return signalName.charAt(0).toUpperCase() + signalName.slice(1);
}

function traceLabel(count: number) {
  return `${count} ${count === 1 ? 'trace' : 'traces'}`;
}

function SignalDistribution({
  signalName,
  traceCount,
  nodes,
}: {
  signalName: TraceSignalName;
  traceCount: number;
  nodes: SignalGraphNodeSummary[];
}) {
  const label = formatSignalName(signalName);
  const color = nodeColor(getSignalHue(signalName));

  return (
    <Card aria-label={`${label} distribution`} as="article" className="min-w-0" elevation="elevated">
      <CardHeader className="border-border1 border-b px-4 py-3">
        <h3 className="font-mono text-xs font-semibold tracking-wider" style={{ color }}>
          {label.toUpperCase()}
        </h3>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <p className="text-neutral3 font-mono text-[10px] tracking-wider">{traceLabel(traceCount)}</p>
        <div
          aria-label={`${label} stacked distribution`}
          className="bg-surface4 flex h-1.5 overflow-hidden rounded-sm"
          data-testid="distribution-stack"
        >
          {nodes.map((node, index) => (
            <span
              key={node.nodeId}
              aria-hidden="true"
              className="h-full"
              style={{
                backgroundColor: color,
                opacity: Math.max(0.35, 1 - index * 0.2),
                width: `${Math.min(node.stageShare * 100, 100)}%`,
              }}
            />
          ))}
        </div>
        <ul className="space-y-2.5">
          {nodes.length > 0 ? (
            nodes.map((node, index) => (
              <li key={node.nodeId} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                <span className="text-neutral5 flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: color, opacity: Math.max(0.35, 1 - index * 0.2) }}
                  />
                  <span className="truncate" title={node.label}>
                    {node.label}
                  </span>
                </span>
                <span className="text-neutral3 shrink-0 font-mono">
                  {node.traceCount} · {Math.round(node.stageShare * 100)}%
                </span>
              </li>
            ))
          ) : (
            <li className="text-neutral3 text-xs">No themes detected</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

function SignalDistributions({ stages }: { stages: SignalGraphStageSummary[] }) {
  return (
    <section aria-label="Signal distributions" className="grid grid-cols-4 gap-3">
      {SIGNAL_ORDER.map(signalName => {
        const stage = stages.find(currentStage => currentStage.signalName === signalName);
        return (
          <SignalDistribution
            key={signalName}
            signalName={signalName}
            traceCount={stage?.traceCount ?? 0}
            nodes={stage?.nodes ?? []}
          />
        );
      })}
    </section>
  );
}

function FlowCard({
  columns,
  records,
  stages,
  height,
}: {
  columns: SankeyChartColumn[];
  records: SankeyChartRecord[];
  stages: SignalGraphStageSummary[];
  height?: number;
}) {
  const chartColumns = columns.map(column => {
    const stage = stages.find(currentStage => currentStage.signalName === column.id);
    const clusterCount = stage?.nodes.length ?? 0;
    return {
      ...column,
      label: `${column.label.toUpperCase()} ${clusterCount} ${clusterCount === 1 ? 'cluster' : 'clusters'}`,
    };
  });

  return (
    <Card aria-label="Signal theme flow" as="section" className="overflow-hidden" elevation="elevated">
      <CardContent className="px-0 py-4">
        <Sankey
          data={records}
          columns={chartColumns}
          getColumnHue={column => getSignalHue(column.id)}
          getRecordWeight={record => Number(record.traceCount)}
        >
          <SankeyChart height={height ?? 680} margin={{ top: 64, right: 160, bottom: 48, left: 160 }} />
        </Sankey>
      </CardContent>
      <CardFooter className="border-border1 bg-surface2 flex justify-between gap-6 border-t px-4 py-3">
        <div className="text-neutral3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] tracking-wider">
          <span>RIBBON WIDTH = TRACE COUNT</span>
          <span>HOVER OR FOCUS TO ISOLATE FLOW</span>
        </div>
        <ul
          aria-label="Signal stage legend"
          className="text-neutral3 flex shrink-0 items-center gap-4 text-xs"
          data-alignment="right"
        >
          {SIGNAL_ORDER.map(signalName => (
            <li key={signalName} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 rounded-[2px]"
                data-testid="signal-legend-swatch"
                style={{ backgroundColor: nodeColor(getSignalHue(signalName)) }}
              />
              {formatSignalName(signalName)}
            </li>
          ))}
        </ul>
      </CardFooter>
    </Card>
  );
}

export function SankeySignals({ entityId, entityType = 'agent', signalNames, height }: SankeySignalsProps) {
  const snapshotsQuery = useThemeSnapshots(entityId, entityType, signalNames);
  const snapshot = snapshotsQuery.data?.snapshots[0];
  const flowQuery = useThemeFlow(entityId, entityType, signalNames, snapshot?.snapshotId);

  if (snapshotsQuery.isPending || (snapshot && flowQuery.isPending)) {
    return (
      <section
        aria-label="Loading signal analysis"
        className="flex h-[640px] items-center justify-center"
        role="status"
      >
        <div className="border-border1 border-t-accent1 size-8 animate-spin rounded-full border-2" />
      </section>
    );
  }

  if (snapshotsQuery.isError || flowQuery.isError) {
    return <div className="p-6 text-sm text-red-500">Unable to load signal flow.</div>;
  }

  const flow = flowQuery.data;
  const populatedStageCount = flow?.stages.filter(stage => stage.nodes.length > 0).length ?? 0;

  if (!snapshot || !flow || populatedStageCount < 2) {
    return <SignalsEmptyState LinkComponent={Link} />;
  }

  const graphSummary = buildSignalGraphSummary(flow);
  const clusterCount = graphSummary.stages.reduce((total, stage) => total + stage.nodes.length, 0);

  return (
    <main className="space-y-7 p-6">
      <header className="flex items-start justify-between gap-8" data-testid="signals-page-header">
        <div className="max-w-2xl">
          <div className="text-neutral4 flex items-center gap-2 font-mono text-xs font-semibold tracking-widest">
            <span aria-hidden="true" className="bg-accent1 size-2 rounded-full" />
            SIGNALS
          </div>
          <h1 className="text-neutral6 mt-3 text-2xl font-semibold">Understand what drives every agent interaction</h1>
          <p className="text-neutral3 mt-2 text-sm leading-6">
            Signals group recurring patterns across traces so you can see how goals, outcomes, behaviors, and sentiment
            connect.
          </p>
          <ul aria-label="Signal analysis metrics" className="mt-5 flex flex-wrap gap-2">
            <li className="border-border1 bg-surface2 text-neutral4 rounded-md border px-3 py-1.5 text-xs">
              {traceLabel(graphSummary.analyzedTraceCount)} analyzed
            </li>
            <li className="border-border1 bg-surface2 text-neutral4 rounded-md border px-3 py-1.5 text-xs">
              {clusterCount} clusters
            </li>
            <li className="border-border1 bg-surface2 text-neutral4 rounded-md border px-3 py-1.5 text-xs">
              {flow.stages.length} signal types
            </li>
          </ul>
        </div>
        <a
          className="text-neutral4 hover:text-neutral6 flex shrink-0 items-center gap-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          href={SIGNAL_DOCS_URL}
          rel="noreferrer"
          target="_blank"
        >
          Signals documentation
          <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      </header>
      <div className="overflow-x-auto" data-scroll-container="horizontal" data-testid="signals-analysis-scroll">
        <div className="min-w-[920px] space-y-4" data-min-width="920" data-testid="signals-analysis-canvas">
          <FlowCard
            columns={graphSummary.columns}
            records={graphSummary.records}
            stages={graphSummary.stages}
            height={height}
          />
          <SignalDistributions stages={graphSummary.stages} />
        </div>
      </div>
    </main>
  );
}
