import { useMainSidebar } from '@mastra/playground-ui/components/MainSidebar';
import { DropdownMenu } from '@mastra/playground-ui/components/DropdownMenu';
import { Txt } from '@mastra/playground-ui/components/Txt';
import { Check, ChevronsUpDown, Factory as FactoryIcon, Folder, Plus } from 'lucide-react';

import { deriveProjectPath } from '../../../../../shared/hooks/useWorkspaces';
import { useOverlays } from '../../../lib/overlays';
import { useActiveFactoryContext } from '../context/ActiveFactoryProvider';
import { isServerFactory } from '../services/factories';

/** Inline factory selection with a single Create Factory action. */
export function FactorySwitcher() {
  const { factories, activeFactory, selectFactory } = useActiveFactoryContext();
  const overlays = useOverlays();
  const { setOpenMobile } = useMainSidebar();

  const openFactories = () => {
    overlays.open('factories');
    setOpenMobile(false);
  };
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        id="factory-switcher-trigger"
        aria-label="Select factory"
        className="border-border1 hover:bg-surface3 flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left"
      >
        <Folder size={16} className="text-icon3 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <Txt as="span" variant="ui-sm" className="text-icon6 truncate">
            {activeFactory?.name ?? 'Select a factory…'}
          </Txt>
          {activeFactory && (
            <Txt as="span" variant="ui-xs" className="text-icon3 truncate">
              {deriveProjectPath(activeFactory)}
            </Txt>
          )}
        </span>
        <ChevronsUpDown size={13} className="text-icon3 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" className="w-64">
        {factories.map(factory => (
          <DropdownMenu.Item key={factory.id} onSelect={() => void selectFactory(factory)}>
            {isServerFactory(factory) ? <FactoryIcon /> : <Folder />}
            <span className="min-w-0 flex-1 truncate">{factory.name}</span>
            {factory.id === activeFactory?.id && <Check aria-label="Active factory" />}
          </DropdownMenu.Item>
        ))}
        {factories.length > 0 && <DropdownMenu.Separator />}
        <DropdownMenu.Item onSelect={openFactories}>
          <Plus />
          <span>Create Factory</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
