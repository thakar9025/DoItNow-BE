import { BadRequestException } from '@nestjs/common';
import { AddonSelectionType, ServiceAddon, ServiceAddonGroup } from '@prisma/client';

export type AddonGroupWithAddons = ServiceAddonGroup & {
  addons: ServiceAddon[];
};

export type ValidatedBookingAddon = {
  addonId: string;
  label: string;
  price: number;
};

export function validateSelectedAddons(input: {
  groups: AddonGroupWithAddons[];
  selectedAddonIds: string[];
  basePrice: number;
}): { totalPrice: number; addons: ValidatedBookingAddon[] } {
  const activeGroups = input.groups.filter((group) => group.isActive);
  const addonById = new Map<string, { addon: ServiceAddon; group: AddonGroupWithAddons }>();

  for (const group of activeGroups) {
    for (const addon of group.addons.filter((item) => item.isActive)) {
      addonById.set(addon.id, { addon, group });
    }
  }

  const uniqueSelectedIds = Array.from(
    new Set(input.selectedAddonIds.map((id) => id.trim()).filter(Boolean)),
  );

  const selectedByGroup = new Map<string, ServiceAddon[]>();

  for (const addonId of uniqueSelectedIds) {
    const match = addonById.get(addonId);
    if (!match) {
      throw new BadRequestException('One or more selected add-ons are invalid for this service');
    }

    const existing = selectedByGroup.get(match.group.id) ?? [];
    existing.push(match.addon);
    selectedByGroup.set(match.group.id, existing);
  }

  for (const group of activeGroups) {
    const selectedCount = selectedByGroup.get(group.id)?.length ?? 0;
    const minRequired = group.isRequired
      ? Math.max(group.minSelection, 1)
      : group.minSelection;

    if (selectedCount < minRequired) {
      throw new BadRequestException(
        `Please select at least ${minRequired} option(s) for "${group.title}"`,
      );
    }

    if (group.maxSelection !== null && selectedCount > group.maxSelection) {
      throw new BadRequestException(
        `You can select at most ${group.maxSelection} option(s) for "${group.title}"`,
      );
    }

    if (
      group.selectionType === AddonSelectionType.SINGLE &&
      selectedCount > 1
    ) {
      throw new BadRequestException(
        `Only one option can be selected for "${group.title}"`,
      );
    }
  }

  const addons: ValidatedBookingAddon[] = [];
  let addonsTotal = 0;

  for (const selectedAddons of selectedByGroup.values()) {
    for (const addon of selectedAddons) {
      addons.push({
        addonId: addon.id,
        label: addon.label,
        price: addon.price,
      });
      addonsTotal += addon.price;
    }
  }

  const totalPrice = input.basePrice + addonsTotal;
  if (totalPrice <= 0) {
    throw new BadRequestException('Booking total must be greater than zero');
  }

  return { totalPrice, addons };
}
